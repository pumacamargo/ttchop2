// Manage Imports — modal opened from AnalyticsView. Every sales-file upload or TikTok Studio
// capture is an `imports/{id}` record (see ImportRecord in databaseService.ts); this panel lists
// them newest-first, lets the user reassign a whole import's container in one write, delete an
// import (and everything it produced), and bulk-reassign the pre-feature documents that have no
// `importId` at all ("earlier imports" — see reassignLegacyContainer in databaseService.ts).
//
// Fetches its own data independently of AnalyticsView (rather than trusting props) so it has a
// clean loading/error/retry lifecycle of its own regardless of when the user opens it, and calls
// `onChanged` after every mutation so the view underneath re-derives without a page reload.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, RefreshCw, ShieldAlert, ClipboardList, FileSpreadsheet, Video as VideoIcon,
  Trash2, AlertTriangle, Archive,
} from 'lucide-react';
import { db } from '../services/databaseService';
import type { ImportRecord, ImportType, AnalyticsOrder, TikTokVideoStats } from '../services/databaseService';
import { useT } from '../context/LanguageContext';
import { useContainer } from '../context/ContainerContext';
import type { TikTokAccount } from '../services/tiktokService';
import type { Translations } from '../i18n';

export interface ManageImportsPanelProps {
  onClose: () => void;
  /** Called after any successful mutation so the caller can re-derive its own filtered views. */
  onChanged: () => void;
}

/** Always en-US regardless of UI language — matches every other date format in this app
 *  (see AnalyticsView's formatPostedDate, CalendarView, etc.), which never locale-switches dates. */
function formatImportDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
}

const selectStyle: React.CSSProperties = {
  minHeight: '38px', minWidth: '120px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.75rem', padding: '0 0.5rem',
};

const iconButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
  minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, color: 'var(--danger)',
};

export const ManageImportsPanel: React.FC<ManageImportsPanelProps> = ({ onClose, onChanged }) => {
  const t = useT();
  const { accounts } = useContainer();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [orders, setOrders] = useState<AnalyticsOrder[]>([]);
  const [videoStats, setVideoStats] = useState<TikTokVideoStats[]>([]);

  // One mutation (a container change, a legacy reassignment, or a delete) at a time, keyed by
  // import id or 'legacy_sales'/'legacy_videos' — keeps the UI from racing itself.
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<{ key: string; message: string } | null>(null);

  const [pendingDelete, setPendingDelete] = useState<ImportRecord | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [importRows, orderRows, videoRows] = await Promise.all([
        db.getImports(), db.getAnalyticsOrders(), db.getTikTokVideoStats(),
      ]);
      if (!mountedRef.current) return;
      setImports(importRows);
      setOrders(orderRows);
      setVideoStats(videoRows);
    } catch (err) {
      console.error(err);
      if (mountedRef.current) setLoadError(t.manage_imports_error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [t.manage_imports_error]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const legacySalesCount = orders.filter(o => !o.importId).length;
  const legacyVideosCount = videoStats.filter(v => !v.importId).length;

  const handleContainerChange = async (importId: string, accountId: string) => {
    setMutatingKey(importId);
    setMutationError(null);
    try {
      await db.updateImportContainer(importId, accountId || undefined);
      await loadAll();
      onChanged();
    } catch (err) {
      setMutationError({ key: importId, message: err instanceof Error ? err.message : t.manage_imports_reassign_error });
    } finally {
      setMutatingKey(null);
    }
  };

  const handleLegacyReassign = async (type: ImportType, key: string, accountId: string) => {
    setMutatingKey(key);
    setMutationError(null);
    try {
      await db.reassignLegacyContainer(type, accountId || undefined);
      await loadAll();
      onChanged();
    } catch (err) {
      setMutationError({ key, message: err instanceof Error ? err.message : t.manage_imports_legacy_reassign_error });
    } finally {
      setMutatingKey(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setMutatingKey(pendingDelete.id);
    setDeleteError('');
    try {
      await db.deleteImport(pendingDelete.id);
      setPendingDelete(null);
      await loadAll();
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t.manage_imports_delete_error);
    } finally {
      setMutatingKey(null);
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.manage_imports_title}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-card"
        style={{
          maxWidth: '560px', width: '100%', maxHeight: '88vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '0.9rem', padding: '1.1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
              {t.manage_imports_title}
            </h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {t.manage_imports_subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t.manage_imports_close_aria}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
              minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
            <RefreshCw size={26} className="loading-spinner" style={{ color: 'var(--primary)' }} />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{t.manage_imports_loading}</p>
          </div>
        ) : loadError ? (
          <div style={{
            borderRadius: 10, border: '1px solid var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
            display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.9rem 1rem',
          }}>
            <ShieldAlert size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>{loadError}</p>
              <button onClick={loadAll} className="btn btn-secondary" style={{ marginTop: '0.6rem', width: 'auto', minHeight: '36px', padding: '0 0.9rem', fontSize: '0.75rem' }}>
                <RefreshCw size={14} /> {t.retry}
              </button>
            </div>
          </div>
        ) : imports.length === 0 && legacySalesCount === 0 && legacyVideosCount === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem' }}>
            <ClipboardList size={40} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            <h4 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '0.92rem' }}>{t.manage_imports_empty_title}</h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '340px', lineHeight: 1.5, margin: 0 }}>
              {t.manage_imports_empty_text}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {imports.map(imp => (
              <ImportRow
                key={imp.id}
                record={imp}
                accounts={accounts}
                busy={mutatingKey === imp.id}
                error={mutationError?.key === imp.id ? mutationError.message : ''}
                onContainerChange={accountId => handleContainerChange(imp.id, accountId)}
                onDelete={() => { setDeleteError(''); setPendingDelete(imp); }}
                t={t}
              />
            ))}

            {(legacySalesCount > 0 || legacyVideosCount > 0) && (
              <div style={{ marginTop: imports.length > 0 ? '0.4rem' : 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Archive size={14} style={{ color: 'var(--text-muted)' }} /> {t.manage_imports_legacy_title}
                </h4>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{t.manage_imports_legacy_hint}</p>

                {legacySalesCount > 0 && (
                  <LegacyRow
                    label={t.manage_imports_legacy_sales_label}
                    countLabel={t.manage_imports_item_count_orders.replace('{count}', String(legacySalesCount))}
                    accounts={accounts}
                    busy={mutatingKey === 'legacy_sales'}
                    error={mutationError?.key === 'legacy_sales' ? mutationError.message : ''}
                    icon={<FileSpreadsheet size={15} style={{ color: 'var(--primary)' }} />}
                    onReassign={accountId => handleLegacyReassign('sales_file', 'legacy_sales', accountId)}
                    t={t}
                  />
                )}
                {legacyVideosCount > 0 && (
                  <LegacyRow
                    label={t.manage_imports_legacy_videos_label}
                    countLabel={t.manage_imports_item_count_videos.replace('{count}', String(legacyVideosCount))}
                    accounts={accounts}
                    busy={mutatingKey === 'legacy_videos'}
                    error={mutationError?.key === 'legacy_videos' ? mutationError.message : ''}
                    icon={<VideoIcon size={15} style={{ color: 'var(--secondary)' }} />}
                    onReassign={accountId => handleLegacyReassign('studio_scrape', 'legacy_videos', accountId)}
                    t={t}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {pendingDelete && (
        <div
          onClick={() => { if (mutatingKey !== pendingDelete.id) setPendingDelete(null); }}
          role="dialog"
          aria-modal="true"
          aria-label={t.manage_imports_delete_confirm_title}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1001,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="glass-card"
            style={{ maxWidth: '380px', width: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
          >
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{t.manage_imports_delete_confirm_title}</h4>
            <div style={{
              display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
              background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)',
              borderRadius: '8px', padding: '0.6rem 0.75rem',
            }}>
              <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {t.manage_imports_delete_confirm_text.replace('{count}', String(pendingDelete.itemCount))}
              </p>
            </div>

            {deleteError && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--danger)' }}>{deleteError}</p>}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={confirmDelete}
                disabled={mutatingKey === pendingDelete.id}
                className="btn btn-primary"
                style={{ flex: 1, minHeight: '44px', fontSize: '0.82rem', padding: '0.4rem', background: 'var(--danger)' }}
              >
                {mutatingKey === pendingDelete.id
                  ? <><RefreshCw size={12} className="loading-spinner" /> {t.manage_imports_deleting}</>
                  : deleteError ? t.retry : t.manage_imports_delete_confirm_button}
              </button>
              <button
                onClick={() => setPendingDelete(null)}
                disabled={mutatingKey === pendingDelete.id}
                className="btn btn-secondary"
                style={{ flex: 1, minHeight: '44px', fontSize: '0.82rem', padding: '0.4rem' }}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Row for a real, tracked import ───────────────────────────────────────────

const ImportRow: React.FC<{
  record: ImportRecord;
  accounts: TikTokAccount[];
  busy: boolean;
  error: string;
  onContainerChange: (accountId: string) => void;
  onDelete: () => void;
  t: Translations;
}> = ({ record, accounts, busy, error, onContainerChange, onDelete, t }) => {
  const TypeIcon = record.type === 'sales_file' ? FileSpreadsheet : VideoIcon;
  const typeLabel = record.type === 'sales_file' ? t.manage_imports_type_sales_file : t.manage_imports_type_studio_scrape;
  const countLabel = record.type === 'sales_file'
    ? t.manage_imports_item_count_orders.replace('{count}', String(record.itemCount))
    : t.manage_imports_item_count_videos.replace('{count}', String(record.itemCount));

  return (
    <div className="glass-card" style={{
      padding: '0.7rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {t.manage_imports_group_title.replace('{date}', formatImportDate(record.importedAt))}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
            <TypeIcon size={12} style={{ color: record.type === 'sales_file' ? 'var(--primary)' : 'var(--secondary)', flexShrink: 0 }} />
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{typeLabel}</span>
          </div>
          <p style={{
            margin: '0.25rem 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={record.label}>
            {record.label}
          </p>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{countLabel}</p>
          {record.tiktokUsername && (
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {t.manage_imports_source_hint.replace('{username}', record.tiktokUsername)}
            </p>
          )}
        </div>
        <button onClick={onDelete} disabled={busy} aria-label={t.manage_imports_delete_aria} title={t.manage_imports_delete_aria} style={iconButtonStyle}>
          <Trash2 size={15} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>{t.manage_imports_container_label}:</span>
        <select
          value={record.accountId || ''}
          disabled={busy}
          onChange={e => onContainerChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">{t.container_general_name}</option>
          {accounts.map(a => (
            <option key={a.openId} value={a.openId}>{a.displayName || a.openId}</option>
          ))}
        </select>
        {busy && <RefreshCw size={13} className="loading-spinner" style={{ color: 'var(--primary)' }} />}
      </div>
      {error && <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
};

// ── Row for the "earlier imports" (no importId) bucket ──────────────────────

const LEGACY_PLACEHOLDER = '__placeholder__';

const LegacyRow: React.FC<{
  label: string;
  countLabel: string;
  icon: React.ReactNode;
  accounts: TikTokAccount[];
  busy: boolean;
  error: string;
  onReassign: (accountId: string) => void;
  t: Translations;
}> = ({ label, countLabel, icon, accounts, busy, error, onReassign, t }) => {
  // No single "current" container to show (these docs may already carry a mix of accountId
  // values from before this feature existed) — the select starts at a disabled placeholder and
  // remembers the last target picked as a stand-in "current" value; on error it falls back to
  // showing the placeholder again (computed in render, not via an effect, so a failed attempt
  // never looks like it succeeded).
  const [selectValue, setSelectValue] = useState(LEGACY_PLACEHOLDER);
  const displayValue = error ? LEGACY_PLACEHOLDER : selectValue;

  const handleChange = (value: string) => {
    if (value === LEGACY_PLACEHOLDER) return;
    setSelectValue(value);
    onReassign(value === '__general__' ? '' : value);
  };

  return (
    <div className="glass-card" style={{
      padding: '0.7rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {icon}
        <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</p>
      </div>
      <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-muted)' }}>{countLabel}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <select
          value={displayValue}
          disabled={busy}
          onChange={e => handleChange(e.target.value)}
          style={selectStyle}
        >
          <option value={LEGACY_PLACEHOLDER} disabled>{t.manage_imports_legacy_placeholder}</option>
          <option value="__general__">{t.container_general_name}</option>
          {accounts.map(a => (
            <option key={a.openId} value={a.openId}>{a.displayName || a.openId}</option>
          ))}
        </select>
        {busy && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={13} className="loading-spinner" style={{ color: 'var(--primary)' }} /> {t.manage_imports_legacy_reassigning}
          </span>
        )}
      </div>
      {error && <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
};
