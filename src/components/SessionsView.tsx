import React, { useEffect, useState } from 'react';
import { db } from '../services/databaseService';
import type { Product, Session } from '../services/databaseService';
import { Video, Plus, ShieldAlert, RefreshCw, Clapperboard } from 'lucide-react';
import { useT } from '../context/LanguageContext';

const THUMB = 44;
const OFFSET = 28; // visible width per extra thumb

const SessionThumbs: React.FC<{ productIds: string[]; products: Product[] }> = ({ productIds, products }) => {
  const thumbs = productIds
    .map(id => products.find(p => p.id === id)?.modelSheetUrls?.[0])
    .filter(Boolean) as string[];

  if (thumbs.length === 0) {
    return (
      <div style={{
        width: THUMB, height: THUMB, borderRadius: '12px', flexShrink: 0,
        border: '1px solid rgba(109,59,215,0.3)', background: 'rgba(109,59,215,0.1)',
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
          key={i}
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
          background: 'rgba(109,59,215,0.75)', border: '2px solid var(--bg-space)',
          zIndex: show + 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.78rem', fontWeight: 700, color: '#fff',
        }}>
          +{extra}
        </div>
      )}
    </div>
  );
};
import { SessionDetailModal } from './SessionDetailModal';

export const SessionsView: React.FC = () => {
  const t = useT();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sessionsData, productsData] = await Promise.all([db.getSessions(), db.getProducts()]);
      setSessions(sessionsData.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setProducts(productsData);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to connect to the sessions database.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Session name is required.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      await db.saveSession(name.trim(), []);
      setName('');
      setShowAddForm(false);
      await fetchAll();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to create the session: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const productNames = (ids: string[]) =>
    ids.map(id => products.find(p => p.id === id)?.name).filter(Boolean) as string[];

  if (selectedSession) {
    return (
      <div className="view-content">
        <SessionDetailModal
          session={selectedSession}
          onClose={() => {
            setSelectedSession(null);
            fetchAll();
          }}
          onDeleted={() => {
            setSelectedSession(null);
            fetchAll();
          }}
        />
      </div>
    );
  }

  return (
    <div className="view-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-heading)' }}>{t.recordings_title}</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{t.recordings_subtitle}</p>
        </div>
        {!showAddForm && !loading && (
          <button
            className="btn btn-primary"
            style={{ width: 'auto', minHeight: '40px', padding: '0 1rem' }}
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={16} /> {t.create_new_session}
          </button>
        )}
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

      {showAddForm && (
        <form onSubmit={handleCreateSession} className="glass-card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--primary)' }}>{t.new_session}</h3>

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
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddForm(false)} disabled={saving}>
              {t.cancel}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="glass-card pulsing-card" style={{ display: 'flex', gap: '1rem', height: '80px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
                <div style={{ height: '16px', background: 'rgba(255,255,255,0.05)', width: '60%', borderRadius: '4px' }} />
                <div style={{ height: '12px', background: 'rgba(255,255,255,0.03)', width: '40%', borderRadius: '3px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          <Clapperboard size={48} style={{ opacity: 0.15, marginBottom: '1rem', color: 'var(--primary)' }} />
          <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>{t.no_sessions}</h4>
          <p style={{ fontSize: '0.8rem' }}>{t.no_sessions_hint}</p>
        </div>
      ) : (() => {
        const getRegion = (s: Session) => products.find(p => s.productIds?.includes(p.id))?.region;
        const REGIONS = [
          { key: 'mx', label: t.region_mx, flag: '🇲🇽' },
          { key: 'jp', label: t.region_jp, flag: '🇯🇵' },
        ];
        const SessionCard = ({ s }: { s: Session }) => (
          <div
            key={s.id}
            className="glass-card"
            style={{ display: 'flex', gap: '1rem', cursor: 'pointer', alignItems: 'center' }}
            onClick={() => setSelectedSession(s)}
          >
            <SessionThumbs productIds={s.productIds} products={products} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '5px' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--secondary)', background: 'rgba(76,215,246,0.1)', padding: '2px 8px', borderRadius: '999px', border: '1px solid rgba(76,215,246,0.2)' }}>
                  {s.videos.length} {t.clips}
                </span>
                {productNames(s.productIds).map(pn => (
                  <span key={pn} style={{ fontSize: '0.68rem', color: 'var(--primary)', background: 'rgba(109,59,215,0.1)', padding: '2px 8px', borderRadius: '999px', border: '1px solid rgba(109,59,215,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                    {pn}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );

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
