import React, { useState } from 'react';
import { ActiveTab, UserRole } from '../types';
import { barEntries, overflowGroups, isOverflowTab } from '../navigation';

interface BottomNavProps {
  currentTab: ActiveTab;
  setCurrentTab: (tab: ActiveTab) => void;
  userRole: UserRole;
  unreadAlertsCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  setCurrentTab,
  userRole,
  unreadAlertsCount = 0,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);

  const isStudent = userRole === 'student';
  const tabs = barEntries(userRole);
  const overflow = overflowGroups(userRole);
  const moreActive = isOverflowTab(userRole, currentTab);

  // Home and the admin overview share a slot, so treat them as one another's
  // fallback when the stored tab does not match the current role.
  const isActive = (id: ActiveTab) => {
    if (id === 'home') return isStudent && (currentTab === 'home' || currentTab === 'admin-dashboard');
    if (id === 'admin-dashboard') return !isStudent && (currentTab === 'admin-dashboard' || currentTab === 'home');
    return currentTab === id;
  };

  const go = (id: ActiveTab) => {
    setCurrentTab(id);
    setMoreOpen(false);
  };

  const unreadFor = (id: ActiveTab) => id === 'alerts' && unreadAlertsCount > 0;

  return (
    <>
      <nav className="stitch-bottom-nav">
        {tabs.map(tab => {
          const active = isActive(tab.id);
          const badge = unreadFor(tab.id) && !active;

          return (
            <button key={tab.id} className="nav-tab" onClick={() => go(tab.id)}>
              <div className="relative">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 24,
                    color: active ? 'var(--orange)' : 'var(--text-muted)',
                    fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                    transition: 'color 0.15s',
                  }}
                >
                  {tab.icon}
                </span>
                {badge && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                    style={{ background: 'var(--red)', border: '1.5px solid var(--card)' }}
                  />
                )}
              </div>
              <span
                className="text-[10.5px] font-bold tracking-tight"
                style={{
                  color: active ? 'var(--orange)' : 'var(--text-muted)',
                  fontFamily: 'Nunito, sans-serif',
                  transition: 'color 0.15s',
                }}
              >
                {tab.short}
              </span>
              {active && <div className="nav-tab-active-dot" />}
            </button>
          );
        })}

        {/* Anything that does not fit the bar — for admins that is Finance and
            Account, which were previously unreachable on a phone. */}
        {overflow.length > 0 && (
          <button className="nav-tab" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}>
            <div className="relative">
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 24,
                  color: moreActive ? 'var(--orange)' : 'var(--text-muted)',
                  fontVariationSettings: moreActive ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                more_horiz
              </span>
              {unreadAlertsCount > 0 && !moreActive && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                  style={{ background: 'var(--red)', border: '1.5px solid var(--card)' }}
                />
              )}
            </div>
            <span
              className="text-[10.5px] font-bold tracking-tight"
              style={{
                color: moreActive ? 'var(--orange)' : 'var(--text-muted)',
                fontFamily: 'Nunito, sans-serif',
              }}
            >
              More
            </span>
            {moreActive && <div className="nav-tab-active-dot" />}
          </button>
        )}
      </nav>

      {/* ── More sheet ─────────────────────────────────────────────── */}
      {moreOpen && (
        <div
          className="modal-scrim"
          onClick={() => setMoreOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="More destinations"
        >
          <div className="modal-panel max-w-[520px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-[19px] font-bold" style={{ color: 'var(--text-dark)' }}>
                All sections
              </h2>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer shrink-0"
                style={{ background: 'var(--line-soft)', border: 'none', color: 'var(--text-muted)' }}
                aria-label="Close"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            <div className="overflow-y-auto -mx-1 px-1">
              {overflow.map((group, gi) => (
                <div key={group.heading ?? gi} className={gi > 0 ? 'mt-5' : 'mt-3'}>
                  {group.heading && <p className="section-label mb-2">{group.heading}</p>}

                  <div className="grid grid-cols-2 gap-2.5">
                    {group.items.map(item => {
                      const active = currentTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => go(item.id)}
                          className="flex items-center gap-2.5 p-3 rounded-xl text-left cursor-pointer"
                          style={{
                            background: active ? 'var(--orange-soft)' : 'var(--bg)',
                            border: `1px solid ${active ? 'var(--orange-light)' : 'var(--line)'}`,
                          }}
                        >
                          <span
                            className="material-symbols-outlined shrink-0"
                            style={{
                              fontSize: 21,
                              color: active ? 'var(--orange)' : 'var(--text-muted)',
                              fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                            }}
                          >
                            {item.icon}
                          </span>
                          <span
                            className="text-[13px] font-bold truncate flex-1"
                            style={{
                              color: active ? 'var(--orange-dark)' : 'var(--text-dark)',
                              fontFamily: 'Nunito, sans-serif',
                            }}
                          >
                            {item.label}
                          </span>
                          {unreadFor(item.id) && (
                            <span
                              className="text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: 'var(--orange)', color: '#fff' }}
                            >
                              {unreadAlertsCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
