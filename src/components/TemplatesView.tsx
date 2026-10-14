import React, { useState, useEffect } from 'react';
import { db } from '../services/databaseService';
import type { Template, TemplateType, CarouselTypography } from '../services/databaseService';
import { FileText, Wand2, Mic, Layers, Plus, ShieldAlert, Trash2, Globe, List, Palette } from 'lucide-react';
import { TemplateDetailModal } from './TemplateDetailModal';
import { useT } from '../context/LanguageContext';

// Los 2 layouts implementados en la Fase 2 (TTC-56) + los 2 que llegan en la Fase 5 —
// seguirlos listados ya desde ahora deja crear/editar el template sin esperar al
// layout; CarouselSlide cae al fallback 'cinematic-concert-still' hasta que exista.
const CAROUSEL_LAYOUT_IDS = ['cinematic-concert-still', 'museum-exhibition-system', 'experimental-type-sculpture', 'surreal-stage-architecture'];
const CAROUSEL_DEFAULT_NEGATIVE = 'photorealistic photo, no text, no typography, no letters, no words, no signage, no logos, no watermarks, not an illustration, not 3D render';

const LANGUAGES = [
  { value: 'English',           label: 'English',          flag: '🇺🇸' },
  { value: 'Spanish (Mexico)',  label: 'Español (México)',  flag: '🇲🇽' },
  { value: 'Japanese',          label: '日本語',             flag: '🇯🇵' },
];

interface TemplatesViewProps {
  language?: string;
  onLanguageChange?: (lang: string) => void;
  onTemplateSelected?: (template: Template) => void;
}

// TYPE_TABS built inside component to use translations — see below

export const TemplatesView: React.FC<TemplatesViewProps> = ({ language = 'English', onLanguageChange, onTemplateSelected }) => {
  const t = useT();
  const TYPE_TABS: { type: TemplateType; label: string; icon: React.ReactNode }[] = [
    { type: 'aiGen',   label: t.template_type_ai,      icon: <Wand2 size={14} /> },
    { type: 'collage', label: t.template_type_collage,  icon: <FileText size={14} /> },
    { type: 'voice',   label: t.template_type_voice,    icon: <Mic size={14} /> },
    { type: 'overlay', label: t.template_type_overlay,  icon: <Layers size={14} /> },
    { type: 'carousel_script', label: t.template_type_carousel_script, icon: <List size={14} /> },
    { type: 'carousel_style',  label: t.template_type_carousel_style,  icon: <Palette size={14} /> },
  ];
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeType, setActiveType] = useState<TemplateType>('aiGen');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const fetchTemplates = async () => {
    try {
      const temps = await db.getTemplates();
      setTemplates(temps);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // carousel_script fields (TTC-56 Fase 3)
  const [slideMin, setSlideMin] = useState('5');
  const [slideMax, setSlideMax] = useState('10');
  const [slideDefault, setSlideDefault] = useState('7');
  const [roles, setRoles] = useState('hook,body,body,body,body,body,cta');
  const [maxCharsPerSlide, setMaxCharsPerSlide] = useState('140');
  const [captionStyle, setCaptionStyle] = useState('');

  // carousel_style fields (TTC-56 Fase 3)
  const [visualBible, setVisualBible] = useState('');
  const [imagePromptHints, setImagePromptHints] = useState('');
  const [negative, setNegative] = useState(CAROUSEL_DEFAULT_NEGATIVE);
  const [layoutId, setLayoutId] = useState(CAROUSEL_LAYOUT_IDS[0]);
  const [typography, setTypography] = useState<CarouselTypography>({});

  const filteredTemplates = templates.filter(t => t.type === activeType);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setContent('');
    setVoiceId('');
    setReferenceVideoUrl('');
    setNewVideoUrl('');
    setErrorMsg('');
    setSlideMin('5');
    setSlideMax('10');
    setSlideDefault('7');
    setRoles('hook,body,body,body,body,body,cta');
    setMaxCharsPerSlide('140');
    setCaptionStyle('');
    setVisualBible('');
    setImagePromptHints('');
    setNegative(CAROUSEL_DEFAULT_NEGATIVE);
    setLayoutId(CAROUSEL_LAYOUT_IDS[0]);
    setTypography({});
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !description) {
      setErrorMsg("Title and description are required.");
      return;
    }
    if (activeType === 'carousel_style' && !visualBible) {
      setErrorMsg('Visual Bible is required for carousel styles.');
      return;
    }

    try {
      const saved = await db.saveTemplate({
        type: activeType,
        title,
        description,
        ...(content && activeType !== 'carousel_script' && activeType !== 'carousel_style' && { content }),
        ...(voiceId && { voiceId }),
        ...(referenceVideoUrl && { referenceVideoUrl }),
        ...(activeType === 'carousel_script' && {
          content,
          slideCount: { min: Number(slideMin) || 5, max: Number(slideMax) || 10, default: Number(slideDefault) || 7 },
          roles: roles.split(',').map(r => r.trim()).filter(Boolean),
          ...(maxCharsPerSlide && { maxCharsPerSlide: Number(maxCharsPerSlide) }),
          ...(captionStyle && { captionStyle }),
        }),
        ...(activeType === 'carousel_style' && {
          visualBible,
          ...(imagePromptHints && { imagePromptHints }),
          negative: negative || CAROUSEL_DEFAULT_NEGATIVE,
          layoutId,
          ...(Object.keys(typography).length > 0 && { typography }),
          aspect: '9:16',
        }),
      });

      await fetchTemplates();
      setShowAddForm(false);
      resetForm();

      if (onTemplateSelected) {
        onTemplateSelected(saved);
      }
    } catch (err: any) {
      setErrorMsg('Failed to save the template: ' + (err.message || ''));
    }
  };

  if (selectedTemplate) {
    return (
      <div className="view-content">
        <TemplateDetailModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onUpdate={() => {
            fetchTemplates();
            if (onTemplateSelected) {
              onTemplateSelected(selectedTemplate);
            }
            setSelectedTemplate(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="view-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>{t.templates_title}</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{t.templates_subtitle}</p>
        </div>
        {!showAddForm && (
          <button
            className="btn btn-primary"
            style={{ width: 'auto', minHeight: '40px', padding: '0 1rem' }}
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={16} /> {t.create}
          </button>
        )}
      </div>

      {/* Language Preference */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <Globe size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select
          className="form-select"
          value={language}
          onChange={e => onLanguageChange?.(e.target.value)}
          style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', color: 'var(--text-secondary)' }}
        >
          {LANGUAGES.map(lang => (
            <option key={lang.value} value={lang.value}>{lang.flag} {lang.label}</option>
          ))}
        </select>
      </div>

      {/* Type Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {TYPE_TABS.map(tab => (
          <button
            key={tab.type}
            onClick={() => { setActiveType(tab.type); setShowAddForm(false); resetForm(); }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '0.5rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeType === tab.type ? 'var(--gradient)' : 'rgba(109,59,215,0.08)',
              color: activeType === tab.type ? '#fff' : 'var(--text-secondary)',
              border: activeType === tab.type ? '1px solid transparent' : '1px solid rgba(109,59,215,0.25)',
              transition: 'all 0.2s'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="glass-card" style={{
          borderColor: 'var(--danger)',
          background: 'rgba(239, 68, 68, 0.08)',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-start',
          marginBottom: '1.25rem',
          padding: '0.8rem 1rem'
        }}>
          <ShieldAlert size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{errorMsg}</p>
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleSaveTemplate} className="glass-card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>
            {activeType === 'aiGen' ? 'New AI Generation Template'
              : activeType === 'voice' ? 'New Voice Template'
              : activeType === 'carousel_script' ? 'New Carousel Script Template'
              : activeType === 'carousel_style' ? 'New Carousel Style Template'
              : 'New Collage Template'}
          </h3>

          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              type="text"
              className="form-input"
              placeholder={activeType === 'aiGen' ? 'e.g. Ultra-Raw Casual UGC'
                : activeType === 'voice' ? 'e.g. Energetic Female'
                : activeType === 'carousel_script' ? 'e.g. Lista 7 slides'
                : activeType === 'carousel_style' ? 'e.g. Cinematic Concert Still'
                : 'e.g. Basic Creator Script'}
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Short Description</label>
            <input
              type="text"
              className="form-input"
              placeholder="One-line summary shown on the template card"
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
            />
          </div>

          {activeType === 'voice' && (
            <div className="form-group">
              <label className="form-label">ElevenLabs Voice ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                value={voiceId}
                onChange={e => setVoiceId(e.target.value)}
              />
            </div>
          )}

          {activeType === 'carousel_script' && (
            <>
              <div className="form-group">
                <label className="form-label">Script Structure (instructions for the LLM)</label>
                <textarea
                  className="form-textarea"
                  placeholder="e.g. Formato lista: hook que detiene el scroll, N puntos accionables, cierre con CTA de guardar/seguir."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={6}
                  style={{ fontSize: '0.85rem', lineHeight: '1.6' }}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Min slides</label>
                  <input type="number" className="form-input" value={slideMin} onChange={e => setSlideMin(e.target.value)} min={1} max={10} />
                </div>
                <div className="form-group">
                  <label className="form-label">Max slides</label>
                  <input type="number" className="form-input" value={slideMax} onChange={e => setSlideMax(e.target.value)} min={1} max={10} />
                </div>
                <div className="form-group">
                  <label className="form-label">Default slides</label>
                  <input type="number" className="form-input" value={slideDefault} onChange={e => setSlideDefault(e.target.value)} min={1} max={10} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Roles per slide (comma-separated, in order)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="hook,body,body,body,body,body,cta"
                  value={roles}
                  onChange={e => setRoles(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Max chars per slide</label>
                  <input type="number" className="form-input" value={maxCharsPerSlide} onChange={e => setMaxCharsPerSlide(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Caption style</label>
                  <input type="text" className="form-input" placeholder="Corto, tono directo, 3-5 hashtags" value={captionStyle} onChange={e => setCaptionStyle(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {activeType === 'carousel_style' && (
            <>
              <div className="form-group">
                <label className="form-label">Visual Bible (shared direction for every slide's background)</label>
                <textarea
                  className="form-textarea"
                  placeholder="e.g. Cinematic concert photography, dramatic stage lighting, shallow depth of field, moody teal and magenta color grade..."
                  value={visualBible}
                  onChange={e => setVisualBible(e.target.value)}
                  rows={5}
                  style={{ fontSize: '0.85rem', lineHeight: '1.6' }}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Image Prompt Hints (optional)</label>
                <textarea
                  className="form-textarea"
                  placeholder="How to translate each slide's text into a photo-only scene..."
                  value={imagePromptHints}
                  onChange={e => setImagePromptHints(e.target.value)}
                  rows={3}
                  style={{ fontSize: '0.85rem', lineHeight: '1.6' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Negative prompt (always appended — photo-only rule)</label>
                <textarea className="form-textarea" value={negative} onChange={e => setNegative(e.target.value)} rows={2} style={{ fontSize: '0.78rem' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Layout</label>
                <select className="form-select" value={layoutId} onChange={e => setLayoutId(e.target.value)}>
                  {CAROUSEL_LAYOUT_IDS.map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Text color</label>
                  <input type="text" className="form-input" placeholder="#ffffff" value={typography.color || ''} onChange={e => setTypography(p => ({ ...p, color: e.target.value || undefined }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Accent color</label>
                  <input type="text" className="form-input" placeholder="#ff3df0" value={typography.accentColor || ''} onChange={e => setTypography(p => ({ ...p, accentColor: e.target.value || undefined }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Text position</label>
                  <select className="form-select" value={typography.textPosition || 'bottom'} onChange={e => setTypography(p => ({ ...p, textPosition: e.target.value as CarouselTypography['textPosition'] }))}>
                    <option value="top">top</option>
                    <option value="center">center</option>
                    <option value="bottom">bottom</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Text background</label>
                  <select className="form-select" value={typography.background || 'none'} onChange={e => setTypography(p => ({ ...p, background: e.target.value as CarouselTypography['background'] }))}>
                    <option value="none">none</option>
                    <option value="band">band</option>
                    <option value="blur">blur</option>
                    <option value="gradient">gradient</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {(activeType === 'aiGen' || activeType === 'collage' || activeType === 'overlay') && (
            <div className="form-group">
              <label className="form-label">
                {activeType === 'aiGen' ? 'System Prompt / Generation Instructions' : 'Script Structure / Guidelines'}
              </label>
              <textarea
                className="form-textarea"
                placeholder={activeType === 'aiGen'
                  ? 'Full prompt sent to the AI model...'
                  : 'Full script structure with sections like [hook], [problem], [cta]...'}
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={12}
                style={{ fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: '1.6' }}
              />
            </div>
          )}

          {activeType !== 'carousel_script' && activeType !== 'carousel_style' && (
          <div className="form-group">
            <label className="form-label">Reference Video URL (Optional)</label>
            {referenceVideoUrl ? (
              <div style={{ position: 'relative', aspectRatio: '9/16', width: '120px', borderRadius: '8px', overflow: 'hidden', background: '#000', border: '1px solid var(--border)', marginBottom: '0.75rem' }}>
                <video src={referenceVideoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => setReferenceVideoUrl('')}
                  style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', cursor: 'pointer' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://example.com/video.mp4"
                  value={newVideoUrl}
                  onChange={e => setNewVideoUrl(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flexShrink: 0, width: 'auto', padding: '0 1rem' }}
                  onClick={() => {
                    if (newVideoUrl.trim()) {
                      setReferenceVideoUrl(newVideoUrl.trim());
                      setNewVideoUrl('');
                    }
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary">Save Template</button>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowAddForm(false); resetForm(); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Templates List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredTemplates.length === 0 && (
          <div className="glass-card" style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No {activeType === 'aiGen' ? 'AI generation' : activeType === 'voice' ? 'voice' : activeType === 'carousel_script' ? 'carousel script' : activeType === 'carousel_style' ? 'carousel style' : 'collage'} templates yet.
          </div>
        )}
        {filteredTemplates.map(t => (
          <div key={t.id} className="glass-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedTemplate(t)}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: t.type === 'aiGen' ? 'rgba(109,59,215,0.12)' : t.type === 'voice' ? 'rgba(76,215,246,0.12)' : t.type === 'carousel_script' || t.type === 'carousel_style' ? 'rgba(245,197,24,0.12)' : 'rgba(168,85,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.type === 'aiGen' ? 'var(--primary)' : t.type === 'voice' ? 'var(--secondary)' : t.type === 'carousel_script' || t.type === 'carousel_style' ? '#f5c518' : 'var(--accent)', flexShrink: 0 }}>
                {t.type === 'aiGen' ? <Wand2 size={20} /> : t.type === 'voice' ? <Mic size={20} /> : t.type === 'carousel_script' ? <List size={20} /> : t.type === 'carousel_style' ? <Palette size={20} /> : <FileText size={20} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontSize: '1rem', color: '#fff', margin: 0 }}>{t.title}</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</p>
                {t.seed && (
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>Default template</p>
                )}
                {t.type === 'voice' && t.voiceId && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', fontFamily: 'monospace' }}>
                    ID: {t.voiceId}
                  </p>
                )}
                {t.type === 'carousel_script' && t.slideCount && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {t.slideCount.default} slides (range {t.slideCount.min}-{t.slideCount.max}) · tap to view
                  </p>
                )}
                {t.type === 'carousel_style' && t.layoutId && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Layout: {t.layoutId} · tap to view
                  </p>
                )}
                {t.type !== 'voice' && t.type !== 'carousel_script' && t.type !== 'carousel_style' && t.content && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {t.content.length} chars · tap to view
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
