import React, { useState } from 'react';
import { isGeneralContainer } from '../services/databaseService';
import type { Product, Session } from '../services/databaseService';
import { Video, Plus, ShieldAlert, RefreshCw, Clapperboard, Globe } from 'lucide-react';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';

const THUMB = 44;
const OFFSET = 28; // visible width per extra thumb

// Stacked product-photo thumbnails for a session's linked products. Shared between the
// standalone sessions list and the per-product Clips tab.
export const SessionThumbs: React.FC<{ productIds: string[]; products: Product[] }> = ({ productIds, products }) => {
  const thumbs = productIds
    .map(id => products.find(p => p.id === id)?.modelSheetUrls?.[0])
    .filter(Boolean) as string[];

  if (thumbs.length === 0) {
    return (
      <div style={{
        width: THUMB, height: THUMB, borderRadius: '12px', flexShrink: 0,
        border: '1px solid var(--primary-glow)', background: 'var(--primary-glow)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Video size={20} style={{ color: 'var(--primary)' }} />
      </div>
    );
  }

  const show = Math.min(thumbs.length, 3);
  const extra = thumbs.length - show;
  const containerWidth = THUMB + (show - 1) * OFFSET + (extra > 0 ? OFFSET : 0);

  return (
    <div style={{ position: 'relative', width: containerWidth, height: THUMB, flexShrink: 0 }}>
      {thumbs.slice(0, show).map((url, i) => (
        <img
          key={url}
          src={url}
          alt=""
          style={{
            position: 'absolute', left: i * OFFSET,
            width: THUMB, height: THUMB,
            borderRadius: '10px', objectFit: 'cover',
            border: '2px solid var(--bg-space)', zIndex: i + 1,
          }}
        />
      ))}
      {extra > 0 && (
        <div style={{
          position: 'absolute', left: show * OFFSET,
          width: THUMB, height: THUMB, borderRadius: '10px',
          background: 'var(--primary-hover)', border: '2px solid var(--bg-space)',
          zIndex: show + 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)',
        }}>
          +{extra}
        </div>
      )}
    </div>
  );
};

interface SessionsPanelProps {
  sessions: Session[];
  products: Product[];
  loading: boolean;
  errorMsg: string;
  onRetry?: () => void;
  /** Group sessions by the region of their linked products (used by the standalone Clips nav). */
  groupByRegion?: boolean;
  emptyTitle: string;
  emptyHint: string;
  createLabel: string;
  onCreate: (name: string) => Promise<void>;
  onSelect: (session: Session) => void;
}

// Shared "list of sessions + create form" UI, extracted so both the standalone Clips nav
// (SessionsView) and a product's Clips tab (ProductClipsTab) can reuse the exact same CRUD
// affordances without duplicating markup. Fetching stays with the caller since the two contexts
// query different scopes (all sessions vs. sessions for one product).
export const SessionsPanel: React.FC<SessionsPanelProps> = ({
  sessions, products, loading, errorMsg, onRetry, groupByRegion, emptyTitle, emptyHint, createLabel, onCreate, onSelect,
}) => {
  const t = useT();
  const { activeAccountId } = useContainer();
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError(t.session_name_required);
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      await onCreate(name.trim());
      setName('');
      setShowAddForm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setFormError(t.create_session_failed + msg);
    } finally {
      setSaving(false);
    }
  };

  const productNames = (ids: string[]) =>
    ids.map(id => products.find(p => p.id === id)?.name).filter(Boolean) as string[];

  const SessionCard: React.FC<{ s: Session }> = ({ s }) => (
    <div
      className="glass-card"
      style={{ display: 'flex', gap: '1rem', cursor: 'pointer', alignItems: 'center', minHeight: '44px' }}
      onClick={() => onSelect(s)}
    >
      <SessionThumbs productIds={s.productIds} products={products} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{s.name}</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '5px' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--secondary)', background: 'var(--secondary-glow)', padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--secondary-glow)' }}>
            {s.videos.length} {t.clips}
          </span>
          {/* Discreet "shared" cue — only meaningful once an account container is active. */}
          {!!activeAccountId && isGeneralContainer(s.accountId) && (
            <span
              title={t.container_general_hint}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px',
                fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-input)',
                padding: '2px 7px', borderRadius: '999px', border: '1px solid var(--border)',
              }}
            >
              <Globe size={10} /> {t.container_general_hint}
            </span>
          )}
          {productNames(s.productIds).map(pn => (
            <span key={pn} style={{ fontSize: '0.68rem', color: 'var(--primary)', background: 'var(--primary-glow)', padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--primary-glow)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px', whiteSpace: 'nowrap', display: 'inline-block' }}>
              {pn}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {!showAddForm && !loading && sessions.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button
            className="btn btn-primary"
            style={{ width: 'auto', minHeight: '44px', padding: '0 1rem' }}
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={16} /> {createLabel}
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="glass-card" style={{
          borderColor: 'var(--danger)',
          background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-start',
          marginBottom: '1.25rem',
          padding: '0.8rem 1rem'
        }}>
          <ShieldAlert size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>{errorMsg}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="btn btn-secondary"
                style={{ marginTop: '0.6rem', width: 'auto', minHeight: '36px', padding: '0 0.9rem', fontSize: '0.75rem' }}
              >
                <RefreshCw size={14} /> {t.retry}
              </button>
            )}
          </div>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleCreate} className="glass-card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>{t.new_session}</h3>

          {formError && (
            <p style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.75rem' }}>{formError}</p>
          )}

          <div className="form-group">
            <label className="form-label">{t.session_name}</label>
            <input
              type="text"
              className="form-input"
              placeholder={t.session_name_ph}
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><RefreshCw size={16} className="loading-spinner" /> {t.creating}</> : t.create_session}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowAddForm(false); setFormError(''); }} disabled={saving}>
              {t.cancel}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="glass-card pulsing-card" style={{ display: 'flex', gap: '1rem', height: '80px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: 'var(--bg-card-hover)', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
                <div style={{ height: '16px', background: 'var(--bg-card-hover)', width: '60%', borderRadius: '4px' }} />
                <div style={{ height: '12px', background: 'var(--bg-input)', width: '40%', borderRadius: '3px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          <Clapperboard size={48} style={{ opacity: 0.15, marginBottom: '1rem', color: 'var(--primary)' }} />
          <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{emptyTitle}</h4>
          <p style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>{emptyHint}</p>
          <button
            className="btn btn-primary"
            style={{ width: 'auto', minHeight: '44px', padding: '0 1.25rem', margin: '0 auto' }}
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={16} /> {createLabel}
          </button>
        </div>
      ) : !groupByRegion ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sessions.map(s => <SessionCard key={s.id} s={s} />)}
        </div>
      ) : (() => {
        const getRegion = (s: Session) => products.find(p => s.productIds?.includes(p.id))?.region;
        const REGIONS = [
          { key: 'mx', label: t.region_mx, flag: '🇲🇽' },
          { key: 'jp', label: t.region_jp, flag: '🇯🇵' },
        ];
        const unlinked = sessions.filter(s => !getRegion(s));

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {REGIONS.map(({ key, label, flag }) => {
              const group = sessions.filter(s => getRegion(s) === key);
              if (group.length === 0) return null;
              return (
                <div key={key}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 0.6rem' }}>
                    {flag} {label}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {group.map(s => <SessionCard key={s.id} s={s} />)}
                  </div>
                </div>
              );
            })}
            {unlinked.length > 0 && (
              <div>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 0.6rem' }}>
                  {t.sin_region}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {unlinked.map(s => <SessionCard key={s.id} s={s} />)}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
