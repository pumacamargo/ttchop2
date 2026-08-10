import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../services/databaseService';
import type { Render } from '../services/databaseService';
import { RefreshCw, Sparkles, Scissors, Layers, Play, Trash2, AlertTriangle, Clock, CheckCircle, Share2 } from 'lucide-react';
import { useT } from '../context/LanguageContext';

const isStorageUrl = (url: string) =>
  url.includes('firebasestorage.googleapis.com') ||
  url.includes('lemonsushi.com');

const StatusBadge: React.FC<{ status: Render['status'] }> = ({ status }) => {
  const t = useT();
  const config = {
    pending:    { color: '#eab308', bg: 'rgba(234,179,8,0.12)',    icon: <Clock size={10} />,                          label: t.status_pending },
    processing: { color: 'var(--primary)', bg: 'rgba(109,59,215,0.12)', icon: <RefreshCw size={10} className="loading-spinner" />, label: t.status_processing },
    done:       { color: 'var(--success)', bg: 'rgba(16,185,129,0.12)', icon: <CheckCircle size={10} />,               label: t.status_done },
    failed:     { color: 'var(--danger)',  bg: 'rgba(239,68,68,0.12)',  icon: <AlertTriangle size={10} />,             label: t.status_failed },
  }[status];

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      background: config.bg, color: config.color,
      padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600
    }}>
      {config.icon} {config.label}
    </span>
  );
};

const RenderCard: React.FC<{ render: Render; onDelete: (id: string) => void; archiving?: boolean }> = ({ render, onDelete, archiving }) => {
  const t = useT();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    if (!render.videoUrl) return;
    navigator.clipboard.writeText(render.videoUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    await db.deleteRender(render.id);
    onDelete(render.id);
  };

  return (
    <div className="glass-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Type badge inline before name */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700,
            marginBottom: '5px',
            background: render.type === 'ai' ? 'rgba(168,85,247,0.18)' : render.type === 'overlay' ? 'rgba(245,158,11,0.18)' : 'rgba(6,182,212,0.18)',
            color: render.type === 'ai' ? 'var(--accent)' : render.type === 'overlay' ? '#f59e0b' : 'var(--secondary)',
            border: render.type === 'ai' ? '1px solid rgba(168,85,247,0.35)' : render.type === 'overlay' ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(6,182,212,0.35)',
          }}>
            {render.type === 'ai' ? <><Sparkles size={10} /> Video AI</> : render.type === 'overlay' ? <><Layers size={10} /> Overlay</> : <><Scissors size={10} /> Collage</>}
          </span>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {render.productName}
          </p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
            {new Date(render.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <StatusBadge status={render.status} />
      </div>

      {/* Video preview */}
      {render.status === 'done' && render.videoUrl && (
        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: '#000', aspectRatio: '9/16', maxHeight: '300px' }}>
          {archiving ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', minHeight: '160px' }}>
              <RefreshCw size={20} className="loading-spinner" style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.saving_storage}</span>
            </div>
          ) : (
            <video
              src={render.videoUrl}
              controls
              playsInline
              poster={render.thumbnailUrl}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
          )}
        </div>
      )}

      {/* Thumbnail for pending/processing */}
      {render.status !== 'done' && render.thumbnailUrl && (
        <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', aspectRatio: '9/16', maxHeight: '200px', background: '#000' }}>
          <img src={render.thumbnailUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} alt="" />
          {render.status === 'processing' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCw size={24} className="loading-spinner" style={{ color: 'var(--primary)' }} />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {render.status === 'failed' && render.errorMessage && (
        <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: 0 }}>{render.errorMessage}</p>
      )}

      {/* Actions */}
      {render.status === 'done' && render.videoUrl && !archiving && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a
            href={render.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'rgba(76,215,246,0.08)', border: '1px solid rgba(76,215,246,0.25)', borderRadius: '8px', padding: '0.5rem', color: 'var(--secondary)', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' }}
          >
            <Play size={14} /> {t.open_video}
          </a>
          <button
            onClick={handleShare}
            title="Copy link"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
              background: copied ? 'rgba(16,185,129,0.12)' : 'rgba(109,59,215,0.08)',
              borderColor: copied ? 'rgba(16,185,129,0.4)' : 'rgba(109,59,215,0.25)',
              color: copied ? 'var(--success)' : 'var(--text-secondary)',
            }}
          >
            <Share2 size={13} />
            {copied ? t.copied : t.share}
          </button>
        </div>
      )}

      {/* Delete */}
      {showConfirm ? (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleDelete} disabled={deleting} className="btn btn-danger" style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem' }}>
            {deleting ? <RefreshCw size={12} className="loading-spinner" /> : t.confirm_delete}
          </button>
          <button onClick={() => setShowConfirm(false)} className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem' }}>
            {t.cancel}
          </button>
        </div>
      ) : (
        <button onClick={() => setShowConfirm(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '0.25rem' }}>
          <Trash2 size={12} /> Delete
        </button>
      )}
    </div>
  );
};

type Filter = 'all' | 'ai' | 'collage' | 'overlay';

export const RendersView: React.FC = () => {
  const t = useT();
  const [renders, setRenders] = useState<Render[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [archivingIds, setArchivingIds] = useState<Set<string>>(new Set());
  const archivingRef = useRef<Set<string>>(new Set());

  const archiveRender = useCallback((render: Render) => {
    if (!render.videoUrl) {
      console.warn(`[archive] ${render.id} — skipped: no videoUrl`);
      return;
    }
    if (archivingRef.current.has(render.id)) {
      console.log(`[archive] ${render.id} — skipped: already in progress`);
      return;
    }
    console.log(`[archive] ${render.id} — queued for archiving`);
    archivingRef.current.add(render.id);
    setArchivingIds(prev => new Set([...prev, render.id]));
    db.archiveRenderVideo(render.id, render.videoUrl!)
      .then(storageUrl => {
        console.log(`[archive] ${render.id} — done, UI updated with storage url`);
        setRenders(prev => prev.map(r => r.id === render.id ? { ...r, videoUrl: storageUrl } : r));
      })
      .catch(err => console.error(`[archive] ${render.id} — FAILED:`, err))
      .finally(() => {
        archivingRef.current.delete(render.id);
        setArchivingIds(prev => { const s = new Set(prev); s.delete(render.id); return s; });
      });
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await db.getRenders();
    setRenders(data);
    if (!silent) setLoading(false);
    // Archive any done renders that still have temporary (non-Storage) URLs
    const toArchive = data.filter(r => r.status === 'done' && r.videoUrl && !isStorageUrl(r.videoUrl));
    console.log(`[renders] loaded ${data.length} renders — ${toArchive.length} need archiving`);
    toArchive.forEach(r => {
      console.log(`[renders] ${r.id} has temporary url, triggering archive`);
      archiveRender(r);
    });
  }, [archiveRender]);

  useEffect(() => { load(); }, [load]);

  // Auto-poll every 5s while there are pending/processing renders or ones being archived
  useEffect(() => {
    const hasPending = renders.some(r => r.status === 'pending' || r.status === 'processing');
    if (!hasPending) return;
    const interval = setInterval(() => load(true), 5000);
    return () => clearInterval(interval);
  }, [renders, load]);

  const handleDelete = (id: string) => setRenders(prev => prev.filter(r => r.id !== id));

  const filtered = filter === 'all' ? renders : renders.filter(r => r.type === filter);
  const aiCount = renders.filter(r => r.type === 'ai').length;
  const collageCount = renders.filter(r => r.type === 'collage').length;
  const overlayCount = renders.filter(r => r.type === 'overlay').length;

  return (
    <div className="view-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)', margin: 0 }}>{t.renders_title}</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
            {renders.length} total · {aiCount} AI · {collageCount} Collage · {overlayCount} Overlay
          </p>
        </div>
        <button onClick={() => load()} disabled={loading} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: '4px' }}>
          <RefreshCw size={18} className={loading ? 'loading-spinner' : ''} />
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {(['all', 'ai', 'collage', 'overlay'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 14px', borderRadius: '999px',
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em',
              cursor: 'pointer', transition: 'all 0.2s',
              background: filter === f ? 'var(--gradient)' : 'rgba(109,59,215,0.08)',
              color: filter === f ? '#fff' : 'var(--text-secondary)',
              border: filter === f ? '1px solid transparent' : '1px solid rgba(109,59,215,0.2)',
              boxShadow: filter === f ? '0 2px 12px rgba(109,59,215,0.3)' : 'none'
            }}
          >
            {f === 'all' ? t.filter_all : f === 'ai' ? t.filter_ai : f === 'collage' ? t.filter_collage : t.filter_overlay}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="loading-spinner" style={{ marginBottom: '0.5rem' }} />
          <p style={{ margin: 0, fontSize: '0.85rem' }}>{t.loading_renders}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>{t.no_renders}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map(r => (
            <RenderCard key={r.id} render={r} onDelete={handleDelete} archiving={archivingIds.has(r.id)} />
          ))}
        </div>
      )}
    </div>
  );
};
