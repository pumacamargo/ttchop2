import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Palette, RefreshCw, AlertTriangle, Save, CheckCircle2, Copy, Trash2, Upload,
  Image as ImageIcon, Type as FontIcon, X,
} from 'lucide-react';
import { db } from '../services/databaseService';
import type { BrandFont } from '../services/databaseService';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';
import type { Translations } from '../i18n';

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const FONT_EXTENSIONS = ['.ttf', '.woff', '.woff2'];

interface QueueItem {
  id: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

function fontKey(font: BrandFont): string {
  return font.storagePath ?? font.url ?? font.name;
}

// ── Small presentational pieces ──────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="glass-card" style={{ padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
    <h4 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      {icon}{title}
    </h4>
    {children}
  </div>
);

const UploadQueueList: React.FC<{ items: QueueItem[]; onDismiss: (id: string) => void }> = ({ items, onDismiss }) => {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {items.map(item => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.6rem',
          borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)',
        }}>
          {item.status === 'uploading' && <RefreshCw size={12} className="loading-spinner" style={{ color: 'var(--primary)', flexShrink: 0 }} />}
          {item.status === 'done' && <CheckCircle2 size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />}
          {item.status === 'error' && <AlertTriangle size={12} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
          <span style={{
            flex: 1, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: item.status === 'error' ? 'var(--danger)' : 'var(--text-secondary)',
          }}>
            {item.error ?? item.name}
          </span>
          {item.status !== 'uploading' && (
            <button
              onClick={() => onDismiss(item.id)}
              aria-label="dismiss"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, minWidth: '28px', minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

const ConfirmBar: React.FC<{ message: string; onConfirm: () => void; onCancel: () => void; t: Translations }> = ({ message, onConfirm, onCancel, t }) => (
  <div
    onClick={e => e.stopPropagation()}
    style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }}
  >
    <div className="glass-card" style={{ maxWidth: '360px', width: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={onCancel} className="btn btn-secondary" style={{ flex: 1, minHeight: '44px', fontSize: '0.8rem' }}>
          {t.cancel}
        </button>
        <button
          onClick={onConfirm}
          className="btn"
          style={{
            flex: 1, minHeight: '44px', fontSize: '0.8rem',
            background: 'color-mix(in srgb, var(--danger) 15%, transparent)', color: 'var(--danger)', border: '1px solid var(--danger)',
          }}
        >
          {t.confirm_delete}
        </button>
      </div>
    </div>
  </div>
);

export const BrandConceptView: React.FC = () => {
  const t = useT();
  const { activeAccountId } = useContainer();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [description, setDescription] = useState('');
  const [niche, setNiche] = useState('');
  const [style, setStyle] = useState('');
  const [colors, setColors] = useState<string[]>([]);
  const [fonts, setFonts] = useState<BrandFont[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const [colorInput, setColorInput] = useState('');
  const [colorError, setColorError] = useState('');
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const [imageQueue, setImageQueue] = useState<QueueItem[]>([]);
  const [imageActionError, setImageActionError] = useState('');
  const [confirmDeleteImage, setConfirmDeleteImage] = useState<string | null>(null);

  const [fontQueue, setFontQueue] = useState<QueueItem[]>([]);
  const [fontActionError, setFontActionError] = useState('');
  const [confirmDeleteFont, setConfirmDeleteFont] = useState<BrandFont | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  // Brand concept is one doc PER CONTAINER (see containerDocId() in databaseService.ts) — switching
  // containers points at a different doc entirely, so this has to re-fetch on activeAccountId change.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await db.getBrandConcept(activeAccountId ?? undefined);
      setDescription(data?.description ?? '');
      setNiche(data?.niche ?? '');
      setStyle(data?.style ?? '');
      setColors(data?.colors ?? []);
      setFonts(data?.fonts ?? []);
      setImageUrls(data?.imageUrls ?? []);
      setUpdatedAt(data?.updatedAt ?? null);
    } catch (err) {
      console.error(err);
      setLoadError(t.brand_load_error);
    } finally {
      setLoading(false);
    }
  }, [t.brand_load_error, activeAccountId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(id);
  }, [justSaved]);

  useEffect(() => {
    if (!copiedColor) return;
    const id = setTimeout(() => setCopiedColor(null), 2000);
    return () => clearTimeout(id);
  }, [copiedColor]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await db.saveBrandConcept({ description, niche, style, colors }, activeAccountId ?? undefined);
      setUpdatedAt(new Date().toISOString());
      setJustSaved(true);
    } catch (err) {
      console.error(err);
      setSaveError(t.brand_save_error);
    } finally {
      setSaving(false);
    }
  };

  // ── Colors ─────────────────────────────────────────────────────────────
  const handleAddColor = () => {
    const hex = colorInput.trim();
    setColorError('');
    if (!HEX_COLOR_RE.test(hex)) {
      setColorError(t.brand_color_invalid);
      return;
    }
    const normalized = hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
    if (colors.some(c => c.toUpperCase() === normalized)) {
      setColorError(t.brand_color_duplicate);
      return;
    }
    setColors(prev => [...prev, normalized]);
    setColorInput('');
  };

  const handleCopyColor = (hex: string) => {
    navigator.clipboard.writeText(hex).then(() => setCopiedColor(hex));
  };

  const handleRemoveColor = (hex: string) => setColors(prev => prev.filter(c => c !== hex));

  // ── Moodboard images ─────────────────────────────────────────────────────
  const handleImagesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageActionError('');
    for (const file of Array.from(files)) {
      const qid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setImageQueue(prev => [...prev, { id: qid, name: file.name, status: 'uploading' }]);
      try {
        const url = await db.uploadBrandImage(file, activeAccountId ?? undefined);
        setImageUrls(prev => [...prev, url]);
        setImageQueue(prev => prev.map(item => item.id === qid ? { ...item, status: 'done' } : item));
      } catch (err) {
        console.error(err);
        setImageQueue(prev => prev.map(item => item.id === qid ? { ...item, status: 'error', error: `${file.name}: ${t.brand_save_error}` } : item));
      }
    }
  };

  const handleDeleteImage = async (url: string) => {
    setImageActionError('');
    try {
      await db.deleteBrandImage(url, activeAccountId ?? undefined);
      setImageUrls(prev => prev.filter(u => u !== url));
    } catch (err) {
      console.error(err);
      setImageActionError(t.brand_image_delete_error);
    } finally {
      setConfirmDeleteImage(null);
    }
  };

  // ── Fonts ────────────────────────────────────────────────────────────────
  const handleFontsSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFontActionError('');
    for (const file of Array.from(files)) {
      const qid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const isValid = FONT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
      if (!isValid) {
        setFontQueue(prev => [...prev, { id: qid, name: file.name, status: 'error', error: t.brand_upload_invalid_type.replace('{name}', file.name) }]);
        continue;
      }
      setFontQueue(prev => [...prev, { id: qid, name: file.name, status: 'uploading' }]);
      try {
        const font = await db.uploadBrandFont(file, activeAccountId ?? undefined);
        setFonts(prev => [...prev, font]);
        setFontQueue(prev => prev.map(item => item.id === qid ? { ...item, status: 'done' } : item));
      } catch (err) {
        console.error(err);
        setFontQueue(prev => prev.map(item => item.id === qid ? { ...item, status: 'error', error: `${file.name}: ${t.brand_save_error}` } : item));
      }
    }
  };

  const handleDeleteFont = async (font: BrandFont) => {
    setFontActionError('');
    try {
      await db.deleteBrandFont(font, activeAccountId ?? undefined);
      setFonts(prev => prev.filter(f => fontKey(f) !== fontKey(font)));
    } catch (err) {
      console.error(err);
      setFontActionError(t.brand_font_delete_error);
    } finally {
      setConfirmDeleteFont(null);
    }
  };

  return (
    <div className="view-content">
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>
          {t.brand_title}
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {t.brand_subtitle}
        </p>
      </div>

      {loading ? (
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <RefreshCw size={16} className="loading-spinner" /> {t.brand_loading}
        </div>
      ) : loadError ? (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1.5rem', alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{loadError}</span>
          <button onClick={load} className="btn btn-secondary" style={{ width: 'auto', minHeight: '44px', padding: '0 1rem' }}>
            <RefreshCw size={14} /> {t.retry}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Text fields + colors + save ─────────────────────────────── */}
          <SectionCard title={t.brand_title} icon={<Palette size={15} style={{ color: 'var(--primary)' }} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t.brand_description_label}</label>
              <textarea
                className="form-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t.brand_description_ph}
                rows={4}
                style={{ fontSize: '0.85rem', minHeight: '96px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t.brand_niche_label}</label>
              <input
                className="form-input"
                value={niche}
                onChange={e => setNiche(e.target.value)}
                placeholder={t.brand_niche_ph}
                style={{ fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t.brand_style_label}</label>
              <textarea
                className="form-textarea"
                value={style}
                onChange={e => setStyle(e.target.value)}
                placeholder={t.brand_style_ph}
                rows={3}
                style={{ fontSize: '0.85rem', minHeight: '76px' }}
              />
            </div>

            {/* Colors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.brand_colors_title}</span>
              <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: 0 }}>{t.brand_colors_hint}</p>

              {colors.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0' }}>{t.brand_colors_empty}</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {colors.map(hex => (
                    <div key={hex} style={{
                      display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.4rem 0.3rem 0.3rem',
                      borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)',
                    }}>
                      <span style={{ width: 20, height: 20, borderRadius: 6, background: hex, border: '1px solid var(--border)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{hex}</span>
                      <button
                        onClick={() => handleCopyColor(hex)}
                        aria-label={t.copied}
                        title={t.copied}
                        style={{ background: 'none', border: 'none', color: copiedColor === hex ? 'var(--success)' : 'var(--text-muted)', cursor: 'pointer', padding: 0, minWidth: '28px', minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {copiedColor === hex ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                      </button>
                      <button
                        onClick={() => handleRemoveColor(hex)}
                        aria-label={t.brand_color_delete_label}
                        title={t.brand_color_delete_label}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, minWidth: '28px', minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input
                  className="form-input"
                  value={colorInput}
                  onChange={e => { setColorInput(e.target.value); setColorError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddColor(); } }}
                  placeholder={t.brand_color_input_ph}
                  style={{ fontSize: '0.85rem', width: '140px', flex: '0 0 auto' }}
                />
                <button onClick={handleAddColor} className="btn btn-secondary" style={{ width: 'auto', minHeight: '44px', padding: '0 0.9rem', fontSize: '0.78rem' }}>
                  {t.brand_color_add}
                </button>
              </div>
              {colorError && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>{colorError}</span>}
            </div>

            {/* Save */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary"
                style={{ minHeight: '44px', padding: '0 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', width: 'auto' }}
              >
                {saving
                  ? <><RefreshCw size={14} className="loading-spinner" /> {t.brand_saving}</>
                  : <><Save size={14} /> {t.brand_save_button}</>}
              </button>
              {justSaved && (
                <span style={{ fontSize: '0.75rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <CheckCircle2 size={13} /> {t.brand_saved}
                </span>
              )}
              {updatedAt && !justSaved && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {t.brand_last_saved}: {new Date(updatedAt).toLocaleString()}
                </span>
              )}
            </div>
            {saveError && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{saveError}</span>}
          </SectionCard>

          {/* ── Moodboard ────────────────────────────────────────────────── */}
          <SectionCard title={t.brand_moodboard_title} icon={<ImageIcon size={15} style={{ color: 'var(--secondary)' }} />}>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: 0 }}>{t.brand_moodboard_hint}</p>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => { handleImagesSelected(e.target.files); e.target.value = ''; }}
            />

            {imageUrls.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.25rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                <ImageIcon size={28} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{t.brand_moodboard_empty}</span>
                <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{t.brand_moodboard_empty_hint}</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '0.5rem' }}>
                {imageUrls.map(url => (
                  <div key={url} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <button
                      onClick={() => setConfirmDeleteImage(url)}
                      aria-label={t.delete}
                      style={{
                        position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none',
                        borderRadius: 6, width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-primary)', cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => imageInputRef.current?.click()}
              className="btn btn-secondary"
              style={{ width: 'auto', alignSelf: 'flex-start', minHeight: '44px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Upload size={14} /> {t.brand_moodboard_upload}
            </button>

            <UploadQueueList items={imageQueue} onDismiss={id => setImageQueue(prev => prev.filter(i => i.id !== id))} />
            {imageActionError && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{imageActionError}</span>}
          </SectionCard>

          {/* ── Fonts ────────────────────────────────────────────────────── */}
          <SectionCard title={t.brand_fonts_title} icon={<FontIcon size={15} style={{ color: 'var(--accent)' }} />}>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: 0 }}>{t.brand_fonts_hint}</p>

            <input
              ref={fontInputRef}
              type="file"
              accept=".ttf,.woff,.woff2"
              multiple
              style={{ display: 'none' }}
              onChange={e => { handleFontsSelected(e.target.files); e.target.value = ''; }}
            />

            {fonts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.25rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                <FontIcon size={28} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>{t.brand_fonts_empty}</span>
                <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{t.brand_fonts_empty_hint}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {fonts.map(font => (
                  <div key={fontKey(font)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.7rem',
                    background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)',
                  }}>
                    <FontIcon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {font.name}
                    </span>
                    <button
                      onClick={() => setConfirmDeleteFont(font)}
                      aria-label={t.delete}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => fontInputRef.current?.click()}
              className="btn btn-secondary"
              style={{ width: 'auto', alignSelf: 'flex-start', minHeight: '44px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Upload size={14} /> {t.brand_fonts_upload}
            </button>

            <UploadQueueList items={fontQueue} onDismiss={id => setFontQueue(prev => prev.filter(i => i.id !== id))} />
            {fontActionError && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>{fontActionError}</span>}
          </SectionCard>
        </div>
      )}

      {confirmDeleteImage && (
        <ConfirmBar
          t={t}
          message={t.brand_image_delete_confirm}
          onCancel={() => setConfirmDeleteImage(null)}
          onConfirm={() => handleDeleteImage(confirmDeleteImage)}
        />
      )}
      {confirmDeleteFont && (
        <ConfirmBar
          t={t}
          message={t.brand_font_delete_confirm}
          onCancel={() => setConfirmDeleteFont(null)}
          onConfirm={() => handleDeleteFont(confirmDeleteFont)}
        />
      )}
    </div>
  );
};
