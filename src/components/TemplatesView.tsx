import React, { useState, useEffect } from 'react';
import { db } from '../services/databaseService';
import type { Template, TemplateType } from '../services/databaseService';
import { FileText, Wand2, Mic, Layers, Plus, ShieldAlert, Trash2, Globe } from 'lucide-react';
import { TemplateDetailModal } from './TemplateDetailModal';
import { useT } from '../context/LanguageContext';

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

  const filteredTemplates = templates.filter(t => t.type === activeType);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setContent('');
    setVoiceId('');
    setReferenceVideoUrl('');
    setNewVideoUrl('');
    setErrorMsg('');
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !description) {
      setErrorMsg("Title and description are required.");
      return;
    }

    try {
      const saved = await db.saveTemplate({
        type: activeType,
        title,
        description,
        ...(content && { content }),
        ...(voiceId && { voiceId }),
        ...(referenceVideoUrl && { referenceVideoUrl })
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
            {activeType === 'aiGen' ? 'New AI Generation Template' : activeType === 'voice' ? 'New Voice Template' : 'New Collage Template'}
          </h3>

          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              type="text"
              className="form-input"
              placeholder={activeType === 'aiGen' ? 'e.g. Ultra-Raw Casual UGC' : activeType === 'voice' ? 'e.g. Energetic Female' : 'e.g. Basic Creator Script'}
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

          {activeType === 'voice' ? (
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
          ) : (
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
            No {activeType === 'aiGen' ? 'AI generation' : activeType === 'voice' ? 'voice' : 'collage'} templates yet.
          </div>
        )}
        {filteredTemplates.map(t => (
          <div key={t.id} className="glass-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedTemplate(t)}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: t.type === 'aiGen' ? 'rgba(109,59,215,0.12)' : t.type === 'voice' ? 'rgba(76,215,246,0.12)' : 'rgba(168,85,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.type === 'aiGen' ? 'var(--primary)' : t.type === 'voice' ? 'var(--secondary)' : 'var(--accent)', flexShrink: 0 }}>
                {t.type === 'aiGen' ? <Wand2 size={20} /> : t.type === 'voice' ? <Mic size={20} /> : <FileText size={20} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontSize: '1rem', color: '#fff', margin: 0 }}>{t.title}</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.description}</p>
                {t.type === 'voice' && t.voiceId && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', fontFamily: 'monospace' }}>
                    ID: {t.voiceId}
                  </p>
                )}
                {t.type !== 'voice' && t.content && (
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
