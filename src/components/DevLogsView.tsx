import React, { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { ExternalLink, RefreshCw, FileText, ChevronDown, ChevronRight } from 'lucide-react';

interface DevLog {
  id: string;
  activity: string;
  date: string;
  htmlUrl: string;
  sizeBytes: number;
  createdAt: string;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function groupByDateAndActivity(logs: DevLog[]): Record<string, Record<string, DevLog[]>> {
  const groups: Record<string, Record<string, DevLog[]>> = {};
  for (const log of logs) {
    const date = log.date;
    const activity = log.activity ?? 'unknown';
    if (!groups[date]) groups[date] = {};
    if (!groups[date][activity]) groups[date][activity] = [];
    groups[date][activity].push(log);
  }
  // Sort logs within each category by createdAt descending (latest first)
  for (const date in groups) {
    for (const activity in groups[date]) {
      groups[date][activity].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }
  return groups;
}

export const DevLogsView: React.FC = () => {
  const [logs, setLogs] = useState<DevLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(
        query(collection(firestore, 'dev_logs'), orderBy('date', 'desc'))
      );
      setLogs(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DevLog, 'id'>) })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Initialize collapsed days: all dates except today start collapsed
  useEffect(() => {
    if (logs.length > 0 && collapsedDays.size === 0) {
      const groupedByDateAndActivity = groupByDateAndActivity(logs);
      const allDates = Object.keys(groupedByDateAndActivity);
      const todayDate = new Date().toISOString().slice(0, 10);
      const initiallyCollapsed = new Set(allDates.filter(d => d !== todayDate));
      setCollapsedDays(initiallyCollapsed);
    }
  }, [logs]);

  const today = new Date().toISOString().slice(0, 10);
  const groupedByDateAndActivity = groupByDateAndActivity(logs);
  const sortedDates = Object.keys(groupedByDateAndActivity).sort((a, b) => b.localeCompare(a)); // descending

  const toggleDay = (date: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const toggleHistory = (key: string) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const renderLogCard = (log: DevLog) => (
    <div
      key={log.id}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 14px', borderRadius: '10px',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
      }}
    >
      <FileText size={18} style={{ color: '#818cf8', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
          {log.date} · {log.createdAt?.slice(11, 19) ?? ''} UTC
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
          {formatBytes(log.sizeBytes)}
        </div>
      </div>
      <a
        href={log.htmlUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem',
          background: 'rgba(109,59,215,0.15)', color: '#a78bfa',
          border: '1px solid rgba(109,59,215,0.3)', textDecoration: 'none',
          flexShrink: 0,
        }}
      >
        <ExternalLink size={13} />
        Ver
      </a>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
          Automation logs — debug HTML by date
        </p>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem',
            background: 'rgba(109,59,215,0.15)', color: 'var(--text-secondary)',
            border: '1px solid rgba(109,59,215,0.3)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#1c1010', border: '1px solid #4a1414', color: '#f87171', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {loading && !logs.length && (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', paddingTop: '3rem', fontSize: '0.9rem' }}>
          Loading logs...
        </div>
      )}

      {!loading && !logs.length && !error && (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', paddingTop: '3rem', fontSize: '0.9rem' }}>
          No logs yet. They are generated automatically when automations run.
        </div>
      )}

      {sortedDates.map(date => {
        const isDayCollapsed = collapsedDays.has(date);
        const isToday = date === today;
        const activitiesForDay = groupedByDateAndActivity[date];
        const activityOrder = Object.keys(activitiesForDay).sort();

        return (
          <div key={date} style={{ marginBottom: '1.75rem' }}>
            {/* Day header with toggle */}
            <div
              onClick={() => toggleDay(date)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                cursor: 'pointer', padding: '8px 0', marginBottom: '0.8rem',
                userSelect: 'none',
              }}
            >
              {isDayCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {date}
                {isToday && <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(Hoy)</span>}
              </h2>
            </div>

            {/* Category groups (shown if day is not collapsed) */}
            {!isDayCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginLeft: '0rem' }}>
                {activityOrder.map(activity => {
                  const logsForActivity = activitiesForDay[activity];
                  const latestLog = logsForActivity[0];
                  const olderLogs = logsForActivity.slice(1);
                  const historyKey = `${date}|${activity}`;
                  const isHistoryExpanded = expandedHistory.has(historyKey);

                  return (
                    <div key={activity}>
                      {/* Activity category label */}
                      <h3 style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                        {activity}
                      </h3>

                      {/* Latest log (always shown) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: olderLogs.length > 0 ? '0.8rem' : 0 }}>
                        {renderLogCard(latestLog)}
                      </div>

                      {/* History toggle and older logs */}
                      {olderLogs.length > 0 && (
                        <div>
                          <button
                            onClick={() => toggleHistory(historyKey)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem',
                              background: 'transparent', color: 'var(--text-secondary)',
                              border: '1px solid var(--border)', cursor: 'pointer',
                              marginBottom: isHistoryExpanded ? '0.8rem' : 0,
                            }}
                          >
                            {isHistoryExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            History ({olderLogs.length})
                          </button>

                          {/* Older logs (shown if history is expanded) */}
                          {isHistoryExpanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.8rem' }}>
                              {olderLogs.map(log => (
                                <div key={log.id} style={{ opacity: 0.65 }}>
                                  {renderLogCard(log)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
