import React from 'react';
import { ActiveTab, UserRole } from '../types';

interface BottomNavProps {
  currentTab: ActiveTab;
  setCurrentTab: (tab: ActiveTab) => void;
  userRole: UserRole;
  unreadAlertsCount?: number;
}

// Student tabs matching Stitch: Home | Menu | Pass | Alerts | Profile
const STUDENT_TABS = [
  { id: 'home',     label: 'Home',    icon: 'home' },
  { id: 'calendar', label: 'Menu',    icon: 'menu_book' },
  { id: 'qr',       label: 'Pass',    icon: 'confirmation_number' },
  { id: 'alerts',   label: 'Alerts',  icon: 'notifications' },
  { id: 'profile',  label: 'Profile', icon: 'person' },
];

// Admin tabs: Overview | Scanner | Menu | Students | Profile
const ADMIN_TABS = [
  { id: 'admin-dashboard', label: 'Overview', icon: 'analytics' },
  { id: 'admin-scanner',   label: 'Scan',     icon: 'photo_camera' },
  { id: 'admin-menu',      label: 'Menu',     icon: 'restaurant_menu' },
  { id: 'admin-students',  label: 'Students', icon: 'group' },
  { id: 'profile',         label: 'Profile',  icon: 'person' },
];

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  setCurrentTab,
  userRole,
  unreadAlertsCount = 0,
}) => {
  const isStudent = userRole === 'student';
  const tabs = isStudent ? STUDENT_TABS : ADMIN_TABS;

  const isActive = (tabId: string) => {
    if (tabId === 'home' && (currentTab === 'home' || currentTab === 'admin-dashboard')) return isStudent;
    if (tabId === 'admin-dashboard' && currentTab === 'home') return !isStudent;
    return currentTab === tabId;
  };

  return (
    <nav className="stitch-bottom-nav">
      {tabs.map(tab => {
        const active = isActive(tab.id);
        const hasAlert = tab.id === 'alerts' && unreadAlertsCount > 0 && !active;

        return (
          <button
            key={tab.id}
            className="nav-tab"
            onClick={() => setCurrentTab(tab.id as ActiveTab)}
          >
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
              {hasAlert && (
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
              {tab.label}
            </span>
            {active && <div className="nav-tab-active-dot" />}
          </button>
        );
      })}
    </nav>
  );
};
