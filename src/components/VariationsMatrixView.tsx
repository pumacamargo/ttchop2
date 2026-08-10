import React, { useState, useEffect } from 'react';
import { db } from '../services/databaseService';
import type { Product, Session, Template } from '../services/databaseService';
import { AlertTriangle, RefreshCw, Sparkles, Mic, FileText, MessageSquare, Settings, Film, Layers } from 'lucide-react';
import { useT } from '../context/LanguageContext';

type Stage = 'setup' | 'generating_dialogue' | 'review' | 'generating_collage' | 'done';

interface VariationsMatrixViewProps {
  initialMasterVideo?: any;
  onGoToRenders?: () => void;
  serverMode?: boolean;
}

const REGION_LANGUAGE: Record<string, string> = { jp: 'Japanese', mx: 'Spanish (Mexico)' };

export const VariationsMatrixView: React.FC<VariationsMatrixViewProps> = ({ onGoToRenders, serverMode = false }) => {
  const t = useT();
  const [products, setProducts] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [voiceTemplates, setVoiceTemplates] = useState<Template[]>([]);
  const [collageTemplates, setCollageTemplates] = useState<Template[]>([]);
  const [overlayTemplates, setOverlayTemplates] = useState<Template[]>([]);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectedVoiceTemplateId, setSelectedVoiceTemplateId] = useState('');
  const [selectedCollageTemplateId, setSelectedCollageTemplateId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [needsOverlay, setNeedsOverlay] = useState(false);
  const [selectedOverlayTemplateId, setSelectedOverlayTemplateId] = useState('');

  const [stage, setStage] = useState<Stage>('setup');
  const [currentStep, setCurrentStep] = useState('');
  const [dialogue, setDialogue] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const [prods, allSessions, allTemplates] = await Promise.all([
        db.getProducts(),
        db.getSessions(),
        db.getTemplates()
      ]);
      const voices = allTemplates.filter(t => t.type === 'voice');
      setProducts(prods);
      setSessions(allSessions);
      setVoiceTemplates(voices);
      setCollageTemplates(allTemplates.filter(t => t.type === 'collage'));
      setOverlayTemplates(allTemplates.filter(t => t.type === 'overlay'));
      const announcer = voices.find(t => t.title.toLowerCase().includes('announcer'));
      if (announcer) setSelectedVoiceTemplateId(announcer.id);
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (product?.region) {
      setSelectedLanguage(REGION_LANGUAGE[product.region] || 'English');
    }
  }, [selectedProductId, products]);

  const getSessionProduct = (s: Session) => products.find(p => s.productIds?.includes(p.id));

  const REGIONS = [
    { key: 'mx', label: t.region_mx, flag: '🇲🇽' },
    { key: 'jp', label: t.region_jp, flag: '🇯🇵' },
  ];

  const toggleSession = (session: Session) => {
    const id = session.id;
    setErrorMsg('');
    setSelectedSessionIds(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(s => s !== id);
        if (next.length === 0) setSelectedProductId('');
        return next;
      } else {
        setSelectedProductId(session.productIds?.[0] || '');
        return [...prev, id];
      }
    });
  };

  const canGenerate = selectedProductId && selectedSessionIds.length > 0;
  const isLoading = stage === 'generating_dialogue' || stage === 'generating_collage';
  const setupDisabled = isLoading || stage === 'review' || stage === 'done';

  const handleGenerateDialogue = async () => {
    if (!canGenerate) return;
    setStage('generating_dialogue');
    setErrorMsg('');
    setDialogue('');

    try {
      const selectedVoice = voiceTemplates.find(t => t.id === selectedVoiceTemplateId);
      const text = await db.generateDialogue(
        selectedProductId,
        selectedSessionIds,
        selectedVoice?.voiceId || '',
        selectedCollageTemplateId,
        selectedLanguage,
        (step) => setCurrentStep(step)
      );
      setDialogue(text);
      setStage('review');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error generating dialogue.');
      setStage('setup');
    }
  };

  const [renderId, setRenderId] = useState('');

  const handleGenerateCollage = async () => {
    if (!dialogue.trim()) return;
    setRenderId('');
    setStage('generating_collage');
    setErrorMsg('');

    try {
      const selectedVoice = voiceTemplates.find(t => t.id === selectedVoiceTemplateId);

      const id = await db.generateCollageVideo(
        selectedProductId,
        selectedSessionIds,
        selectedVoice?.voiceId || '',
        selectedCollageTemplateId,
        selectedLanguage,
        dialogue,
        (step) => setCurrentStep(step),
        needsOverlay,
        selectedOverlayTemplateId
      );
      setRenderId(id);
      setStage('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error generating collage.');
      setStage('review');
    }
  };

  const handleReset = () => {
    setStage('setup');
    setDialogue('');
    setErrorMsg('');
    setCurrentStep('');
  };

  return (
    <div className="view-content" style={{ paddingBottom: '7rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* ── SECTION 1: SETUP ── */}
      <div>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <Settings size={18} /> {t.collage_setup}
        </h3>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Sessions grouped by region */}
          <div className="form-group">
            <label className="form-label">{t.collage_session_label}</label>
            {sessions.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                {t.collage_no_sessions}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
                {REGIONS.map(({ key, label, flag }) => {
                  const regionSessions = sessions.filter(s => getSessionProduct(s)?.region === key);
                  if (regionSessions.length === 0) return null;
                  return (
                    <div key={key}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                        {flag} {label}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {regionSessions.map(s => {
                          const product = getSessionProduct(s);
                          const isSelected = selectedSessionIds.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              onClick={() => toggleSession(s)}
                              disabled={setupDisabled}
                              style={{
                                background: isSelected ? 'var(--gradient)' : 'rgba(109,59,215,0.08)',
                                border: isSelected ? '1px solid transparent' : '1px solid rgba(109,59,215,0.25)',
                                color: isSelected ? '#fff' : 'var(--text-primary)',
                                padding: '0.65rem 0.9rem',
                                borderRadius: '8px',
                                cursor: setupDisabled ? 'default' : 'pointer',
                                textAlign: 'left',
                                fontSize: '0.88rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                {product?.modelSheetUrls?.[0] && (
                                  <img
                                    src={product.modelSheetUrls[0]}
                                    alt=""
                                    style={{ width: 34, height: 34, borderRadius: '6px', objectFit: 'cover', flexShrink: 0, opacity: isSelected ? 1 : 0.7 }}
                                  />
                                )}
                                <span style={{ fontWeight: 600 }}>{s.name}</span>
                              </div>
                              <span style={{ fontSize: '0.72rem', opacity: 0.75, whiteSpace: 'nowrap' }}>{s.videos.length} clips</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Sessions without a linked product — shown at bottom */}
                {(() => {
                  const unlinked = sessions.filter(s => !getSessionProduct(s));
                  if (unlinked.length === 0) return null;
                  return (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                        {t.sin_product}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {unlinked.map(s => {
                          const isSelected = selectedSessionIds.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              onClick={() => toggleSession(s)}
                              disabled={setupDisabled}
                              style={{
                                background: isSelected ? 'var(--gradient)' : 'rgba(109,59,215,0.08)',
                                border: isSelected ? '1px solid transparent' : '1px solid rgba(109,59,215,0.25)',
                                color: isSelected ? '#fff' : 'var(--text-primary)',
                                padding: '0.65rem 0.9rem',
                                borderRadius: '8px',
                                cursor: setupDisabled ? 'default' : 'pointer',
                                textAlign: 'left',
                                fontSize: '0.88rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>{s.name}</span>
                              <span style={{ fontSize: '0.72rem', opacity: 0.75, whiteSpace: 'nowrap' }}>{s.videos.length} clips</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Voice + Template + Language */}
          {selectedSessionIds.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <FileText size={13} /> {t.collage_template_label}
                </label>
                <select
                  className="form-select"
                  value={selectedCollageTemplateId}
                  onChange={e => setSelectedCollageTemplateId(e.target.value)}
                  disabled={setupDisabled}
                >
                  <option value="">{t.collage_no_template}</option>
                  {collageTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.collage_language_label}</label>
                <select
                  className="form-select"
                  value={selectedLanguage}
                  onChange={e => setSelectedLanguage(e.target.value)}
                  disabled={setupDisabled}
                >
                  <option value="English">English</option>
                  <option value="Spanish (Mexico)">Spanish (Mexico)</option>
                  <option value="Japanese">Japanese</option>
                </select>
              </div>
            </div>
          )}

          <button
            onClick={handleGenerateDialogue}
            className="btn btn-primary"
            disabled={!canGenerate || isLoading || stage === 'review' || stage === 'done'}
          >
            {stage === 'generating_dialogue'
              ? <><RefreshCw size={16} className="loading-spinner" /> {t.generating_dialogue}</>
              : <><MessageSquare size={16} /> {t.generate_dialogue}</>
            }
          </button>
        </div>
      </div>

      {/* ── SECTION 2: DIALOGUE ── */}
      <div>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)' }}>
          <MessageSquare size={18} /> {t.collage_dialogue}
        </h3>

        <div className="glass-card">
          <textarea
            className="form-textarea"
            value={dialogue}
            onChange={e => setDialogue(e.target.value)}
            disabled={stage === 'generating_collage' || stage === 'generating_dialogue' || stage === 'done'}
            rows={10}
            style={{
              fontSize: '0.88rem',
              lineHeight: '1.6',
              fontFamily: 'monospace',
              borderColor: stage === 'review' ? 'var(--accent)' : 'var(--border)',
              minHeight: '200px'
            }}
            placeholder={t.collage_dialogue_ph}
          />

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Mic size={13} /> {t.collage_voice_label}
            </label>
            <select
              className="form-select"
              value={selectedVoiceTemplateId}
              onChange={e => setSelectedVoiceTemplateId(e.target.value)}
              disabled={stage === 'generating_collage' || stage === 'generating_dialogue' || stage === 'done'}
            >
              <option value="">{t.collage_no_voice}</option>
              {voiceTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>

          {/* Overlay checkbox — visible once dialogue is ready, only in server mode */}
          {serverMode && stage !== 'setup' && stage !== 'generating_dialogue' && (
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={needsOverlay}
                  onChange={e => setNeedsOverlay(e.target.checked)}
                  disabled={stage === 'generating_collage' || stage === 'done'}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.88rem', fontWeight: 600, color: needsOverlay ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  <Layers size={14} /> {t.cal_add_overlay}
                </span>
              </label>
              {needsOverlay && (
                <select
                  className="form-select"
                  value={selectedOverlayTemplateId}
                  onChange={e => setSelectedOverlayTemplateId(e.target.value)}
                  disabled={stage === 'generating_collage' || stage === 'done'}
                >
                  <option value="">{t.cal_default_overlay}</option>
                  {overlayTemplates.map(tmpl => (
                    <option key={tmpl.id} value={tmpl.id}>{tmpl.title}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="glass-card" style={{
              borderColor: 'var(--danger)',
              background: 'rgba(239, 68, 68, 0.08)',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
              marginTop: '1rem'
            }}>
              <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>{errorMsg}</p>
            </div>
          )}

          {stage === 'done' && renderId && (
            <div style={{ marginTop: '1rem', textAlign: 'center', padding: '1rem', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid var(--success)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ color: 'var(--success)', fontWeight: 700, margin: 0 }}>{t.video_sent}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>{renderId}</p>
              {onGoToRenders && (
                <button onClick={onGoToRenders} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Film size={15} /> {t.go_to_renders}
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            {(stage === 'review' || stage === 'done') && (
              <button onClick={handleReset} className="btn btn-secondary" style={{ flex: 1 }}>
                {t.start_over}
              </button>
            )}
            <button
              onClick={handleGenerateCollage}
              className="btn btn-primary"
              disabled={!dialogue.trim() || (stage !== 'review' && stage !== 'done')}
              style={{
                flex: 2,
                boxShadow: dialogue.trim() && (stage === 'review' || stage === 'done') ? '0 8px 30px rgba(109,59,215,0.4)' : 'none'
              }}
            >
              {stage === 'generating_collage'
                ? <><RefreshCw size={16} className="loading-spinner" /> {currentStep || t.generating_collage}</>
                : <><Sparkles size={16} /> {t.generate_collage}</>
              }
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
