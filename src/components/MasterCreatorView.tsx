import React, { useState, useEffect } from 'react';
import { db } from '../services/databaseService';
import type { Product, Template } from '../services/databaseService';
import { Sparkles, Play, Edit3, Settings, Film } from 'lucide-react';
import { ProductPicker } from './ProductPicker';
import { useT } from '../context/LanguageContext';

interface MasterCreatorViewProps {
  onGoToRenders?: () => void;
}

type CreatorStage = 'setup' | 'generating_prompt' | 'edit_prompt' | 'generating_video' | 'done';

export const MasterCreatorView: React.FC<MasterCreatorViewProps> = ({ onGoToRenders }) => {
  const t = useT();
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    const loadData = async () => {
      console.log('[VideoAI] loading products and templates...');
      const prods = await db.getProducts();
      const temps = await db.getTemplates();
      console.log(`[VideoAI] loaded ${prods.length} products:`, prods.map(p => ({ id: p.id, name: p.name })));
      console.log(`[VideoAI] loaded ${temps.length} templates — aiGen:`, temps.filter(t => t.type === 'aiGen').map(t => t.title));
      setProducts(prods);
      setTemplates(temps);
    };
    loadData();
  }, []);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [extraNotes, setExtraNotes] = useState('');
  const [selectedVideoProvider, setSelectedVideoProvider] = useState('Veo3');

  const aiGenTemplates = templates.filter(t => t.type === 'aiGen');

  const REGION_LANGUAGE: Record<string, string> = { jp: 'Japanese', mx: 'Spanish (Mexico)' };

  useEffect(() => {
    if (!selectedProductId) return;
    const product = products.find(p => p.id === selectedProductId);
    if (product?.region) {
      setSelectedLanguage(REGION_LANGUAGE[product.region] || 'english');
    }
  }, [selectedProductId, products]);
  
  // Processing State
  const [stage, setStage] = useState<CreatorStage>('setup');
  const [currentStep, setCurrentStep] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [taskId, setTaskId] = useState('');
  

  const handleGeneratePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !selectedTemplateId) return;

    setStage('generating_prompt');
    setGeneratedPrompt('');

    try {
      const prompt = await db.generatePromptFromWebhook(
        selectedProductId,
        selectedTemplateId,
        extraNotes,
        selectedLanguage,
        (step) => setCurrentStep(step)
      );
      setGeneratedPrompt(prompt);
      setStage('edit_prompt');
    } catch (err) {
      console.error(err);
      alert("Failed to generate the prompt");
      setStage('setup');
    }
  };

  const handleGenerateVideo = async () => {
    if (!generatedPrompt.trim()) {
      alert("The prompt cannot be empty");
      return;
    }
    setStage('generating_video');

    try {
      const id = await db.createMasterVideoFromWebhook(
        selectedProductId,
        selectedTemplateId,
        extraNotes,
        selectedLanguage,
        generatedPrompt,
        selectedVideoProvider,
        (step) => setCurrentStep(step)
      );
      console.log('✅ Video submitted, taskId:', id);
      setTaskId(id);
      setStage('done');
    } catch (err: any) {
      console.error('❌ Generate video error:', err);
      alert(`Failed to generate the master video: ${err?.message || err}`);
      setStage('edit_prompt');
    }
  };

  return (
    <div className="view-content">
      {stage === 'done' && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid var(--success)',
          borderRadius: '10px',
          padding: '0.85rem 1rem',
          marginBottom: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem'
        }}>
          <div>
            <p style={{ color: 'var(--success)', fontWeight: 700, margin: 0, fontSize: '0.9rem' }}>{t.video_sent}</p>
            {taskId && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'monospace' }}>{taskId}</p>}
          </div>
          {onGoToRenders && (
            <button onClick={onGoToRenders} className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Film size={13} /> Renders
            </button>
          )}
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)', marginBottom: '0.25rem' }}>Video AI</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {t.videoai_subtitle}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

        {/* SECTION 1: PROMPT SETUP AND GENERATION */}
        <div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
            <Settings size={18} /> {t.videoai_section1}
          </h3>
          <form onSubmit={handleGeneratePrompt} className="glass-card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t.videoai_select_product}</label>
                <ProductPicker
                  products={products}
                  selectedProductId={selectedProductId}
                  onChange={setSelectedProductId}
                  disabled={stage === 'generating_prompt' || stage === 'generating_video'}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t.videoai_ai_template}</label>
                <select
                  className="form-select"
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  disabled={stage === 'generating_prompt' || stage === 'generating_video'}
                  required
                >
                  <option value="" disabled>{t.videoai_choose_template}</option>
                  {aiGenTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.videoai_language}</label>
                <select
                  className="form-select"
                  value={selectedLanguage}
                  onChange={e => setSelectedLanguage(e.target.value)}
                  disabled={stage === 'generating_prompt' || stage === 'generating_video'}
                  required
                >
                  <option value="English">English</option>
                  <option value="Spanish (Mexico)">Spanish (Mexico)</option>
                  <option value="Japanese">Japanese</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <label className="form-label">{t.videoai_notes}</label>
              <textarea
                className="form-textarea"
                placeholder={t.videoai_notes_ph}
                value={extraNotes}
                onChange={e => setExtraNotes(e.target.value)}
                disabled={stage === 'generating_prompt' || stage === 'generating_video'}
                rows={2}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={stage === 'generating_prompt' || stage === 'generating_video'}
            >
              {stage === 'generating_prompt' ? (
                <><div className="loading-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}/> {t.videoai_connecting}</>
              ) : (
                <><Sparkles size={18} /> {t.videoai_gen_prompt}</>
              )}
            </button>
          </form>
        </div>

        {/* SECTION 2: PROMPT EDITING AND VIDEO GENERATION */}
        <div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)' }}>
            <Edit3 size={18} /> {t.videoai_section2}
          </h3>

          <div className="glass-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <textarea
                className="form-textarea"
                style={{
                  minHeight: '250px',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  borderColor: stage === 'edit_prompt' ? 'var(--accent)' : 'var(--border)'
                }}
                value={generatedPrompt}
                onChange={e => setGeneratedPrompt(e.target.value)}
                placeholder={t.videoai_prompt_ph}
              />

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{t.videoai_provider}</label>
                <select
                  className="form-select"
                  value={selectedVideoProvider}
                  onChange={e => setSelectedVideoProvider(e.target.value)}
                  disabled={stage === 'generating_prompt' || stage === 'generating_video'}
                >
                  <option value="Seedance">Seedance</option>
                  <option value="Veo3">Veo3</option>
                </select>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleGenerateVideo}
                style={{ width: '100%' }}
                disabled={stage === 'setup' || stage === 'generating_prompt' || stage === 'generating_video' || !generatedPrompt.trim()}
              >
                <Play size={18} /> {t.videoai_gen_video}
              </button>

              {stage === 'generating_prompt' && (
                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div className="loading-spinner" style={{ width: '30px', height: '30px', margin: '0 auto 1rem' }} />
                  <p style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>{currentStep}</p>
                </div>
              )}

              {stage === 'generating_video' && (
                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div className="loading-spinner" style={{ width: '30px', height: '30px', margin: '0 auto 1rem' }} />
                  <p style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>{currentStep}</p>
                </div>
              )}

              {stage === 'done' && (
                <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid var(--success)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ color: 'var(--success)', fontWeight: '700', margin: 0 }}>{t.videoai_submitted}</p>
                  {taskId && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>{t.videoai_task_id} {taskId}</p>}
                  {onGoToRenders && (
                    <button onClick={onGoToRenders} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Film size={15} /> {t.go_to_renders}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
