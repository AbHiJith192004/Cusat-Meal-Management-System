import React from 'react';
import { ActiveTab, UserRole } from '../types';
import { groupsFor } from '../navigation';

interface SideNavProps {
  currentTab: ActiveTab;
  setCurrentTab: (tab: ActiveTab) => void;
  userRole: UserRole;
  userName: string;
  regNo: string;
  unreadAlertsCount?: number;
  onLogout: () => void;
}

/**
 * Desktop-only left rail. Hidden below 1024px, where the bottom tab bar takes over.
 * Deliberately quiet: no filled pills, no shadows — the active row is a soft tint.
 */
export const SideNav: React.FC<SideNavProps> = ({
  currentTab,
  setCurrentTab,
  userRole,
  userName,
  regNo,
  unreadAlertsCount = 0,
  onLogout,
}) => {
  const isStudent = userRole === 'student';
  const groups = groupsFor(userRole);

  const isActive = (id: ActiveTab) => {
    if (id === 'home') return isStudent && (currentTab === 'home' || currentTab === 'admin-dashboard');
    if (id === 'admin-dashboard') return !isStudent && (currentTab === 'admin-dashboard' || currentTab === 'home');
    return currentTab === id;
  };

  return (
    <aside className="app-sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ background: 'var(--orange-soft)', border: '1px solid var(--orange-light)' }}
        >
          🍴
        </div>
        <div className="min-w-0">
          <p
            className="font-display text-[15px] font-bold leading-tight truncate"
            style={{ color: 'var(--text-dark)' }}
          >
            MessConnect
          </p>
          <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-muted)' }}>
            {isStudent ? 'Hostel Mess' : 'Administration'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {groups.map((group, gi) => (
          <div key={group.heading ?? gi} className={gi > 0 ? 'mt-5' : undefined}>
            {group.heading && (
              <p className="section-label px-3 pb-2">{group.heading}</p>
            )}
            {group.items.map(item => {
              const active = isActive(item.id);
              const badge = item.id === 'alerts' && unreadAlertsCount > 0;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`sidebar-item ${active ? 'sidebar-item-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 20,
                      color: active ? 'var(--orange)' : 'var(--text-muted)',
                      fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                    }}
                  >
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge && (
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
        ))}
      </nav>

      {/* Signed-in identity + sign out */}
      <div className="sidebar-footer">
        <div
          className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1"
          style={{ background: 'var(--line-soft)' }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0"
            style={{ background: 'var(--orange-soft)', color: 'var(--orange-dark)', border: '1px solid var(--orange-light)' }}
          >
            {(userName || 'U').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold truncate" style={{ color: 'var(--text-dark)' }}>
              {userName}
            </p>
            <p className="text-[10px] font-semibold truncate" style={{ color: 'var(--text-muted)' }}>
              {regNo}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="sidebar-item"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 19 }}>logout</span>
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
};
