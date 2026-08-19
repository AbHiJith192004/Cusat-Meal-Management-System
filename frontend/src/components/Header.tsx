import React from 'react';
import { ActiveTab, UserRole } from '../types';

interface HeaderProps {
  currentTab: ActiveTab;
  setCurrentTab: (tab: ActiveTab) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  studentAvatar: string;
  adminAvatar: string;
  unreadCount?: number;
}

const PAGE_META: Partial<Record<ActiveTab, { title: string; sub: string }>> = {
  'home':            { title: 'Home',              sub: 'Today at the mess' },
  'calendar':        { title: 'Meal Schedule',     sub: 'Plan your meals and opt out before the 9 PM cutoff' },
  'qr':              { title: 'Mess Pass',         sub: 'Show this at the dining hall entrance' },
  'alerts':          { title: 'Alerts',            sub: 'Announcements from the mess office' },
  'profile':         { title: 'Profile',           sub: 'Your account and dining preferences' },
  'admin-dashboard': { title: 'Overview',          sub: 'Live mess operations at a glance' },
  'admin-scanner':   { title: 'QR Scanner',        sub: 'Verify passes at the entrance' },
  'admin-menu':      { title: 'Weekly Menu',       sub: 'Plan and publish the mess menu' },
  'admin-students':  { title: 'Students',          sub: 'Directory and mess membership' },
  'admin-ledger':    { title: 'Ledger',            sub: 'Purchases, expenses and reconciliation' },
  'admin-billing':   { title: 'Billing',           sub: 'Monthly bills and fine adjustments' },
  'admin-payments':  { title: 'Payments',          sub: 'Collections and pending dues' },
  'admin-stocks':    { title: 'Stocks',            sub: 'Inventory and closing stock' },
};

/**
 * Mobile: compact centred bar with a back affordance — matches the app design.
 * Desktop: quiet page header (title + one line of context); navigation lives
 * in the sidebar, so no tab row is duplicated here.
 */
export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  userRole,
  studentAvatar,
  adminAvatar,
  unreadCount = 0,
}) => {
  const isStudent = userRole === 'student';
  const meta = PAGE_META[currentTab] ?? { title: 'MessConnect', sub: 'Hostel mess management' };
  const isHome = currentTab === 'home' || currentTab === 'admin-dashboard';
  const avatar = isStudent ? studentAvatar : adminAvatar;
  const hasPhoto = Boolean(avatar && avatar.startsWith('data:'));

  // Mobile shows the brand on home, the page name elsewhere.
  const mobileTitle = isHome ? 'CUSAT MessConnect' : meta.title;

  return (
    <header className="stitch-header">
      <div className="topbar-inner">
        {/* ── Left ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {!isHome && (
            <button
              onClick={() => setCurrentTab(isStudent ? 'home' : 'admin-dashboard')}
              className="icon-btn lg:hidden"
              title="Back"
              aria-label="Back"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
            </button>
          )}
          {isHome && (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 lg:hidden"
              style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
              aria-hidden="true"
            >
              🍴
            </div>
          )}

          {/* Mobile title (centred-ish, truncating) */}
          <h1
            className="font-display text-[17px] font-bold truncate lg:hidden"
            style={{ color: 'var(--text-dark)' }}
          >
            {mobileTitle}
          </h1>

          {/* Desktop title + subtitle */}
          <div className="hidden lg:block min-w-0">
            <h1
              className="font-display text-[21px] font-bold leading-tight truncate"
              style={{ color: 'var(--text-dark)' }}
            >
              {meta.title}
            </h1>
            <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text-muted)' }}>
              {meta.sub}
            </p>
          </div>
        </div>

        {/* ── Right ──────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setCurrentTab('alerts')}
            className="icon-btn relative"
            title="Alerts"
            aria-label={unreadCount > 0 ? `Alerts, ${unreadCount} unread` : 'Alerts'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>notifications</span>
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ background: 'var(--orange)', boxShadow: '0 0 0 2px var(--bg)' }}
              />
            )}
          </button>

          <button
            onClick={() => setCurrentTab('profile')}
            className="icon-btn overflow-hidden"
            title="Profile"
            aria-label="Profile"
          >
            {hasPhoto ? (
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
