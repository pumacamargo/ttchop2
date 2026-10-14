import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../services/databaseService';
import type { Carousel, Template } from '../services/databaseService';
import {
  Plus, RefreshCw, Copy, Download, Trash2, AlertTriangle, CheckCircle, Clock,
  ImagePlus, ArrowLeft, Sparkles,
} from 'lucide-react';

// Costo/imagen confirmado en el spike de la Fase 0 (TTC-56) — solo para el estimado
// mostrado en la UI antes de generar. El costo real y autoritativo lo escribe el
// server en carousel.cost.credits después de cada tarea de kie.ai.
const IMAGE_MODELS: { value: string; label: string; creditsPerImage: number }[] = [
  { value: 'seedream-v4', label: 'Seedream v4 (default)', creditsPerImage: 5 },
  { value: 'gpt-image-2', label: 'GPT Image 2', creditsPerImage: 6 },
  { value: 'nano-banana-2', label: 'Nano Banana 2', creditsPerImage: 8 },
];

const LANGUAGES = [
  { value: 'es', label: 'Español 🇲🇽' },
  { value: 'en', label: 'English 🇺🇸' },
  { value: 'ja', label: '日本語 🇯🇵' },
];

const STATUS_CONFIG: Record<Carousel['status'], { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  planning:          { label: 'Planning',    color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: <Clock size={10} /> },
  text_review:       { label: 'Text review', color: '#4cd7f6', bg: 'rgba(76,215,246,0.12)', icon: <Clock size={10} /> },
  generating_images: { label: 'Generating',  color: 'var(--primary)', bg: 'rgba(109,59,215,0.12)', icon: <RefreshCw size={10} className="loading-spinner" /> },
  composing:         { label: 'Composing',   color: 'var(--primary)', bg: 'rgba(109,59,215,0.12)', icon: <RefreshCw size={10} className="loading-spinner" /> },
  ready:             { label: 'Ready',       color: 'var(--success)', bg: 'rgba(16,185,129,0.12)', icon: <CheckCircle size={10} /> },
  failed:            { label: 'Failed',      color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)', icon: <AlertTriangle size={10} /> },
};

const StatusBadge: React.FC<{ status: Carousel['status'] }> = ({ status }) => {
  const c = STATUS_CONFIG[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: c.bg, color: c.color, padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600 }}>
      {c.icon} {c.label}
    </span>
  );
};

// ── Detalle de un carrusel: revisión de texto, progreso, preview final ─────────
const CarouselDetail: React.FC<{
  carousel: Carousel;
  onBack: () => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
}> = ({ carousel, onBack, onDelete, onChanged }) => {
  const [editedSlides, setEditedSlides] = useState(carousel.slides.map(s => ({ index: s.index, text: s.text, imagePrompt: s.imagePrompt })));
  const [editedCaption, setEditedCaption] = useState(carousel.caption);
  const [busy, setBusy] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (carousel.status === 'text_review') {
      setEditedSlides(carousel.slides.map(s => ({ index: s.index, text: s.text, imagePrompt: s.imagePrompt })));
      setEditedCaption(carousel.caption);
    }
  }, [carousel.id, carousel.status]);

  const handleApprove = async () => {
    setBusy(true);
    setError('');
    try {
      await db.approveCarouselText(carousel.id, { slides: editedSlides, caption: editedCaption });
      onChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to approve text');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateSlot = async (index: number) => {
    setRegeneratingIdx(index);
    setError('');
    try {
      await db.regenerateCarouselSlots(carousel.id, [index], 'image');
      onChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate slide');
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const handleCopyCaption = () => {
    const text = `${carousel.caption}${carousel.hashtags?.length ? '\n\n' + carousel.hashtags.map(h => `#${h}`).join(' ') : ''}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDelete = async () => {
    setBusy(true);
    await db.deleteCarousel(carousel.id);
    onDelete(carousel.id);
  };

  const estimatedCredits = carousel.cost?.credits || 0;

  return (
    <div className="view-content">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={22} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 800 }}>{carousel.scriptTemplate?.title || 'Carousel'}</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {carousel.styleTemplate?.title} · {carousel.language.toUpperCase()} · {carousel.slides.length} slides
          </p>
        </div>
        <StatusBadge status={carousel.status} />
      </div>

      {error && (
        <div className="glass-card" style={{ borderColor: 'var(--danger)', background: 'rgba(239,68,68,0.08)', marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>{error}</p>
        </div>
      )}

      {carousel.status === 'failed' && carousel.errorMessage && (
        <div className="glass-card" style={{ borderColor: 'var(--danger)', background: 'rgba(239,68,68,0.08)', marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: 0 }}>{carousel.errorMessage}</p>
        </div>
      )}

      {(carousel.status === 'composing') && carousel.errorMessage && (
        <div className="glass-card" style={{ borderColor: 'var(--danger)', background: 'rgba(234,179,8,0.08)', marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>{carousel.errorMessage}</p>
        </div>
      )}

      {/* Costo */}
      <div className="glass-card" style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Cost so far</span>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>{estimatedCredits} credits</span>
      </div>

      {/* Revisión de texto — D5: se puede editar antes de gastar créditos en imágenes */}
      {carousel.status === 'text_review' && (
        <>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Review the texts below. Nothing has been spent yet — generating images will cost ~{carousel.slides.length * (IMAGE_MODELS.find(m => m.value === carousel.imageModel)?.creditsPerImage || 5)} credits ({carousel.imageModel}).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            {editedSlides.map((s, i) => (
              <div key={s.index} className="glass-card" style={{ padding: '0.85rem' }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Slide {s.index + 1} · {carousel.slides[i]?.role}
                </p>
                <textarea
                  className="form-textarea"
                  value={s.text}
                  onChange={e => setEditedSlides(prev => prev.map(p => p.index === s.index ? { ...p, text: e.target.value } : p))}
                  rows={2}
                  style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}
                />
                <textarea
                  className="form-textarea"
                  value={s.imagePrompt}
                  onChange={e => setEditedSlides(prev => prev.map(p => p.index === s.index ? { ...p, imagePrompt: e.target.value } : p))}
                  rows={2}
                  placeholder="Image prompt (English, photo-only)"
                  style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}
                />
              </div>
            ))}
          </div>
          <div className="form-group">
            <label className="form-label">Caption</label>
            <textarea className="form-textarea" value={editedCaption} onChange={e => setEditedCaption(e.target.value)} rows={2} />
          </div>
          <button className="btn btn-primary" onClick={handleApprove} disabled={busy} style={{ width: '100%', marginTop: '0.5rem' }}>
            {busy ? <><RefreshCw size={16} className="loading-spinner" /> Generating images...</> : <><Sparkles size={16} /> Approve &amp; generate images</>}
          </button>
        </>
      )}

      {(carousel.status === 'generating_images' || carousel.status === 'composing' || carousel.status === 'planning') && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '2rem 1rem', marginBottom: '1rem' }}>
          <RefreshCw size={24} className="loading-spinner" style={{ color: 'var(--primary)', marginBottom: '0.5rem' }} />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            {carousel.status === 'generating_images' ? 'Generating backgrounds with AI…' : carousel.status === 'composing' ? 'Composing final slides…' : 'Starting…'}
          </p>
        </div>
      )}

      {/* Slides (fondos mientras se generan, finales cuando status=ready) */}
      {(carousel.status === 'generating_images' || carousel.status === 'composing' || carousel.status === 'ready' || carousel.status === 'failed') && carousel.slides.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {carousel.slides.map(s => {
            const imgUrl = s.final?.url || s.bg?.url;
            return (
              <div key={s.index} className="glass-card" style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ position: 'relative', aspectRatio: '9/16', borderRadius: '6px', overflow: 'hidden', background: '#000' }}>
                  {imgUrl ? (
                    <img src={imgUrl} alt={`Slide ${s.index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {s.bg?.status === 'failed'
                        ? <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
                        : <RefreshCw size={20} className="loading-spinner" style={{ color: 'var(--text-muted)' }} />}
                    </div>
                  )}
                  {regeneratingIdx === s.index && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <RefreshCw size={18} className="loading-spinner" style={{ color: '#fff' }} />
                    </div>
                  )}
                </div>
                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {s.text}
                </p>
                {(carousel.status === 'ready' || s.bg?.status === 'failed') && (
                  <button
                    onClick={() => handleRegenerateSlot(s.index)}
                    disabled={regeneratingIdx !== null}
                    style={{ background: 'rgba(109,59,215,0.08)', border: '1px solid rgba(109,59,215,0.25)', borderRadius: '6px', padding: '0.3rem', fontSize: '0.68rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    <RefreshCw size={11} /> Regenerate
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {carousel.status === 'ready' && (
        <>
          <div className="glass-card" style={{ padding: '0.85rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Caption</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>{carousel.caption}</p>
            {carousel.hashtags?.length > 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--secondary)', margin: '6px 0 0' }}>{carousel.hashtags.map(h => `#${h}`).join(' ')}</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button onClick={handleCopyCaption} className="btn btn-secondary" style={{ flex: 1 }}>
              <Copy size={14} /> {copied ? 'Copied!' : 'Copy caption'}
            </button>
            {carousel.packageZipUrl && (
              <a href={carousel.packageZipUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ flex: 1, textDecoration: 'none' }}>
                <Download size={14} /> Download ZIP
              </a>
            )}
          </div>

          {/* ToS (mandato 2): publicación MANUAL + recordatorio de etiqueta AI-generated */}
          <div className="glass-card" style={{ borderColor: 'rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.06)', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={16} style={{ color: '#eab308', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
              Upload manually to TikTok (Photo mode) and remember to mark it as <strong>AI-generated content</strong> before posting. There is no automatic publishing.
            </p>
          </div>
        </>
      )}

      {/* Borrar */}
      {showDeleteConfirm ? (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleDelete} disabled={busy} className="btn btn-danger" style={{ flex: 1 }}>
            {busy ? <RefreshCw size={14} className="loading-spinner" /> : 'Yes, delete'}
          </button>
          <button onClick={() => setShowDeleteConfirm(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setShowDeleteConfirm(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', padding: '0.4rem 0', marginTop: '0.5rem' }}>
          <Trash2 size={13} /> Delete carousel
        </button>
      )}
    </div>
  );
};

// ── Formulario de carrusel nuevo ────────────────────────────────────────────────
const NewCarouselForm: React.FC<{
  scriptTemplates: Template[];
  styleTemplates: Template[];
  onCreated: (carousel: Carousel) => void;
  onCancel: () => void;
}> = ({ scriptTemplates, styleTemplates, onCreated, onCancel }) => {
  const [script, setScript] = useState('');
  const [scriptTemplateId, setScriptTemplateId] = useState(scriptTemplates[0]?.id || '');
  const [styleTemplateId, setStyleTemplateId] = useState(styleTemplates[0]?.id || '');
  const [language, setLanguage] = useState('es');
  const [imageModel, setImageModel] = useState('seedream-v4');
  const [slideCountOverride, setSlideCountOverride] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedScriptTemplate = scriptTemplates.find(t => t.id === scriptTemplateId);
  const effectiveSlideCount = Number(slideCountOverride) || selectedScriptTemplate?.slideCount?.default || 7;
  const creditsPerImage = IMAGE_MODELS.find(m => m.value === imageModel)?.creditsPerImage || 5;
  const estimatedCredits = effectiveSlideCount * creditsPerImage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!script.trim()) { setError('Paste a script first.'); return; }
    if (!scriptTemplateId || !styleTemplateId) { setError('Pick a script structure and a visual style.'); return; }

    setSubmitting(true);
    setError('');
    try {
      const { carousel } = await db.createCarousel({
        script,
        scriptTemplateId,
        styleTemplateId,
        language,
        imageModel,
        slideCount: slideCountOverride ? Number(slideCountOverride) : undefined,
        dryRun: true, // D5: siempre revisar texto antes de gastar créditos en imágenes
      });
      onCreated(carousel);
    } catch (err: any) {
      setError(err.message || 'Failed to generate texts');
    } finally {
      setSubmitting(false);
    }
  };

  if (scriptTemplates.length === 0 || styleTemplates.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          No carousel templates yet — they seed automatically the first time you open the Templates tab.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', color: 'var(--primary)' }}>New Carousel</h3>

      <div className="form-group">
        <label className="form-label">Script / topic</label>
        <textarea
          className="form-textarea"
          placeholder="Paste or write your raw script / talking points here..."
          value={script}
          onChange={e => setScript(e.target.value)}
          rows={5}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="form-group">
          <label className="form-label">Script structure</label>
          <select className="form-select" value={scriptTemplateId} onChange={e => setScriptTemplateId(e.target.value)}>
            {scriptTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Visual style</label>
          <select className="form-select" value={styleTemplateId} onChange={e => setStyleTemplateId(e.target.value)}>
            {styleTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Language</label>
          <select className="form-select" value={language} onChange={e => setLanguage(e.target.value)}>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Image model</label>
          <select className="form-select" value={imageModel} onChange={e => setImageModel(e.target.value)}>
            {IMAGE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">
          Slide count {selectedScriptTemplate?.slideCount && `(default ${selectedScriptTemplate.slideCount.default}, range ${selectedScriptTemplate.slideCount.min}-${selectedScriptTemplate.slideCount.max})`}
        </label>
        <input
          type="number"
          className="form-input"
          placeholder={String(selectedScriptTemplate?.slideCount?.default || 7)}
          value={slideCountOverride}
          onChange={e => setSlideCountOverride(e.target.value)}
          min={selectedScriptTemplate?.slideCount?.min || 5}
          max={selectedScriptTemplate?.slideCount?.max || 10}
        />
      </div>

      <div className="glass-card" style={{ background: 'rgba(109,59,215,0.06)', padding: '0.6rem 0.85rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Estimated cost ({effectiveSlideCount} slides)</span>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>~{estimatedCredits} credits</span>
      </div>

      {error && <p style={{ fontSize: '0.78rem', color: 'var(--danger)', marginBottom: '0.75rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 1 }}>
          {submitting ? <><RefreshCw size={16} className="loading-spinner" /> Writing texts...</> : <><Sparkles size={16} /> Generate texts (free)</>}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
    </form>
  );
};

// ── Vista principal ──────────────────────────────────────────────────────────
export const CarouselsView: React.FC = () => {
  const [carousels, setCarousels] = useState<Carousel[]>([]);
  const [scriptTemplates, setScriptTemplates] = useState<Template[]>([]);
  const [styleTemplates, setStyleTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [cs, scripts, styles] = await Promise.all([
      db.getCarousels(),
      db.getTemplatesByType('carousel_script'),
      db.getTemplatesByType('carousel_style'),
    ]);
    setCarousels(cs);
    setScriptTemplates(scripts);
    setStyleTemplates(styles);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll mientras haya algo en vuelo — mismo patrón que RendersView (sin onSnapshot,
  // consistente con el resto del código).
  useEffect(() => {
    const hasPending = carousels.some(c => ['planning', 'generating_images', 'composing'].includes(c.status));
    if (!hasPending) return;
    const interval = setInterval(() => load(true), 4000);
    return () => clearInterval(interval);
  }, [carousels, load]);

  const selected = selectedId ? carousels.find(c => c.id === selectedId) || null : null;

  const handleDelete = (id: string) => {
    setCarousels(prev => prev.filter(c => c.id !== id));
    setSelectedId(null);
  };

  if (selected) {
    return (
      <CarouselDetail
        carousel={selected}
        onBack={() => setSelectedId(null)}
        onDelete={handleDelete}
        onChanged={() => load(true)}
      />
    );
  }

  return (
    <div className="view-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)', margin: 0 }}>Carousels</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>AI photo carousels for TikTok Photo Mode</p>
        </div>
        {!showForm && (
          <button className="btn btn-primary" style={{ width: 'auto', minHeight: '40px', padding: '0 1rem' }} onClick={() => setShowForm(true)}>
            <Plus size={16} /> New
          </button>
        )}
      </div>

      {showForm && (
        <NewCarouselForm
          scriptTemplates={scriptTemplates}
          styleTemplates={styleTemplates}
          onCreated={(carousel) => { setShowForm(false); setCarousels(prev => [carousel, ...prev]); setSelectedId(carousel.id); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="loading-spinner" style={{ marginBottom: '0.5rem' }} />
        </div>
      ) : carousels.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
          <ImagePlus size={28} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '0.85rem' }}>No carousels yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {carousels.map(c => {
            const coverUrl = c.slides?.[0]?.final?.url || c.slides?.[0]?.bg?.url;
            return (
              <div key={c.id} className="glass-card" style={{ cursor: 'pointer', display: 'flex', gap: '0.75rem', padding: '0.85rem' }} onClick={() => setSelectedId(c.id)}>
                <div style={{ width: '56px', height: '100px', borderRadius: '6px', overflow: 'hidden', background: '#000', flexShrink: 0 }}>
                  {coverUrl ? <img src={coverUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <RefreshCw size={14} className={['planning', 'generating_images', 'composing'].includes(c.status) ? 'loading-spinner' : ''} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <p style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.scriptTemplate?.title || 'Carousel'}
                    </p>
                    <StatusBadge status={c.status} />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {c.script}
                  </p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    {c.styleTemplate?.title} · {c.language.toUpperCase()} · {c.slides?.length || 0} slides · {c.cost?.credits || 0} cr
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
