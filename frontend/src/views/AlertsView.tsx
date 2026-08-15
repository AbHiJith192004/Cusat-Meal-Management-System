import React, { useState, useEffect } from 'react';
import { AlertItem } from '../types';
import { notificationsApi } from '../services/api';

interface AlertsViewProps {
  alerts: AlertItem[];
  onMarkAllRead: () => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({ alerts: initialAlerts, onMarkAllRead }) => {
  const [alertsList, setAlertsList] = useState<AlertItem[]>(initialAlerts);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await notificationsApi.getNotifications();
        if (res && res.items && res.items.length > 0) {
          const formatted: AlertItem[] = res.items.map((n: any, idx: number) => ({
            id: n.id || `NOTIF-${idx}`,
            title: n.title,
            message: n.message,
            time: new Date(n.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: n.notification_type === 'FINE' ? 'warning' : 'info',
            isUnread: !n.is_read,
          }));
          setAlertsList(formatted);
        }
      } catch (e) {}
    };
    fetchNotifications();
  }, []);

  const handleMarkRead = async () => {
    onMarkAllRead();
    setAlertsList((prev) => prev.map((a) => ({ ...a, isUnread: false })));
  };

  const systemPolicies: AlertItem[] = [
    {
      id: 'POLICY-01',
      title: 'Opt-Out & Mess Cut Rules (9:00 PM IST Cutoff)',
      message: 'Students can either opt out of the entire day (all 3 meals) which counts as a Mess Cut, or opt out of just 1 meal a day without a fine (paying for the full day). Changes lock at 9:00 PM IST the previous day.',
      time: 'System Rule',
      type: 'info' as const,
      isUnread: false,
    },
    {
      id: 'POLICY-02',
      title: 'Monthly Mess Cut Limit (Max 10 Mess Cuts/Month)',
      message: 'The maximum number of full-day mess cuts allowed is 10 per month.',
      time: 'System Rule',
      type: 'warning' as const,
      isUnread: false,
    },
    {
      id: 'POLICY-03',
      title: 'Missed Meal Fine Rate (₹30)',
      message: 'Unattended confirmed meals incur a standard ₹30 non-attendance fine.',
      time: 'System Rule',
      type: 'warning' as const,
      isUnread: false,
    }
  ];

  const displayList = alertsList.length > 0 ? alertsList : systemPolicies;

  return (
    <main className="w-full max-w-[768px] mx-auto px-4 py-6 flex flex-col gap-6 pb-28 md:pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] md:text-[30px] font-bold text-[#151c27]">Mess Notifications</h1>
          <p className="text-xs text-[#434655]">Live system alerts and cutoff policy notifications</p>
        </div>
        <button
          onClick={handleMarkRead}
          className="text-xs font-semibold text-[#004ac6] hover:underline cursor-pointer"
        >
          Mark all as read
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {displayList.map((alert) => (
          <div
            key={alert.id}
            className={`p-4 rounded-xl border transition-all ${
              alert.isUnread
                ? 'bg-white border-[#2563eb]/40 shadow-xs ring-1 ring-[#2563eb]/20'
                : 'bg-white border-[#c3c6d7]/60 opacity-90'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    alert.type === 'warning'
                      ? 'text-[#ba1a1a]'
                      : alert.type === 'success'
                      ? 'text-[#006c49]'
                      : 'text-[#004ac6]'
                  }`}
                >
                  {alert.type === 'warning'
                    ? 'warning'
                    : alert.type === 'success'
                    ? 'check_circle'
                    : 'info'}
                </span>
                <h3 className="font-semibold text-sm text-[#151c27]">{alert.title}</h3>
              </div>
              <span className="text-[11px] text-[#737686] shrink-0">{alert.time}</span>
            </div>
            <p className="text-xs text-[#434655] pl-7">{alert.message}</p>
          </div>
        ))}
      </div>
    </main>
  );
};
