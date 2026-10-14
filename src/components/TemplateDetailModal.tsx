import React, { useState } from 'react';
import { db } from '../services/databaseService';
import type { Template, CarouselTypography } from '../services/databaseService';
import { ArrowLeft, Edit2, Trash2, Save, RefreshCw, Wand2, FileText, Mic, List, Palette } from 'lucide-react';

const CAROUSEL_LAYOUT_IDS = ['cinematic-concert-still', 'museum-exhibition-system', 'experimental-type-sculpture', 'surreal-stage-architecture'];

interface TemplateDetailModalProps {
  template: Template;
  onClose: () => void;
  onUpdate: () => void;
}

export const TemplateDetailModal: React.FC<TemplateDetailModalProps> = ({ template, onClose, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');

  // Edit state
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description);
  const [content, setContent] = useState(template.content || '');
  const [voiceId, setVoiceId] = useState(template.voiceId || '');
  const [referenceVideoUrl, setReferenceVideoUrl] = useState(template.referenceVideoUrl || '');
  const [newVideoUrl, setNewVideoUrl] = useState('');

  // carousel_script / carousel_style edit state (TTC-56 Fase 3)
  const [slideMin, setSlideMin] = useState(String(template.slideCount?.min ?? 5));
  const [slideMax, setSlideMax] = useState(String(template.slideCount?.max ?? 10));
  const [slideDefault, setSlideDefault] = useState(String(template.slideCount?.default ?? 7));
  const [roles, setRoles] = useState((template.roles || []).join(','));
  const [maxCharsPerSlide, setMaxCharsPerSlide] = useState(String(template.maxCharsPerSlide ?? ''));
  const [captionStyle, setCaptionStyle] = useState(template.captionStyle || '');
  const [visualBible, setVisualBible] = useState(template.visualBible || '');
  const [imagePromptHints, setImagePromptHints] = useState(template.imagePromptHints || '');
  const [negative, setNegative] = useState(template.negative || '');
  const [layoutId, setLayoutId] = useState(template.layoutId || CAROUSEL_LAYOUT_IDS[0]);
  const [typography, setTypography] = useState<CarouselTypography>(template.typography || {});

  const TYPE_LABELS: Record<string, string> = {
    aiGen: 'AI Generation',
    collage: 'Collage',
    voice: 'Voice',
    overlay: 'Overlay',
    carousel_script: 'Carousel Script',
    carousel_style: 'Carousel Style',
  };

  const handleSaveChanges = async () => {
    if (!title || !description) {
      setError('Title and description are required');
      return;
    }

    if (template.type === 'carousel_style' && !visualBible) {
      setError('Visual Bible is required for carousel styles');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await db.updateTemplate(template.id, {
        title,
        description,
        ...(template.type !== 'voice' && template.type !== 'carousel_script' && template.type !== 'carousel_style' && { content }),
        ...(template.type === 'voice' && { voiceId }),
        ...(template.type !== 'carousel_script' && template.type !== 'carousel_style' && { referenceVideoUrl: referenceVideoUrl || '' }),
        ...(template.type === 'carousel_script' && {
          content,
          slideCount: { min: Number(slideMin) || 5, max: Number(slideMax) || 10, default: Number(slideDefault) || 7 },
          roles: roles.split(',').map(r => r.trim()).filter(Boolean),
          maxCharsPerSlide: Number(maxCharsPerSlide) || undefined,
          captionStyle: captionStyle || undefined,
        }),
        ...(template.type === 'carousel_style' && {
          visualBible,
          imagePromptHints: imagePromptHints || undefined,
          negative,
          layoutId,
          typography,
        }),
      });

      setIsEditing(false);
      onUpdate();
    } catch (err: any) {
      setError('Failed to save changes: ' + (err.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    setIsDeleting(true);
    setError('');

    try {
      await db.deleteTemplate(template.id);
      onUpdate();
    } catch (err: any) {
      setError('Failed to delete the template: ' + (err.message || ''));
      setIsDeleting(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setTitle(template.title);
    setDescription(template.description);
    setContent(template.content || '');
    setVoiceId(template.voiceId || '');
    setReferenceVideoUrl(template.referenceVideoUrl || '');
    setNewVideoUrl('');
    setSlideMin(String(template.slideCount?.min ?? 5));
    setSlideMax(String(template.slideCount?.max ?? 10));
    setSlideDefault(String(template.slideCount?.default ?? 7));
    setRoles((template.roles || []).join(','));
    setMaxCharsPerSlide(String(template.maxCharsPerSlide ?? ''));
    setCaptionStyle(template.captionStyle || '');
    setVisualBible(template.visualBible || '');
    setImagePromptHints(template.imagePromptHints || '');
    setNegative(template.negative || '');
    setLayoutId(template.layoutId || CAROUSEL_LAYOUT_IDS[0]);
    setTypography(template.typography || {});
    setError('');
  };

  const typeIcon = template.type === 'aiGen' ? <Wand2 size={16} />
    : template.type === 'voice' ? <Mic size={16} />
    : template.type === 'carousel_script' ? <List size={16} />
    : template.type === 'carousel_style' ? <Palette size={16} />
    : <FileText size={16} />;

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 style={{ fontSize: '1.4rem', margin: 0 }}>
            {isEditing ? 'Edit Template' : template.title}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {typeIcon} {TYPE_LABELS[template.type] || template.type}
          </p>
        </div>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Title */}
        <div className="form-group">
          <label className="form-label">Title</label>
          {isEditing ? (
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={isSaving}
            />
          ) : (
            <p style={{ fontSize: '0.95rem', color: '#fff', margin: '0.4rem 0 0' }}>{template.title}</p>
          )}
        </div>

        {/* Short Description */}
        <div className="form-group">
          <label className="form-label">Short Description</label>
          {isEditing ? (
            <input
              type="text"
              className="form-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={isSaving}
            />
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', lineHeight: '1.5' }}>
              {template.description}
            </p>
          )}
        </div>

        {/* Voice ID (only for type 'voice') */}
        {template.type === 'voice' && (
          <div className="form-group">
            <label className="form-label">ElevenLabs Voice ID</label>
            {isEditing ? (
              <input
                type="text"
                className="form-input"
                value={voiceId}
                onChange={e => setVoiceId(e.target.value)}
                disabled={isSaving}
                placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                style={{ fontFamily: 'monospace' }}
              />
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', fontFamily: 'monospace' }}>
                {template.voiceId || 'None'}
              </p>
            )}
          </div>
        )}

        {/* Content (full template body — not shown for voice or carousel_style, which use visualBible instead) */}
        {template.type !== 'voice' && template.type !== 'carousel_style' && <div className="form-group">
          <label className="form-label">
            {template.type === 'aiGen' ? 'System Prompt / Generation Instructions' : 'Script Structure / Guidelines'}
          </label>
          {isEditing ? (
            <textarea
              className="form-textarea"
              value={content}
              onChange={e => setContent(e.target.value)}
              disabled={isSaving}
              rows={16}
              style={{ fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: '1.6' }}
            />
          ) : (
            template.content ? (
              <pre style={{
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                margin: '0.4rem 0 0',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'rgba(0,0,0,0.3)',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                {template.content}
              </pre>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.4rem 0 0' }}>No content</p>
            )
          )}
        </div>}

        {/* carousel_script fields (TTC-56 Fase 3) */}
        {template.type === 'carousel_script' && (
          <>
            <div className="form-group">
              <label className="form-label">Slide count</label>
              {isEditing ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <input type="number" className="form-input" value={slideMin} onChange={e => setSlideMin(e.target.value)} disabled={isSaving} placeholder="min" />
                  <input type="number" className="form-input" value={slideMax} onChange={e => setSlideMax(e.target.value)} disabled={isSaving} placeholder="max" />
                  <input type="number" className="form-input" value={slideDefault} onChange={e => setSlideDefault(e.target.value)} disabled={isSaving} placeholder="default" />
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0' }}>
                  {template.slideCount ? `${template.slideCount.default} (range ${template.slideCount.min}-${template.slideCount.max})` : 'Not set'}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Roles per slide</label>
              {isEditing ? (
                <input type="text" className="form-input" value={roles} onChange={e => setRoles(e.target.value)} disabled={isSaving} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
              ) : (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', fontFamily: 'monospace' }}>
                  {(template.roles || []).join(', ') || 'Not set'}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Max chars per slide</label>
              {isEditing ? (
                <input type="number" className="form-input" value={maxCharsPerSlide} onChange={e => setMaxCharsPerSlide(e.target.value)} disabled={isSaving} />
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0' }}>{template.maxCharsPerSlide ?? 'Not set'}</p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Caption style</label>
              {isEditing ? (
                <input type="text" className="form-input" value={captionStyle} onChange={e => setCaptionStyle(e.target.value)} disabled={isSaving} />
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0' }}>{template.captionStyle || 'Not set'}</p>
              )}
            </div>
          </>
        )}

        {/* carousel_style fields (TTC-56 Fase 3) */}
        {template.type === 'carousel_style' && (
          <>
            <div className="form-group">
              <label className="form-label">Visual Bible</label>
              {isEditing ? (
                <textarea className="form-textarea" value={visualBible} onChange={e => setVisualBible(e.target.value)} disabled={isSaving} rows={5} style={{ fontSize: '0.85rem', lineHeight: '1.6' }} />
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', lineHeight: '1.6' }}>{template.visualBible || 'Not set'}</p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Image Prompt Hints</label>
              {isEditing ? (
                <textarea className="form-textarea" value={imagePromptHints} onChange={e => setImagePromptHints(e.target.value)} disabled={isSaving} rows={3} style={{ fontSize: '0.85rem', lineHeight: '1.6' }} />
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', lineHeight: '1.6' }}>{template.imagePromptHints || 'Not set'}</p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Negative prompt</label>
              {isEditing ? (
                <textarea className="form-textarea" value={negative} onChange={e => setNegative(e.target.value)} disabled={isSaving} rows={2} style={{ fontSize: '0.78rem' }} />
              ) : (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.4rem 0 0' }}>{template.negative || 'Not set'}</p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Layout</label>
              {isEditing ? (
                <select className="form-select" value={layoutId} onChange={e => setLayoutId(e.target.value)} disabled={isSaving}>
                  {CAROUSEL_LAYOUT_IDS.map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', fontFamily: 'monospace' }}>{template.layoutId || 'Not set'}</p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Typography</label>
              {isEditing ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <input type="text" className="form-input" placeholder="text color #fff" value={typography.color || ''} onChange={e => setTypography(p => ({ ...p, color: e.target.value || undefined }))} disabled={isSaving} />
                  <input type="text" className="form-input" placeholder="accent color #ff3df0" value={typography.accentColor || ''} onChange={e => setTypography(p => ({ ...p, accentColor: e.target.value || undefined }))} disabled={isSaving} />
                  <select className="form-select" value={typography.textPosition || 'bottom'} onChange={e => setTypography(p => ({ ...p, textPosition: e.target.value as CarouselTypography['textPosition'] }))} disabled={isSaving}>
                    <option value="top">top</option>
                    <option value="center">center</option>
                    <option value="bottom">bottom</option>
                  </select>
                  <select className="form-select" value={typography.background || 'none'} onChange={e => setTypography(p => ({ ...p, background: e.target.value as CarouselTypography['background'] }))} disabled={isSaving}>
                    <option value="none">none</option>
                    <option value="band">band</option>
                    <option value="blur">blur</option>
                    <option value="gradient">gradient</option>
                  </select>
                </div>
              ) : (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.4rem 0 0' }}>
                  color: {template.typography?.color || 'default'} · accent: {template.typography?.accentColor || 'default'} · position: {template.typography?.textPosition || 'default'} · background: {template.typography?.background || 'default'}
                </p>
              )}
            </div>
          </>
        )}

        {/* Reference Video (not applicable to carousel templates) */}
        {template.type !== 'carousel_script' && template.type !== 'carousel_style' && <div className="form-group">
          <label className="form-label">Reference Video (Optional)</label>
          {isEditing ? (
            referenceVideoUrl ? (
              <div style={{ position: 'relative', aspectRatio: '9/16', width: '120px', borderRadius: '8px', overflow: 'hidden', background: '#000', border: '1px solid var(--border)', marginTop: '0.5rem' }}>
                <video src={referenceVideoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {!isSaving && (
                  <button
                    type="button"
                    onClick={() => setReferenceVideoUrl('')}
                    style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', cursor: 'pointer' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="url"
                  className="form-input"
                  value={newVideoUrl}
                  onChange={e => setNewVideoUrl(e.target.value)}
                  placeholder="https://example.com/video.mp4"
                  disabled={isSaving}
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
                  disabled={isSaving}
                >
                  Add
                </button>
              </div>
            )
          ) : (
            template.referenceVideoUrl ? (
              <a href={template.referenceVideoUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'none', marginTop: '0.4rem', display: 'inline-block' }}>
                View video
              </a>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.4rem 0 0' }}>None</p>
            )
          )}
        </div>}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {isEditing ? (
          <>
            <button className="btn btn-primary" onClick={handleSaveChanges} disabled={isSaving} style={{ width: '100%' }}>
              {isSaving ? <><RefreshCw size={16} className="loading-spinner" /> Saving...</> : <><Save size={16} /> Save Changes</>}
            </button>
            <button className="btn btn-secondary" onClick={cancelEdit} disabled={isSaving} style={{ width: '100%' }}>
              Cancel
            </button>
          </>
        ) : showDeleteConfirm ? (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              Delete this template? This cannot be undone.
            </p>
            <button
              className="btn btn-danger"
              onClick={handleDeleteTemplate}
              disabled={isDeleting}
              style={{ width: '100%', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
            >
              {isDeleting ? <><RefreshCw size={16} className="loading-spinner" /> Deleting...</> : <><Trash2 size={16} /> Yes, Delete</>}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting} style={{ width: '100%' }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={() => setIsEditing(true)} style={{ width: '100%' }}>
              <Edit2 size={16} /> Edit Template
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                width: '100%',
                background: 'rgba(239, 68, 68, 0.08)',
                color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                padding: '0.65rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                fontWeight: 600
              }}
            >
              <Trash2 size={16} /> Delete Template
            </button>
          </>
        )}
      </div>
    </>
  );
};
