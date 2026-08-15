import React from 'react';
import { ActiveTab, UserRole } from '../types';

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
  unreadAlertsCount = 2
}) => {
  const isStudent = userRole === 'student';

  if (isStudent) {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 py-2 glass-nav z-50 rounded-t-xl safe-bottom transition-transform duration-150">
        {/* Home */}
        <button
          onClick={() => setCurrentTab('home')}
          className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer ${
            currentTab === 'home'
              ? 'bg-[#2563eb] text-white shadow-xs'
              : 'text-[#434655] hover:bg-[#e2e8f8]'
          }`}
        >
          <span className="material-symbols-outlined text-[24px]">home</span>
          <span className="font-semibold text-[11px] mt-0.5">Home</span>
        </button>

        {/* Calendar */}
        <button
          onClick={() => setCurrentTab('calendar')}
          className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer ${
            currentTab === 'calendar'
              ? 'bg-[#2563eb] text-white shadow-xs'
              : 'text-[#434655] hover:bg-[#e2e8f8]'
          }`}
        >
          <span className="material-symbols-outlined text-[24px]">calendar_month</span>
          <span className="font-semibold text-[11px] mt-0.5">Calendar</span>
        </button>

        {/* QR */}
        <button
          onClick={() => setCurrentTab('qr')}
          className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer relative ${
            currentTab === 'qr'
              ? 'bg-[#2563eb] text-white shadow-xs -translate-y-1'
              : 'text-[#434655] hover:bg-[#e2e8f8]'
          }`}
        >
          <span className="material-symbols-outlined text-[24px]">qr_code_scanner</span>
          <span className="font-semibold text-[11px] mt-0.5">QR</span>
        </button>

        {/* Alerts */}
        <button
          onClick={() => setCurrentTab('alerts')}
          className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer relative ${
            currentTab === 'alerts'
              ? 'bg-[#2563eb] text-white shadow-xs'
              : 'text-[#434655] hover:bg-[#e2e8f8]'
          }`}
        >
          <div className="relative">
            <span className="material-symbols-outlined text-[24px]">notifications</span>
            {unreadAlertsCount > 0 && currentTab !== 'alerts' && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-[#ba1a1a] rounded-full border border-white"></span>
            )}
          </div>
          <span className="font-semibold text-[11px] mt-0.5">Alerts</span>
        </button>

        {/* Profile */}
        <button
          onClick={() => setCurrentTab('profile')}
          className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer ${
            currentTab === 'profile'
              ? 'bg-[#2563eb] text-white shadow-xs'
              : 'text-[#434655] hover:bg-[#e2e8f8]'
          }`}
        >
          <span className="material-symbols-outlined text-[24px]">person</span>
          <span className="font-semibold text-[11px] mt-0.5">Profile</span>
        </button>
      </nav>
    );
  }

  // Admin Bottom Nav
  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 py-2 glass-nav z-50 rounded-t-xl safe-bottom transition-transform duration-150">
      <button
        onClick={() => setCurrentTab('admin-dashboard')}
        className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer ${
          currentTab === 'admin-dashboard'
            ? 'bg-[#2563eb] text-white shadow-xs'
            : 'text-[#434655] hover:bg-[#e2e8f8]'
        }`}
      >
        <span className="material-symbols-outlined text-[24px]">dashboard</span>
        <span className="font-semibold text-[11px] mt-0.5">Overview</span>
      </button>

      <button
        onClick={() => setCurrentTab('admin-students')}
        className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer ${
          currentTab === 'admin-students'
            ? 'bg-[#2563eb] text-white shadow-xs'
            : 'text-[#434655] hover:bg-[#e2e8f8]'
        }`}
      >
        <span className="material-symbols-outlined text-[24px]">group</span>
        <span className="font-semibold text-[11px] mt-0.5">Students</span>
      </button>

      <button
        onClick={() => setCurrentTab('admin-scanner')}
        className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer ${
          currentTab === 'admin-scanner'
            ? 'bg-[#2563eb] text-white shadow-xs -translate-y-1'
            : 'text-[#434655] hover:bg-[#e2e8f8]'
        }`}
      >
        <span className="material-symbols-outlined text-[24px]">qr_code_scanner</span>
        <span className="font-semibold text-[11px] mt-0.5">Scanner</span>
      </button>

      <button
        onClick={() => setCurrentTab('admin-reports')}
        className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer ${
          currentTab === 'admin-reports'
            ? 'bg-[#2563eb] text-white shadow-xs'
            : 'text-[#434655] hover:bg-[#e2e8f8]'
        }`}
      >
        <span className="material-symbols-outlined text-[24px]">assessment</span>
        <span className="font-semibold text-[11px] mt-0.5">Reports</span>
      </button>

      <button
        onClick={() => setCurrentTab('profile')}
        className={`flex flex-col items-center justify-center px-3 py-1 rounded-xl transition-all cursor-pointer ${
          currentTab === 'profile'
            ? 'bg-[#2563eb] text-white shadow-xs'
            : 'text-[#434655] hover:bg-[#e2e8f8]'
        }`}
      >
        <span className="material-symbols-outlined text-[24px]">person</span>
        <span className="font-semibold text-[11px] mt-0.5">Profile</span>
      </button>
    </nav>
  );
};
