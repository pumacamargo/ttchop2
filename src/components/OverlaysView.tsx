import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/databaseService';
import type { Product, Render, Template } from '../services/databaseService';
import { AlertTriangle, RefreshCw, Layers, Upload, Film, FileText, ChevronDown, ChevronUp, Sparkles, CheckCircle, ClipboardCopy, CalendarDays } from 'lucide-react';
import { ProductPicker } from './ProductPicker';
import { useT } from '../context/LanguageContext';

type VideoSource = 'render' | 'upload';
type UploadState = 'idle' | 'uploading' | 'done' | 'error';
type Stage = 'setup' | 'sending' | 'done' | 'error';

interface OverlaysViewProps {
  onGoToCalendar?: () => void;
}

export const OverlaysView: React.FC<OverlaysViewProps> = ({ onGoToCalendar }) => {
  const t = useT();
  const [products, setProducts] = useState<Product[]>([]);
  const [renders, setRenders] = useState<Render[]>([]);
  const [overlayTemplates, setOverlayTemplates] = useState<Template[]>([]);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [videoSource, setVideoSource] = useState<VideoSource>('render');
  const [selectedRenderId, setSelectedRenderId] = useState('');

  // Upload state
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showTemplateContent, setShowTemplateContent] = useState(false);

  const [stage, setStage] = useState<Stage>('setup');
  const [currentStep, setCurrentStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [cachoCopied, setCachoCopied] = useState(false);

  const handleCachoText = () => {
    const productUrl = `https://ttchop.web.app/p/${selectedProductId}`;
    const text = `generacion de overlay:\nvideo: ${resolvedVideoUrl}\nproducto: ${productUrl}`;
    navigator.clipboard.writeText(text).then(() => {
      setCachoCopied(true);
      setTimeout(() => setCachoCopied(false), 2000);
    });
  };

  useEffect(() => {
    Promise.all([db.getProducts(), db.getRenders(), db.getTemplates()]).then(
      ([prods, rends, templates]) => {
        setProducts(prods);
        setRenders(rends.filter(r => r.status === 'done' && r.videoUrl));
        setOverlayTemplates(templates.filter(t => t.type === 'overlay'));
      }
    );
  }, []);

  const filteredRenders = selectedProductId
    ? renders.filter(r => r.productId === selectedProductId)
    : [];

  const selectedRender = filteredRenders.find(r => r.id === selectedRenderId);

  const resolvedVideoUrl =
    videoSource === 'render' ? (selectedRender?.videoUrl ?? '') : uploadedUrl;

  const canSend =
    !!selectedProductId &&
    !!resolvedVideoUrl &&
    (videoSource === 'render' ? !!selectedRenderId : uploadState === 'done');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadState('uploading');
    setUploadError('');
    setUploadedUrl('');
    setUploadedFileName(file.name);
    try {
      const url = await db.uploadOverlayVideo(file, () => {});
      setUploadedUrl(url);
      setUploadState('done');
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed.');
      setUploadState('error');
    }
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetUpload = () => {
    setUploadState('idle');
    setUploadedUrl('');
    setUploadedFileName('');
    setUploadError('');
  };

  const [renderId, setRenderId] = useState('');

  const handleSend = async () => {
    if (!canSend) return;
    setRenderId('');
    setStage('sending');
    setErrorMsg('');
    try {
      const id = await db.generateOverlay(
        selectedProductId,
        resolvedVideoUrl,
        selectedTemplateId,
        (step) => setCurrentStep(step),
        // Solo cuando la fuente es un render nuestro hay receta que heredar. Si el usuario
        // subió un archivo suelto, el overlay nace sin metadata de generación.
        videoSource === 'render' ? selectedRenderId : undefined
      );
      setRenderId(id);
      setStage('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error sending overlay request.');
      setStage('error');
    }
  };


  const isSending = stage === 'sending';
  const disabled = isSending;

  return (
    <div className="view-content" style={{ paddingBottom: '7rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* ── SECTION 1: PRODUCT ── */}
      <div>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <Layers size={18} /> {t.overlay_section1}
        </h3>
        <div className="glass-card">
          <div className="form-group">
            <label className="form-label">{t.overlay_select_product}</label>
            <ProductPicker
              products={products}
              selectedProductId={selectedProductId}
              onChange={id => { setSelectedProductId(id); setSelectedRenderId(''); }}
              disabled={disabled}
            />
          </div>

          {selectedProductId && (() => {
            const product = products.find(p => p.id === selectedProductId);
            if (!product?.description) return null;
            return (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
                {product.description.length > 200
                  ? product.description.slice(0, 200) + '…'
                  : product.description}
              </p>
            );
          })()}
        </div>
      </div>

      {/* ── SECTION 2: VIDEO ── */}
      <div>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)' }}>
          <Film size={18} /> {t.overlay_section2}
        </h3>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Source toggle */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {([
              { key: 'render', label: t.overlay_from_renders, icon: <Film size={14} /> },
              { key: 'upload', label: t.overlay_upload,       icon: <Upload size={14} /> },
            ] as { key: VideoSource; label: string; icon: React.ReactNode }[]).map(opt => (
              <button
                key={opt.key}
                onClick={() => { setVideoSource(opt.key); resetUpload(); setSelectedRenderId(''); }}
                disabled={disabled}
                style={{
                  flex: 1, padding: '0.55rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600,
                  cursor: disabled ? 'default' : 'pointer',
                  background: videoSource === opt.key ? 'var(--gradient)' : 'rgba(109,59,215,0.08)',
                  color: videoSource === opt.key ? '#fff' : 'var(--text-secondary)',
                  border: videoSource === opt.key ? '1px solid transparent' : '1px solid rgba(109,59,215,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {/* From renders */}
          {videoSource === 'render' && !selectedProductId && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
              {t.overlay_select_first}
            </p>
          )}
          {videoSource === 'render' && selectedProductId && (
            filteredRenders.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
                {t.overlay_no_renders}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredRenders.map(r => {
                  const isSelected = r.id === selectedRenderId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRenderId(r.id)}
                      disabled={disabled}
                      style={{
                        background: isSelected ? 'rgba(109,59,215,0.18)' : 'rgba(109,59,215,0.04)',
                        border: isSelected ? '1px solid var(--primary)' : '1px solid rgba(109,59,215,0.2)',
                        borderRadius: '8px', padding: '0.65rem 0.85rem',
                        cursor: disabled ? 'default' : 'pointer',
                        textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '1px 7px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, marginBottom: '3px',
                          background: r.type === 'ai' ? 'rgba(168,85,247,0.18)' : r.type === 'overlay' ? 'rgba(245,158,11,0.18)' : 'rgba(76,215,246,0.18)',
                          color: r.type === 'ai' ? 'var(--accent)' : r.type === 'overlay' ? '#f59e0b' : 'var(--secondary)',
                          border: r.type === 'ai' ? '1px solid rgba(168,85,247,0.3)' : r.type === 'overlay' ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(76,215,246,0.3)',
                        }}>
                          {r.type === 'ai' ? 'Video AI' : r.type === 'overlay' ? 'Overlay' : 'Collage'}
                        </span>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.productName}
                        </p>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          )}

          {/* Upload */}
          {videoSource === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
                disabled={disabled || uploadState === 'uploading'}
              />

              {uploadState === 'idle' && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  style={{
                    border: '2px dashed rgba(109,59,215,0.4)', borderRadius: '10px',
                    background: 'rgba(109,59,215,0.04)', padding: '1.5rem',
                    cursor: disabled ? 'default' : 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <Upload size={24} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.overlay_tap_select}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MP4, MOV, etc.</span>
                </button>
              )}

              {uploadState === 'uploading' && (
                <div style={{
                  border: '1px solid rgba(109,59,215,0.3)', borderRadius: '10px',
                  background: 'rgba(109,59,215,0.06)', padding: '1.25rem',
                  display: 'flex', alignItems: 'center', gap: '0.75rem'
                }}>
                  <RefreshCw size={18} className="loading-spinner" style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{t.overlay_uploading}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0', wordBreak: 'break-all' }}>
                      {uploadedFileName}
                    </p>
                  </div>
                </div>
              )}

              {uploadState === 'done' && (
                <div style={{
                  border: '1px solid rgba(16,185,129,0.4)', borderRadius: '10px',
                  background: 'rgba(16,185,129,0.06)', padding: '1rem',
                  display: 'flex', alignItems: 'center', gap: '0.75rem'
                }}>
                  <CheckCircle size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0, color: 'var(--success)' }}>{t.overlay_uploaded}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0', wordBreak: 'break-all' }}>
                      {uploadedFileName}
                    </p>
                  </div>
                  {!disabled && (
                    <button
                      onClick={() => { resetUpload(); fileInputRef.current?.click(); }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}
                    >
                      {t.overlay_change}
                    </button>
                  )}
                </div>
              )}

              {uploadState === 'error' && (
                <div style={{
                  border: '1px solid rgba(239,68,68,0.4)', borderRadius: '10px',
                  background: 'rgba(239,68,68,0.06)', padding: '1rem',
                  display: 'flex', flexDirection: 'column', gap: '0.5rem'
                }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--danger)', margin: 0, fontWeight: 600 }}>{t.overlay_upload_failed}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>{uploadError}</p>
                  <button
                    onClick={() => { resetUpload(); fileInputRef.current?.click(); }}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', padding: 0, textAlign: 'left' }}
                  >
                    {t.overlay_try_again}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 3: OVERLAY TEMPLATE ── */}
      <div>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary)' }}>
          <FileText size={18} /> {t.overlay_section3}
        </h3>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {overlayTemplates.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
              {t.overlay_no_templates}
            </p>
          ) : (
            <select
              className="form-select"
              value={selectedTemplateId}
              onChange={e => { setSelectedTemplateId(e.target.value); setShowTemplateContent(false); }}
              disabled={disabled}
            >
              <option value="">{t.overlay_no_template_opt}</option>
              {overlayTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          )}

          {selectedTemplateId && (() => {
            const tpl = overlayTemplates.find(t => t.id === selectedTemplateId);
            if (!tpl) return null;
            return (
              <>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{tpl.description}</p>
                {tpl.content && (
                  <>
                    <button
                      onClick={() => setShowTemplateContent(v => !v)}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                    >
                      {showTemplateContent ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {showTemplateContent ? t.overlay_hide_content : t.overlay_view_content}
                    </button>
                    {showTemplateContent && (
                      <pre style={{
                        fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)',
                        borderRadius: '6px', padding: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: '200px', overflow: 'auto', margin: 0
                      }}>
                        {tpl.content}
                      </pre>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* ── SEND ── */}
      <div className="glass-card">
        {errorMsg && (
          <div style={{
            display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
            background: 'rgba(239,68,68,0.08)', border: '1px solid var(--danger)',
            borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem'
          }}>
            <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>{errorMsg}</p>
          </div>
        )}

        {stage === 'done' && renderId && (
          <div style={{ marginBottom: '0.75rem', textAlign: 'center', padding: '1rem', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid var(--success)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ color: 'var(--success)', fontWeight: 700, margin: 0 }}>{t.video_sent}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>{renderId}</p>
            {onGoToCalendar && (
              <button onClick={onGoToCalendar} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <CalendarDays size={15} /> {t.go_to_calendar}
              </button>
            )}
          </div>
        )}

        <button
          onClick={handleSend}
          className="btn btn-primary"
          disabled={!canSend || isSending}
          style={{
            width: '100%',
            boxShadow: canSend && !isSending ? '0 8px 30px rgba(109,59,215,0.4)' : 'none'
          }}
        >
          {isSending
            ? <><RefreshCw size={16} className="loading-spinner" /> {currentStep || t.overlay_sending}</>
            : <><Sparkles size={16} /> {t.overlay_generate}</>
          }
        </button>

        {/* Generate Cacho Text */}
        <button
          onClick={handleCachoText}
          disabled={!canSend}
          style={{
            width: '100%',
            marginTop: '0.5rem',
            background: cachoCopied ? 'rgba(16,185,129,0.15)' : 'rgba(109,59,215,0.08)',
            border: `1px solid ${cachoCopied ? 'rgba(16,185,129,0.4)' : 'rgba(109,59,215,0.25)'}`,
            borderRadius: '10px',
            padding: '0.65rem 1rem',
            color: cachoCopied ? 'var(--success)' : 'var(--text-secondary)',
            cursor: canSend ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '0.82rem',
            fontWeight: 600,
            opacity: canSend ? 1 : 0.4,
            transition: 'all 0.2s',
          }}
        >
          <ClipboardCopy size={14} />
          {cachoCopied ? t.copied : t.overlay_cacho_text}
        </button>
      </div>
    </div>
  );
};
