import React, { useCallback, useEffect, useRef, useState } from 'react';
import { db, REGION_LABELS } from '../services/databaseService';
import type { Product, Session, SessionVideo } from '../services/databaseService';
import { applySessionVideoMutation, commitSessionVideoMutation } from '../utils/sessionVideoMutations';
import { prepareSessionUploadFile } from '../utils/prepareSessionUploadFile';
import { runSessionUpload, uploadErrorCode } from '../utils/sessionUploadWorkflow';
import type { UploadCheckpoint, UploadDiagnostic } from '../utils/sessionUploadWorkflow';
import type { SessionVideoMutation } from '../utils/sessionVideoMutations';
import { ArrowLeft, Trash2, RefreshCw, UploadCloud, Scissors, Play, Pause, Volume2, VolumeX, Edit2, Check, X as XIcon } from 'lucide-react';
import { useT } from '../context/LanguageContext';

interface SessionDetailModalProps {
  session: Session;
  onClose: () => void;
  onDeleted: () => void;
  /**
   * When set, this modal is being opened from inside a product's Clips tab rather than the
   * standalone Clips nav. Session.productIds is an array — a session can be linked to several
   * products — so "delete" here must not destroy a session another product still relies on.
   * See the delete/unlink decision next to handleDeleteOrUnlink below.
   */
  scopedProductId?: string;
}

interface VideoMetadata {
  duration: number;
  thumbnailBlob: Blob | null;
}

// Reads duration + captures a real thumbnail frame from the LOCAL file (fast: no network,
// works even for phone-recorded videos whose moov atom sits at the end of the file, which
// would otherwise force the browser to download the whole file just to seek/show a frame).
// Accepts an already-created object URL so the caller controls the lifecycle.
function getVideoMetadataFromUrl(objectUrl: string, signal?: AbortSignal): Promise<VideoMetadata> {
  return new Promise(resolve => {
    const video = document.createElement('video');
    let settled = false;
    let duration = 0;
    const finish = (thumbnailBlob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      video.onloadedmetadata = video.onseeked = video.onerror = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      resolve({ duration, thumbnailBlob });
    };
    const cancel = () => finish(null);
    const timer = setTimeout(() => finish(null), 8000);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { finish(null); return; }
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = Math.min(0.1, duration || 0.1);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        canvas.toBlob(blob => finish(blob), 'image/jpeg', 0.75);
      } catch { finish(null); }
    };
    video.onerror = () => finish(null);
    video.src = objectUrl;
  });
}

// Traduce los errores de Firebase Storage a algo que el usuario pueda accionar. El texto crudo
// ("storage/retry-limit-exceeded: Max retry time for operation exceeded") es cierto pero no le
// dice a nadie qué hacer, y sin eso no hay forma de distinguir un problema de red de uno de permisos.
function describeUploadError(err: unknown): string {
  switch (uploadErrorCode(err)) {
    case 'upload/stalled': return 'La subida dejó de avanzar. Mantén la pantalla encendida y prueba con WiFi.';
    case 'storage/retry-limit-exceeded':
    case 'storage/network-request-failed': return 'La conexión se cortó. Intenta con WiFi.';
    case 'storage/unauthenticated': return 'Tu sesión expiró. Vuelve a entrar.';
    case 'storage/unauthorized':
    case 'permission-denied': return 'No tienes permiso para completar esta operación.';
    case 'storage/quota-exceeded': return 'Se agotó la cuota de almacenamiento.';
    case 'upload/file-probe-timeout':
    case 'upload/file-copy-timeout': return 'La lectura del archivo tardó demasiado tras 3 intentos. Puedes reintentar los fallidos o volver a seleccionarlo.';
    case 'upload/file-probe-read':
    case 'upload/file-copy-read': return 'No se pudo leer el archivo tras 3 intentos, aunque esté guardado en este dispositivo. Puedes reintentar los fallidos o volver a seleccionarlo.';
    default: return 'No se pudo completar esta fase. Puedes reintentar los fallidos.';
  }
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${String(m).padStart(2, '0')} : ${String(sec).padStart(2, '0')} . ${String(ms).padStart(2, '0')}`;
}

const TrimModal: React.FC<{
  video: SessionVideo;
  onClose: () => void;
  onSave: (trimStart: number, trimEnd: number) => void;
}> = ({ video, onClose, onSave }) => {
  const [trimStart, setTrimStart] = useState(video.trimStart);
  const [trimEnd, setTrimEnd] = useState(video.trimEnd);
  const [currentTime, setCurrentTime] = useState(video.trimStart);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const draggingRef = useRef<'start' | 'end' | null>(null);
  const trimStartRef = useRef(video.trimStart);
  const trimEndRef = useRef(video.trimEnd);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const duration = video.duration || 1;

  const seekTo = useCallback((t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  }, []);

  useEffect(() => { seekTo(trimStart); }, []);

  useEffect(() => {
    trimStartRef.current = trimStart;
    trimEndRef.current = trimEnd;
  }, [trimStart, trimEnd]);

  // Stop playback at trimEnd
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTimeUpdate = () => {
      setCurrentTime(v.currentTime);
      if (v.currentTime >= trimEndRef.current) {
        v.pause();
        v.currentTime = trimEndRef.current;
        setIsPlaying(false);
      }
    };
    v.addEventListener('timeupdate', onTimeUpdate);
    return () => v.removeEventListener('timeupdate', onTimeUpdate);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      if (v.currentTime >= trimEndRef.current) v.currentTime = trimStartRef.current;
      v.play();
      setIsPlaying(true);
    }
  };

  const clientXFromEvent = (e: MouseEvent | TouchEvent): number =>
    'touches' in e ? e.touches[0].clientX : e.clientX;

  const getPosFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  }, [duration]);

  const startDrag = (handle: 'start' | 'end') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    draggingRef.current = handle;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const t = getPosFromClientX(clientXFromEvent(ev));
      if (draggingRef.current === 'start') {
        const clamped = Math.min(t, trimEndRef.current - 0.1);
        trimStartRef.current = clamped;
        setTrimStart(clamped);
        seekTo(clamped);
      } else {
        const clamped = Math.max(t, trimStartRef.current + 0.1);
        trimEndRef.current = clamped;
        setTrimEnd(clamped);
        seekTo(clamped);
      }
    };
    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  const startPct = (trimStart / duration) * 100;
  const endPct = (trimEnd / duration) * 100;
  const currentPct = (currentTime / duration) * 100;

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: '#fff',
    border: '2px solid var(--primary)',
    cursor: 'grab',
    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
    zIndex: 2,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '420px',
          background: '#1a1a2e', borderRadius: '16px',
          overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.6)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '0.95rem', fontWeight: 600 }}>
            <Scissors size={16} color="var(--primary)" /> Trim
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '32px', height: '2px', background: 'var(--primary)', borderRadius: '2px' }} />
        </div>

        {/* Video preview */}
        <div style={{ padding: '0 1.25rem', background: '#111' }}>
          <video
            ref={videoRef}
            src={video.downloadUrl}
            muted={muted}
            playsInline
            style={{ width: '100%', maxHeight: '40vh', display: 'block', background: '#000' }}
          />
        </div>

        {/* Timestamp */}
        <div style={{ textAlign: 'center', padding: '0.75rem 0 0.5rem', color: '#fff', fontSize: '1rem', fontFamily: 'monospace', letterSpacing: '0.05em', background: '#111' }}>
          {formatTime(currentTime)}
        </div>

        {/* Trim track */}
        <div style={{ padding: '0.75rem 1.5rem 0.5rem', background: '#111' }}>
          {/* Track container */}
          <div
            ref={trackRef}
            style={{ position: 'relative', height: '28px', display: 'flex', alignItems: 'center' }}
          >
            {/* Full track */}
            <div style={{ position: 'absolute', left: 0, right: 0, height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '4px' }} />
            {/* Selected range */}
            <div style={{
              position: 'absolute',
              left: `${startPct}%`,
              width: `${endPct - startPct}%`,
              height: '4px',
              background: 'var(--primary)',
              borderRadius: '4px'
            }} />
            {/* Current position marker */}
            <div style={{
              position: 'absolute',
              left: `${currentPct}%`,
              transform: 'translateX(-50%)',
              width: '2px',
              height: '20px',
              background: '#fff',
              borderRadius: '2px',
              zIndex: 1,
              pointerEvents: 'none'
            }} />
            {/* Start handle */}
            <div style={{ ...handleStyle, left: `${startPct}%` }} onMouseDown={startDrag('start')} onTouchStart={startDrag('start')} />
            {/* End handle */}
            <div style={{ ...handleStyle, left: `${endPct}%` }} onMouseDown={startDrag('end')} onTouchStart={startDrag('end')} />
          </div>

          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button onClick={togglePlay} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', display: 'flex' }}>
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button onClick={() => { setMuted(m => !m); if (videoRef.current) videoRef.current.muted = !muted; }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', display: 'flex' }}>
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>
              {trimStart.toFixed(2)}s – {trimEnd.toFixed(2)}s
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem 1.25rem' }}>
          <button
            className="btn btn-primary"
            onClick={() => { onSave(trimStart, trimEnd); onClose(); }}
            style={{ flex: 1 }}
          >
            Save Trim
          </button>
          <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const VideoCard: React.FC<{
  video: SessionVideo;
  disabled: boolean;
  onRemove: () => void;
  onTrimSave: (trimStart: number, trimEnd: number) => void;
  onRetry?: () => void;
  onCancel?: () => void;
}> = ({ video, disabled, onRemove, onTrimSave, onRetry, onCancel }) => {
  const [showTrim, setShowTrim] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const thumbStyle: React.CSSProperties = {
    width: '100%',
    aspectRatio: '9/16',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: '#000'
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt={video.name} style={thumbStyle} />
        ) : (
          <video
            src={`${video.downloadUrl}#t=${Math.max(video.trimStart, 0.1)}`}
            preload="metadata"
            muted
            playsInline
            style={thumbStyle}
          />
        )}
        <div style={{
          position: 'absolute',
          bottom: '4px',
          left: '4px',
          background: 'rgba(0,0,0,0.6)',
          padding: '2px 4px',
          borderRadius: '4px',
          fontSize: '0.65rem',
          color: '#fff'
        }}>
          {video.duration}s{video.source === 'ai_generated' ? ' · AI' : ''}
        </div>
        {video.metadataStatus === 'processing' && (
          <>
            <div style={{
              position: 'absolute',
              top: '4px',
              left: '4px',
              background: 'rgba(99,102,241,0.85)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.6rem',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <RefreshCw size={9} className="loading-spinner" /> Analyzing
            </div>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  position: 'absolute', top: '4px', right: '30px',
                  background: 'rgba(239,68,68,0.85)', border: 'none',
                  borderRadius: '4px', padding: '2px 6px',
                  fontSize: '0.6rem', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '3px'
                }}
              >
                ✕ Cancel
              </button>
            )}
          </>
        )}
        {video.metadataStatus === 'ready' && (
          <div style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            background: 'rgba(16,185,129,0.85)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '0.6rem',
            color: '#fff'
          }}>
            ✓ Ready
          </div>
        )}
        {(!video.metadataStatus || video.metadataStatus === 'error') && onRetry && (
          <div style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {video.metadataStatus === 'error' && (
              <div style={{
                background: 'rgba(239,68,68,0.85)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.6rem',
                color: '#fff'
              }}>
                ✕ Error
              </div>
            )}
            <button
              type="button"
              onClick={onRetry}
              disabled={disabled}
              style={{
                background: video.metadataStatus === 'error' ? 'rgba(99,102,241,0.85)' : 'rgba(234,179,8,0.85)',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '0.6rem',
                color: '#fff',
                cursor: disabled ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <RefreshCw size={8} /> {video.metadataStatus === 'error' ? 'Retry' : 'Analyze'}
            </button>
          </div>
        )}
        {confirmDelete ? (
          <div style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => { setConfirmDelete(false); onRemove(); }}
              style={{
                background: 'rgba(239,68,68,0.9)',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 7px',
                fontSize: '0.6rem',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              style={{
                background: 'rgba(0,0,0,0.7)',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 7px',
                fontSize: '0.6rem',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={disabled}
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: 'rgba(0,0,0,0.6)',
              border: 'none',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--danger)',
              cursor: disabled ? 'default' : 'pointer'
            }}
          >
            <span style={{ fontSize: '1rem' }}>×</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowTrim(true)}
          disabled={disabled}
          title={`Trim (${video.trimStart.toFixed(1)}s–${video.trimEnd.toFixed(1)}s)`}
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            padding: '8px 14px',
            minHeight: '36px',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            cursor: disabled ? 'default' : 'pointer'
          }}
        >
          <Scissors size={16} /> Trim
        </button>
      </div>

      {showTrim && (
        <TrimModal
          video={video}
          onClose={() => setShowTrim(false)}
          onSave={(trimStart, trimEnd) => onTrimSave(trimStart, trimEnd)}
        />
      )}
    </div>
  );
};

export const SessionDetailModal: React.FC<SessionDetailModalProps> = ({ session, onClose, onDeleted, scopedProductId }) => {
  const t = useT();
  const [videos, setVideos] = useState<SessionVideo[]>(session.videos);
  const videosRef = useRef<SessionVideo[]>(session.videos);
  const [productIds, setProductIds] = useState<string[]>(session.productIds);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rename
  const [currentName, setCurrentName] = useState(session.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.name);
  const [isRenaming, setIsRenaming] = useState(false);

  // Deleting a session linked to other products would silently break those products' Clips
  // tab, so from inside a product we only hard-delete when this product is the session's last
  // link; otherwise we just unlink this product (arrayRemove), mirroring deleteProduct's own
  // "unlink, never delete" rule for the inverse relationship.
  const willOnlyUnlink = Boolean(scopedProductId) && productIds.filter(id => id !== scopedProductId).length > 0;

  // Upload queue state
  type UploadStatus = 'waiting' | 'uploading' | 'done' | 'error' | 'skipped';
  interface UploadItem {
    name: string;
    status: UploadStatus;
    progress: number; // 0–100
    errorMsg?: string;
    detail?: string;
  }
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  // Los errores llevan su mensaje: la cola por archivo se vacía al terminar el lote, así que si
  // el resumen solo guardara nombres se perdería el motivo y no habría nada que diagnosticar.
  const [uploadSummary, setUploadSummary] = useState<{ uploaded: string[]; skipped: string[]; errors: { name: string; message: string }[] } | null>(null);
  const [isUploading, setBatchUploading] = useState(false);
  const batchLock = useRef(false);
  const mounted = useRef(true);
  const activeScope = useRef(`${session.userId}:${session.id}`);
  const batchCleanup = useRef<null | (() => void)>(null);
  type PendingUpload = { file: File; checkpoint: UploadCheckpoint; name: string; createdAt: string; failed: boolean; aiStarted: boolean };
  const checkpoints = useRef(new Map<string, PendingUpload>());
  const failedFilesRef = useRef(new Map<string, File>());
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const diagnostics = useRef<UploadDiagnostic[]>([]);
  const [uploadDiagnostics, setUploadDiagnostics] = useState<UploadDiagnostic[]>([]);
  useEffect(() => {
    mounted.current = true;
    activeScope.current = `${session.userId}:${session.id}`;
    const pending = checkpoints.current;
    const failed = failedFilesRef.current;
    return () => { mounted.current = false; batchCleanup.current?.(); pending.clear(); failed.clear(); };
  }, [session.id, session.userId]);

  useEffect(() => {
    db.getProducts().then(setAllProducts).catch(() => {});
  }, []);

  const toggleProductLink = async (productId: string) => {
    const updated = productIds.includes(productId)
      ? productIds.filter(id => id !== productId)
      : [...productIds, productId];

    setIsSaving(true);
    setError('');
    try {
      await db.updateSession(session.id, { productIds: updated });
      setProductIds(updated);
    } catch (err: any) {
      setError('Failed to update linked products: ' + (err.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  const pendingVideoSaves = useRef(0);

  const saveVideoMutation = (save: Promise<SessionVideoMutation | null>) => {
    const scope = `${session.userId}:${session.id}`;
    return commitSessionVideoMutation(save, mutation => {
      if (!mounted.current || activeScope.current !== scope) return;
      // An older save can finish after another clip was added, trimmed or deleted.
      // Merge only this operation into the CURRENT state, never its snapshot array.
      const updated = applySessionVideoMutation(videosRef.current, mutation);
      videosRef.current = updated;
      setVideos(updated);
    });
  };

  const persistVideo = async (save: Promise<SessionVideoMutation | null>) => {
    const scope = `${session.userId}:${session.id}`;
    const live = () => mounted.current && activeScope.current === scope;
    pendingVideoSaves.current++;
    if (live()) setIsSaving(true);
    try {
      return await saveVideoMutation(save);
    } catch (err) {
      if (live()) setError('Failed to save video: ' + (err instanceof Error ? err.message : String(err)));
      return false;
    } finally {
      pendingVideoSaves.current--;
      if (live()) setIsSaving(pendingVideoSaves.current > 0);
    }
  };

  const triggerMetadataExtraction = async (videoId: string, downloadUrl: string, name: string, duration: number) => {
    // Capture the original operation context: closing/changing the modal only stops UI
    // updates, not persistence. The service transaction still validates session ownership.
    const sessionId = session.id;
    const scope = `${session.userId}:${sessionId}`;
    const live = () => mounted.current && activeScope.current === scope;
    if (!live()) return;
    let metadata;
    try {
      metadata = await db.extractVideoMetadata(sessionId, videoId, downloadUrl, name, duration);
    } catch {
      await persistVideo(db.patchSessionVideo(sessionId, videoId, { metadataStatus: 'error' }, { ifMetadataStatus: 'processing' }));
      return;
    }
    // A failed save is NOT an extraction failure or a local 'ready' result.
    await persistVideo(db.patchSessionVideo(sessionId, videoId,
      { metadataStatus: 'ready', aiMetadata: metadata }, { ifMetadataStatus: 'processing' }));
  };

  const handleRetryMetadata = async (video: SessionVideo) => {
    setError('');
    if (await persistVideo(db.patchSessionVideo(session.id, video.id, { metadataStatus: 'processing' }))) {
      await triggerMetadataExtraction(video.id, video.downloadUrl, video.name, video.duration);
    }
  };

  const handleFilesSelected = async (fileList: FileList | File[] | null, retryFailed = false) => {
    if (batchLock.current || !fileList?.length) return;
    const files = Array.from(fileList).filter(f => f.type.startsWith('video/'));
    if (!files.length) { setError('Select video files (mp4, mov, etc.)'); return; }
    batchLock.current = true; // Synchronous: reject two callbacks before React re-renders.
    setBatchUploading(true);
    const scope = `${session.userId}:${session.id}`;
    const live = () => mounted.current && activeScope.current === scope;
    const summary = { uploaded: [] as string[], skipped: [] as string[], errors: [] as { name: string; message: string }[] };
    const seen = new Map(videosRef.current.map(v => [v.name, v.id]));
    const releaseName = (name: string) => {
      for (const [key, pending] of checkpoints.current) {
        if (pending.name === name) checkpoints.current.delete(key);
      }
      for (const [key, file] of failedFilesRef.current) {
        if (file.name === name) failedFilesRef.current.delete(key);
      }
    };
    const batchNames = new Set<string>();
    const entries = files.map(file => {
      const key = JSON.stringify([scope, file.name, file.size, file.lastModified]);
      const previous = checkpoints.current.get(key);
      const sameRegistration = retryFailed && previous?.checkpoint.id === seen.get(file.name);
      const skip = batchNames.has(file.name) || (seen.has(file.name) && !sameRegistration) || Boolean(previous?.checkpoint.registered);
      batchNames.add(file.name);
      return { file, key, skip };
    });
    const queue: UploadItem[] = entries.map(({ file, skip }) => ({ name: file.name, status: skip ? 'skipped' : 'waiting', progress: 0 }));
    const updateItem = (index: number, patch: Partial<UploadItem>) => {
      if (live()) setUploadQueue(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
    };
    let wakeLock: null | { release: () => Promise<void> } = null;
    let acquiringWakeLock = false;
    let finished = false;
    const controller = new AbortController();
    const acquireWakeLock = async () => {
      if (finished || acquiringWakeLock || wakeLock) return;
      acquiringWakeLock = true;
      try {
        if ('wakeLock' in navigator) {
          const lock = await (navigator as any).wakeLock.request('screen');
          if (finished || !live()) await lock.release();
          else { wakeLock = lock; lock.addEventListener?.('release', () => { if (wakeLock === lock) wakeLock = null; }, { once: true }); }
        }
      } catch { /* screen-on is best effort, not background upload support */ }
      finally { acquiringWakeLock = false; }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void acquireWakeLock(); };
    const cleanup = () => {
      finished = true;
      controller.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void wakeLock?.release().catch(() => {});
      wakeLock = null;
    };
    batchCleanup.current = cleanup;
    try {
      setError('');
      setUploadSummary(null);
      setUploadQueue(queue);
      document.addEventListener('visibilitychange', onVisibilityChange);
      void acquireWakeLock();
      for (let i = 0; i < entries.length && live(); i++) {
        const { file, key, skip } = entries[i];
        const name = file.name;
        if (skip) {
          summary.skipped.push(name);
          if (videosRef.current.some(video => video.name === name)) releaseName(name);
          continue;
        }
        let entry = checkpoints.current.get(key);
        let objectUrl = '';
        let blob: File | Blob = file;
        let bytes = entry?.checkpoint.transferred ? file.size : 0;
        try {
          if (!entry) {
            const checkpoint = db.createSessionVideoUpload(session.id);
            if (checkpoint.userId !== session.userId) {
              throw Object.assign(new Error('Session owner changed'), { code: 'storage/unauthorized' });
            }
            entry = { file, checkpoint, name, createdAt: new Date().toISOString(), failed: false, aiStarted: false };
            checkpoints.current.set(key, entry);
          }
          const current = entry;
          db.assertSessionVideoUploadOwner(current.checkpoint);
          updateItem(i, { status: 'uploading', progress: current.checkpoint.transferred ? 100 : 0 });
          const reportUpload = (event: UploadDiagnostic) => {
            diagnostics.current = [...diagnostics.current, event].slice(-80);
            if (live()) setUploadDiagnostics([...diagnostics.current]);
            updateItem(i, { detail: `${event.phase} · intento ${event.attempt}/3${event.retry ? ' · reintentando…' : ''} · ${event.code}` });
          };
          // One bounded copy at a time, reused by all transfer retries, never checkpointed.
          if (!current.checkpoint.transferred) {
            blob = await prepareSessionUploadFile(file, controller.signal, event => reportUpload({
              ...event, clipId: current.checkpoint.id, bytes: 0,
            }));
          }
          await runSessionUpload(current.checkpoint, {
            transfer: async cp => {
              if (!live()) throw Object.assign(new Error('modal closed'), { code: 'upload/canceled' });
              await db.transferSessionVideoFile(cp, blob, pct => {
                bytes = Math.round(file.size * pct / 100);
                updateItem(i, { progress: pct });
              }, controller.signal);
            },
            getUrl: cp => {
              if (!live()) throw Object.assign(new Error('modal closed'), { code: 'upload/canceled' });
              return db.getSessionVideoDownloadURL(cp);
            },
            register: async cp => {
              if (!live()) throw Object.assign(new Error('modal closed'), { code: 'upload/canceled' });
              db.assertSessionVideoUploadOwner(cp);
              const baseVid: SessionVideo = { id: cp.id, name: current.name, downloadUrl: cp.downloadUrl!,
                duration: 0, source: 'recorded', trimStart: 0, trimEnd: 0,
                createdAt: current.createdAt, metadataStatus: 'processing' };
              // A null add acknowledges this stable ID already exists (e.g. response lost
              // after commit). Publish the confirmed clip without replacing local edits.
              await saveVideoMutation(db.addSessionVideo(session.id, baseVid).then(mutation =>
                mutation ?? { type: 'add' as const, video: baseVid }));
            },
            bytes: () => bytes,
            report: reportUpload,
          });
          current.failed = false;
          if (!live()) break;
          summary.uploaded.push(name);
          updateItem(i, { status: 'done', progress: 100, errorMsg: undefined, detail: 'Preparando duración y miniatura…' });
          let duration = 0;
          try {
            objectUrl = URL.createObjectURL(blob);
            const metadata = await getVideoMetadataFromUrl(objectUrl, controller.signal);
            duration = metadata.duration;
            if (!live()) break;
            let thumbnailUrl: string | undefined;
            if (metadata.thumbnailBlob) {
              try { thumbnailUrl = await db.uploadSessionThumbnail(session.id, metadata.thumbnailBlob); }
              catch { if (live()) setError('Video registrado; no se pudo subir la miniatura.'); }
            }
            if (live()) await saveVideoMutation(db.enrichSessionVideo(session.id, current.checkpoint.id, duration, thumbnailUrl));
          } catch { if (live()) setError('Video registrado; no se pudo guardar la duración o miniatura.'); }
          if (live() && !current.aiStarted) {
            current.aiStarted = true;
            // Existing extraction only. The batch never waits for paid AI completion.
            void triggerMetadataExtraction(current.checkpoint.id, current.checkpoint.downloadUrl!, name, duration);
          }
          releaseName(name); // Release successful and redundant same-name File references.
        } catch (err) {
          if (entry) entry.failed = true;
          if (live()) failedFilesRef.current.set(key, file);
          const code = uploadErrorCode(err);
          const pending = entry?.checkpoint.transferred ? 'bytes del video subidos; registro pendiente. ' : '';
          const msg = pending + describeUploadError(err) + ` (${code})`;
          updateItem(i, { status: 'error', errorMsg: msg });
          summary.errors.push({ name, message: msg });
        } finally {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
      }
    } finally {
      cleanup();
      batchCleanup.current = null;
      if (live()) {
        setUploadSummary(summary);
        setUploadQueue([]);
        setFailedFiles(Array.from(failedFilesRef.current.values()));
        if (fileInputRef.current) fileInputRef.current.value = '';
        setBatchUploading(false);
      }
      batchLock.current = false; // Release only after enrichment and queue cleanup.
    }
  };

  const handleRemoveVideo = async (id: string) => {
    setError('');
    await persistVideo(db.removeSessionVideo(session.id, id));
  };

  const handleTrimSave = async (id: string, trimStart: number, trimEnd: number) => {
    setError('');
    await persistVideo(db.patchSessionVideo(session.id, id, { trimStart, trimEnd }));
  };

  const handleRename = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === currentName) {
      setIsEditingName(false);
      setNameDraft(currentName);
      return;
    }
    setIsRenaming(true);
    setError('');
    try {
      await db.updateSession(session.id, { name: trimmed });
      setCurrentName(trimmed);
      setIsEditingName(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(t.rename_session_failed + msg);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteOrUnlink = async () => {
    setIsDeleting(true);
    setError('');

    try {
      if (willOnlyUnlink && scopedProductId) {
        const updated = productIds.filter(id => id !== scopedProductId);
        await db.updateSession(session.id, { productIds: updated });
      } else {
        await db.deleteSession(session.id);
      }
      onDeleted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError((willOnlyUnlink ? t.remove_from_product_failed : t.delete_session_failed) + msg);
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          onClick={onClose}
          aria-label={t.cancel}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={24} />
        </button>
        {isEditingName ? (
          <div style={{ flex: 1, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input
              type="text"
              className="form-input"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              disabled={isRenaming}
              autoFocus
              aria-label={t.session_name}
              style={{ flex: 1, fontSize: '1rem', padding: '0.4rem 0.6rem' }}
            />
            <button
              onClick={handleRename}
              disabled={isRenaming}
              aria-label={t.save}
              style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: isRenaming ? 'default' : 'pointer', padding: 0, minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Check size={20} />
            </button>
            <button
              onClick={() => { setIsEditingName(false); setNameDraft(currentName); }}
              disabled={isRenaming}
              aria-label={t.cancel}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: isRenaming ? 'default' : 'pointer', padding: 0, minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <XIcon size={20} />
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: '1.25rem', margin: 0, lineHeight: 1.3, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentName}</h2>
            <button
              onClick={() => { setNameDraft(currentName); setIsEditingName(true); }}
              aria-label={t.rename_session}
              title={t.rename_session}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <Edit2 size={18} />
            </button>
          </>
        )}
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid var(--danger)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          color: 'var(--danger)',
          fontSize: '0.85rem'
        }}>
          {error}
        </div>
      )}

      {/* Videos */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label className="form-label">Videos ({videos.length})</label>

        {(() => {
          const unanalyzed = videos.filter(v => !v.metadataStatus || v.metadataStatus === 'error');
          if (unanalyzed.length === 0) return null;
          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)',
              borderRadius: '8px', padding: '0.6rem 0.75rem', marginTop: '0.5rem', gap: '0.75rem'
            }}>
              <span style={{ fontSize: '0.78rem', color: '#eab308' }}>
                {unanalyzed.length} video{unanalyzed.length > 1 ? 's' : ''} without AI analysis
              </span>
              <button
                type="button"
                disabled={isSaving}
                onClick={async () => {
                  await Promise.all(unanalyzed.map(handleRetryMetadata));
                }}
                style={{
                  background: 'rgba(234,179,8,0.2)', border: '1px solid rgba(234,179,8,0.4)',
                  borderRadius: '6px', padding: '3px 10px', fontSize: '0.72rem',
                  color: '#eab308', cursor: isSaving ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap'
                }}
              >
                <RefreshCw size={10} /> Analyze All
              </button>
            </div>
          );
        })()}

        {videos.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>
            No videos in this session yet.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem' }}
            className="video-thumb-grid"
          >
            {videos.map(video => (
              <VideoCard
                key={video.id}
                video={video}
                disabled={isSaving}
                onRemove={() => handleRemoveVideo(video.id)}
                onTrimSave={(trimStart, trimEnd) => handleTrimSave(video.id, trimStart, trimEnd)}
                onRetry={(!video.metadataStatus || video.metadataStatus === 'error')
                  ? () => handleRetryMetadata(video) : undefined}
                onCancel={video.metadataStatus === 'processing' ? async () => {
                  setError('');
                  await persistVideo(db.patchSessionVideo(session.id, video.id, {}, { clearMetadataStatus: true }));
                } : undefined}
              />
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
          {/* Drop zone */}
          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!isUploading) setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              if (!isUploading) handleFilesSelected(e.dataTransfer.files);
            }}
            style={{
              border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: '10px',
              padding: '1.5rem 1rem',
              textAlign: 'center',
              cursor: isUploading ? 'default' : 'pointer',
              background: isDragging ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
              transition: 'all 0.15s ease'
            }}
          >
            {isUploading ? (
              <><UploadCloud size={22} style={{ marginBottom: '4px', color: 'var(--primary)' }} /><div>Subiendo videos…</div></>
            ) : (
              <><UploadCloud size={22} style={{ marginBottom: '4px', color: 'var(--primary)' }} /><div>Arrastra o toca aquí para agregar videos</div></>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              multiple
              onChange={e => handleFilesSelected(e.target.files)}
              style={{ display: 'none' }}
            />
          </div>

          {/* Screen-on warning while uploading */}
          {isUploading && (
            <div style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 8, padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#eab308', fontWeight: 600 }}>
              ⚠️ Mantén la pantalla encendida hasta que terminen todos los videos
            </div>
          )}

          {/* Upload queue progress */}
          {uploadQueue.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {uploadQueue.map((item, idx) => (
                <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: item.status === 'uploading' ? '0.35rem' : 0 }}>
                    {item.status === 'uploading' && <RefreshCw size={12} className="loading-spinner" style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                    {item.status === 'done'     && <span style={{ color: '#10b981', fontSize: '0.75rem', flexShrink: 0 }}>✓</span>}
                    {item.status === 'error'    && <span style={{ color: '#ef4444', fontSize: '0.75rem', flexShrink: 0 }}>✗</span>}
                    {item.status === 'skipped'  && <span style={{ color: '#eab308', fontSize: '0.75rem', flexShrink: 0 }}>—</span>}
                    {item.status === 'waiting'  && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }}>·</span>}
                    <span style={{ flex: 1, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: item.status === 'error' ? '#ef4444' : item.status === 'skipped' ? '#eab308' : 'var(--text-secondary)' }}>
                      {item.name}
                    </span>
                    {item.status === 'uploading' && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--primary)', flexShrink: 0 }}>{item.progress}%</span>
                    )}
                    {item.status === 'skipped' && (
                      <span style={{ fontSize: '0.65rem', color: '#eab308', flexShrink: 0 }}>ya existe</span>
                    )}
                    {item.status === 'error' && item.errorMsg && (
                      <span style={{ fontSize: '0.65rem', color: '#ef4444', flexShrink: 0 }}>{item.errorMsg}</span>
                    )}
                  </div>
                  {item.detail && <div role="status" style={{ fontSize: '0.7rem' }}>{item.detail}</div>}
                  {item.status === 'uploading' && (
                    <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${item.progress}%`, background: 'var(--primary)', borderRadius: 4, transition: 'width 0.2s ease' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {failedFiles.length > 0 && (
            <button type="button" disabled={isUploading} onClick={() => handleFilesSelected(failedFiles, true)}>Reintentar fallidos</button>
          )}
          {uploadDiagnostics.length > 0 && (
            <details>
              <summary>Diagnóstico de subida (últimos 80 eventos; solo esta ventana)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem' }}>{JSON.stringify(uploadDiagnostics, null, 2)}</pre>
            </details>
          )}
          {/* Upload summary */}
          {uploadSummary && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.78rem' }}>
              {uploadSummary.uploaded.length > 0 && (
                <div style={{ color: 'var(--success)', marginBottom: '0.25rem' }}>✓ Subidos ({uploadSummary.uploaded.length}): {uploadSummary.uploaded.join(', ')}</div>
              )}
              {uploadSummary.skipped.length > 0 && (
                <div style={{ color: 'var(--warning)', marginBottom: '0.25rem' }}>— Ya existían ({uploadSummary.skipped.length}): {uploadSummary.skipped.join(', ')}</div>
              )}
              {uploadSummary.errors.length > 0 && (
                <div style={{ color: 'var(--danger)' }}>
                  <div style={{ marginBottom: '0.35rem' }}>✗ Error ({uploadSummary.errors.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {uploadSummary.errors.map(e => (
                      <div key={e.name} style={{ paddingLeft: '0.75rem', borderLeft: '2px solid var(--danger)' }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: '0.75rem' }}>{e.name}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', wordBreak: 'break-word' }}>{e.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setUploadSummary(null)} style={{ marginTop: '0.4rem', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.68rem', cursor: 'pointer', padding: 0 }}>Cerrar</button>
            </div>
          )}
        </div>
      </div>

      {/* Linked products */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label className="form-label">Linked Products ({productIds.length})</label>
        {allProducts.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>
            No products yet.
          </p>
        ) : (() => {
          const regionOrder = Object.keys(REGION_LABELS);
          const grouped: Record<string, Product[]> = {};
          for (const p of allProducts) {
            const key = p.region && REGION_LABELS[p.region] ? p.region : '__other__';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(p);
          }
          const groupKeys = [
            ...regionOrder.filter(k => grouped[k]),
            ...(grouped['__other__'] ? ['__other__'] : [])
          ];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
              {groupKeys.map(key => (
                <div key={key}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.35rem' }}>
                    {key === '__other__' ? t.other_region : REGION_LABELS[key]}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {grouped[key].map(p => {
                      const linked = productIds.includes(p.id);
                      const thumb = p.modelSheetUrls?.[0];
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleProductLink(p.id)}
                          disabled={isSaving}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            width: '100%',
                            textAlign: 'left',
                            padding: '6px 10px 6px 6px',
                            borderRadius: '10px',
                            border: `1px solid ${linked ? 'var(--primary)' : 'var(--border)'}`,
                            background: linked ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                            cursor: isSaving ? 'default' : 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                            />
                          ) : (
                            <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                              📦
                            </div>
                          )}
                          <span style={{ fontSize: '0.78rem', fontWeight: linked ? 600 : 400, color: linked ? '#fff' : 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </span>
                          {linked && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Delete (or unlink, if scoped to a product with other links) session */}
      {showDeleteConfirm ? (
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-danger"
            onClick={handleDeleteOrUnlink}
            disabled={isDeleting}
            style={{ flex: 1, minHeight: '44px' }}
          >
            {isDeleting ? <><RefreshCw size={16} className="loading-spinner" /> {t.deleting}</> : (willOnlyUnlink ? t.confirm_remove : t.confirm_delete)}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowDeleteConfirm(false)}
            disabled={isDeleting}
            style={{ flex: 1, minHeight: '44px' }}
          >
            {t.cancel}
          </button>
        </div>
      ) : (
        <button
          className="btn btn-danger"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isDeleting}
          style={{
            width: '100%',
            minHeight: '44px',
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            cursor: isDeleting ? 'default' : 'pointer'
          }}
        >
          <Trash2 size={16} /> {willOnlyUnlink ? t.remove_from_product : t.delete_session_label}
        </button>
      )}
    </>
  );
};
