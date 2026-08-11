import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { db, REGION_LABELS } from '../services/databaseService';
import type { Product, Session, SessionVideo } from '../services/databaseService';
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
function getVideoMetadataFromUrl(objectUrl: string): Promise<VideoMetadata> {
  const probe = new Promise<VideoMetadata>(resolve => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0.1);
    };
    video.onseeked = () => {
      const duration = video.duration || 0;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        canvas.toBlob(blob => resolve({ duration, thumbnailBlob: blob }), 'image/jpeg', 0.75);
      } catch {
        resolve({ duration, thumbnailBlob: null });
      }
    };
    video.onerror = () => resolve({ duration: 0, thumbnailBlob: null });
    video.src = objectUrl;
  });
  const timeout = new Promise<VideoMetadata>(resolve => setTimeout(() => resolve({ duration: 0, thumbnailBlob: null }), 8000));
  return Promise.race([probe, timeout]);
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
  }
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [uploadSummary, setUploadSummary] = useState<{ uploaded: string[]; skipped: string[]; errors: string[] } | null>(null);
  const isUploading = useMemo(() => uploadQueue.some(u => u.status === 'waiting' || u.status === 'uploading'), [uploadQueue]);

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

  const applyVideos = (updated: SessionVideo[]) => {
    videosRef.current = updated;
    setVideos(updated);
  };

  const persistVideos = async (updated: SessionVideo[]) => {
    setIsSaving(true);
    setError('');
    try {
      await db.updateSession(session.id, { videos: updated });
      applyVideos(updated);
    } catch (err: any) {
      setError('Failed to save video: ' + (err.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  const triggerMetadataExtraction = (videoId: string, downloadUrl: string, name: string, duration: number) => {
    db.extractVideoMetadata(session.id, videoId, downloadUrl, name, duration)
      .then(metadata => {
        const updated = videosRef.current.map(v =>
          v.id === videoId ? { ...v, metadataStatus: 'ready' as const, aiMetadata: metadata } : v
        );
        applyVideos(updated);
        db.updateSession(session.id, { videos: updated });
      })
      .catch(() => {
        const updated = videosRef.current.map(v =>
          v.id === videoId ? { ...v, metadataStatus: 'error' as const } : v
        );
        applyVideos(updated);
        db.updateSession(session.id, { videos: updated });
      });
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList).filter(f => f.type.startsWith('video/'));
    if (files.length === 0) {
      setError('Select video files (mp4, mov, etc.)');
      return;
    }

    setError('');
    setUploadSummary(null);

    const existingNames = new Set(videosRef.current.map(v => v.name));

    // Pre-read all file contents into memory BEFORE any await.
    // On iOS Safari, File objects from a FileList become inaccessible after the
    // first async suspension, so reads on files[1..n] fail with "invalid state".
    type FileEntry = { name: string; blob: Blob; objectUrl: string };
    const fileEntries: FileEntry[] = files.map(f => ({
      name: f.name,
      blob: f.slice(0),   // Blob copy fully owned by JS
      objectUrl: URL.createObjectURL(f),
    }));

    // Initialize queue — duplicates already marked as skipped
    const queue: UploadItem[] = fileEntries.map(fe => ({
      name: fe.name,
      status: existingNames.has(fe.name) ? 'skipped' : 'waiting',
      progress: 0,
    }));
    setUploadQueue(queue);

    const summary = { uploaded: [] as string[], skipped: [] as string[], errors: [] as string[] };

    // Collect skipped
    queue.forEach(item => { if (item.status === 'skipped') summary.skipped.push(item.name); });

    const updateItem = (index: number, patch: Partial<UploadItem>) => {
      setUploadQueue(prev => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    };

    // ── Keep screen on ────────────────────────────────────────────────────────
    // Strategy 1: Screen Wake Lock API
    const wl = { lock: null as null | { release: () => Promise<void> } };
    const acquireWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) wl.lock = await (navigator as any).wakeLock.request('screen');
      } catch (_) { /* not supported or denied */ }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') acquireWakeLock(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    await acquireWakeLock();

    // Strategy 2: Silent AudioContext (prevents Chrome from backgrounding when screen dims)
    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0; // completely silent
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
    } catch (_) { /* not supported */ }

    for (let i = 0; i < fileEntries.length; i++) {
      if (queue[i].status === 'skipped') continue;

      const { name, blob, objectUrl } = fileEntries[i];
      updateItem(i, { status: 'uploading', progress: 0 });

      try {
        // Retry upload up to 3 times on transient network errors
        let downloadUrl = '';
        let lastUploadErr: any;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            updateItem(i, { progress: 0 });
            downloadUrl = await db.uploadSessionVideoFile(session.id, blob, name, pct => updateItem(i, { progress: pct }));
            lastUploadErr = null;
            break;
          } catch (e: any) {
            lastUploadErr = e;
            if (attempt < 2) {
              const reason = e?.message === 'upload_stalled' ? 'sin progreso 30s' : 'error de red';
              updateItem(i, { errorMsg: `Reintentando (${attempt + 2}/3) — ${reason}…` });
              await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            }
          }
        }
        if (lastUploadErr) throw lastUploadErr;

        // A partir de aquí los bytes YA están en Storage. Todo lo que sigue (leer la duración,
        // generar y subir la miniatura) es opcional y puede fallar en un celular con un archivo
        // grande: la pestaña se suspende, se queda sin memoria, o se corta la red. Antes esos
        // fallos tiraban el video entero aunque la subida hubiera terminado, dejando el archivo
        // huérfano en Storage y al usuario creyendo que "no subió". Por eso se registra PRIMERO
        // con lo mínimo y se enriquece después.
        const videoId = `vid_${Math.random().toString(36).substring(2, 9)}`;
        const baseVid: SessionVideo = {
          id: videoId,
          name,
          downloadUrl,
          duration: 0,
          source: 'recorded',
          trimStart: 0,
          trimEnd: 0,
          createdAt: new Date().toISOString(),
          metadataStatus: 'processing' as const,
        };
        const merged = [...videosRef.current, baseVid];
        await db.updateSession(session.id, { videos: merged });
        applyVideos(merged);

        updateItem(i, { status: 'done', progress: 100, errorMsg: undefined });
        summary.uploaded.push(name);

        // Duración y miniatura: si fallan, el clip se queda registrado igual y se puede
        // reintentar el análisis desde la tarjeta.
        try {
          const { duration, thumbnailBlob } = await getVideoMetadataFromUrl(objectUrl);
          const thumbnailUrl = thumbnailBlob
            ? await db.uploadSessionThumbnail(session.id, thumbnailBlob)
            : undefined;

          const enriched = videosRef.current.map(v => v.id === videoId
            ? { ...v, duration, trimEnd: duration || 0, ...(thumbnailUrl && { thumbnailUrl }) }
            : v);
          await db.updateSession(session.id, { videos: enriched });
          applyVideos(enriched);
        } catch (metaErr) {
          console.error('No se pudo generar la miniatura o leer la duración:', metaErr);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }

        triggerMetadataExtraction(videoId, downloadUrl, name, 0);
      } catch (err: any) {
        URL.revokeObjectURL(objectUrl);
        const msg = err?.code ? `${err.code}: ${err.message}` : (err?.message || 'Error desconocido');
        updateItem(i, { status: 'error', errorMsg: msg });
        summary.errors.push(name);
      }
    }

    document.removeEventListener('visibilitychange', onVisibilityChange);
    wl.lock?.release().catch(() => {});
    audioCtx?.close().catch(() => {});

    setUploadSummary(summary);
    setUploadQueue([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveVideo = (id: string) => {
    persistVideos(videos.filter(v => v.id !== id));
  };

  const handleTrimSave = (id: string, trimStart: number, trimEnd: number) => {
    persistVideos(videos.map(v => (v.id === id ? { ...v, trimStart, trimEnd } : v)));
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
                onClick={() => {
                  const updated = videosRef.current.map(x =>
                    unanalyzed.some(u => u.id === x.id) ? { ...x, metadataStatus: 'processing' as const } : x
                  );
                  applyVideos(updated);
                  db.updateSession(session.id, { videos: updated });
                  unanalyzed.forEach(v => triggerMetadataExtraction(v.id, v.downloadUrl, v.name, v.duration));
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
                onRetry={(!video.metadataStatus || video.metadataStatus === 'error') ? () => {
                  const updated = videosRef.current.map(v => v.id === video.id ? { ...v, metadataStatus: 'processing' as const } : v);
                  applyVideos(updated);
                  db.updateSession(session.id, { videos: updated });
                  triggerMetadataExtraction(video.id, video.downloadUrl, video.name, video.duration);
                } : undefined}
                onCancel={video.metadataStatus === 'processing' ? () => {
                  const updated = videosRef.current.map(v => v.id === video.id ? { ...v, metadataStatus: undefined } : v);
                  applyVideos(updated);
                  db.updateSession(session.id, { videos: updated });
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
                  {item.status === 'uploading' && (
                    <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${item.progress}%`, background: 'var(--primary)', borderRadius: 4, transition: 'width 0.2s ease' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upload summary */}
          {uploadSummary && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.78rem' }}>
              {uploadSummary.uploaded.length > 0 && (
                <div style={{ color: '#10b981', marginBottom: '0.25rem' }}>✓ Subidos ({uploadSummary.uploaded.length}): {uploadSummary.uploaded.join(', ')}</div>
              )}
              {uploadSummary.skipped.length > 0 && (
                <div style={{ color: '#eab308', marginBottom: '0.25rem' }}>— Ya existían ({uploadSummary.skipped.length}): {uploadSummary.skipped.join(', ')}</div>
              )}
              {uploadSummary.errors.length > 0 && (
                <div style={{ color: '#ef4444' }}>✗ Error ({uploadSummary.errors.length}): {uploadSummary.errors.join(', ')}</div>
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
