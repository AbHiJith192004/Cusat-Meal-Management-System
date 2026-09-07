import React, { useState, useEffect } from 'react';
import { AlertItem } from '../types';
import { notificationsApi } from '../services/api';

interface AlertsViewProps {
  alerts: AlertItem[];
  onMarkAllRead: () => void;
}

type VisualType = 'food' | 'menu' | 'bill' | 'info' | 'warning' | 'success';

const TYPE_CONFIG: Record<
  VisualType,
  { strip: string; icon: string; action?: string; tint: string }
> = {
  food:    { strip: 'var(--alert-food)', icon: 'restaurant',     tint: 'var(--orange-soft)' },
  menu:    { strip: 'var(--alert-menu)', icon: 'event_note',         tint: 'var(--green-light)' },
  bill:    { strip: 'var(--alert-bill)', icon: 'payments',            tint: '#FDECEA' },
  info:    { strip: 'var(--alert-info)', icon: 'campaign',      tint: '#EAF2FB' },
  warning: { strip: 'var(--warn, #E8A33D)', icon: 'warning',    tint: '#FDF3E2' },
  success: { strip: 'var(--alert-menu)', icon: 'check_circle',  tint: 'var(--green-light)' },
};

function resolveType(alert: AlertItem): VisualType {
  if (alert.id.includes('POLICY-02') || alert.id.includes('POLICY-03') || alert.type === 'warning') return 'bill';
  if (alert.type === 'success') return 'success';
  if (alert.id.includes('POLICY-01') || alert.type === 'info') return 'info';
  return 'food';
}

export const AlertsView: React.FC<AlertsViewProps> = ({ alerts: initialAlerts, onMarkAllRead }) => {
  const [alertsList, setAlertsList] = useState<AlertItem[]>([]);
  const [visualTypes, setVisualTypes] = useState<Record<string, VisualType>>({});

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    notificationsApi
      .getNotifications()
      .then(res => {
        if (Array.isArray(res)) {
          const formatted: AlertItem[] = res.map((n: any, idx: number) => ({
            id: n.id || `N-${idx}`,
            title: n.title,
            message: n.message,
            time: new Date(n.created_at || Date.now()).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            type: n.type === 'FINE' ? 'warning' : 'info',
            isUnread: !n.is_read,
          }));
          setAlertsList(formatted);
          const types: Record<string, VisualType> = {};
          formatted.forEach(a => { types[a.id] = resolveType(a); });
          setVisualTypes(types);
        }
      })
      .catch(() => setError('Could not load announcements. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const displayList = alertsList;
  const unread = displayList.filter(a => a.isUnread).length;

  const getVisualType = (alert: AlertItem): VisualType =>
    visualTypes[alert.id] || resolveType(alert);

  const markRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      setAlertsList(prev => prev.map(a => a.id === id ? { ...a, isUnread: false } : a));
    } catch { setError('Could not save read status. Please try again.'); }
  };
  const handleMarkRead = async () => {
    await Promise.all(displayList.filter(a => a.isUnread).map(a => markRead(a.id)));
  };

  return (
    <main className="page-container">
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading announcements…</p>}
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3 lg:mb-4">
        <p className="section-label">
          {unread > 0 ? `${unread} unread` : 'All caught up'}
        </p>
        {unread > 0 && (
          <button onClick={handleMarkRead} className="btn-link text-[13px]">
            Mark all as read
          </button>
        )}
      </div>

      {/* ── Alert list ─────────────────────────────────────────────── */}
      {/* Mobile: one stacked sheet. Desktop: two columns of discrete cards. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
        {displayList.map(alert => {
          const cfg = TYPE_CONFIG[getVisualType(alert)] || TYPE_CONFIG.info;

          return (
            <article key={alert.id} className="alert-stitch-card">
              <div className="alert-strip" style={{ background: cfg.strip }} />

              <div className="alert-body">
                <div className="flex items-start gap-3">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: cfg.tint }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 17, color: cfg.strip }}
                    >
                      {cfg.icon}
                    </span>
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className="font-display text-[15px] font-bold leading-snug"
                        style={{ color: 'var(--text-dark)' }}
                      >
                        {alert.title}
                      </h3>
                      {alert.isUnread && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                          style={{ background: 'var(--orange)' }}
                          aria-label="Unread"
                        />
                      )}
                    </div>

                    <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {alert.time}
                    </p>

                    <p
                      className="text-[13px] font-semibold mt-1.5 leading-relaxed"
                      style={{ color: 'var(--text-body)' }}
                    >
                      {alert.message}
                    </p>

                    {(cfg.action || alert.isUnread) && (
                      <div className="flex items-center justify-between gap-3 mt-3">
                        {cfg.action ? (
                          <button
                            className="px-3 py-1.5 rounded-full text-[12px] font-bold cursor-pointer lg:rounded-md"
                            style={{ background: cfg.tint, color: cfg.strip, border: 'none' }}
                          >
                            {cfg.action}
                          </button>
                        ) : (
                          <span />
                        )}

                        {alert.isUnread && (
                          <button
                            onClick={() => markRead(alert.id)}
                            className="text-[11px] font-bold cursor-pointer shrink-0"
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !error && displayList.length === 0 && (
        <div
          className="rounded-2xl px-6 py-12 text-center"
          style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
        >
          <p className="font-display text-[17px] font-bold" style={{ color: 'var(--text-dark)' }}>
            Nothing to read
          </p>
          <p className="text-[13px] font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>
            Mess announcements will show up here.
          </p>
        </div>
      )}
    </main>
  );
};
