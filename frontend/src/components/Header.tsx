import React from 'react';
import { ActiveTab, UserRole } from '../types';

interface HeaderProps {
  currentTab: ActiveTab;
  setCurrentTab: (tab: ActiveTab) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  studentAvatar: string;
  adminAvatar: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  userRole,
  studentAvatar,
  adminAvatar
}) => {
  const isStudent = userRole === 'student';

  return (
    <header className="w-full sticky top-0 glass-header z-40 transition-colors duration-200">
      <div className="flex items-center justify-between px-4 h-14 w-full max-w-[1200px] mx-auto">
        {/* Left Section: Brand & Icon */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[#004ac6]">
            <span className="material-symbols-outlined text-[24px]">restaurant</span>
            <span className="font-bold text-[20px] text-[#004ac6] tracking-tight">MessConnect</span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-2">
          {isStudent ? (
            <>
              <button
                onClick={() => setCurrentTab('home')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'home'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">home</span>
                Home
              </button>
              <button
                onClick={() => setCurrentTab('calendar')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'calendar'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                Calendar
              </button>
              <button
                onClick={() => setCurrentTab('qr')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'qr'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                QR Code
              </button>
              <button
                onClick={() => setCurrentTab('alerts')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'alerts'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">notifications</span>
                Alerts
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setCurrentTab('admin-dashboard')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'admin-dashboard' || currentTab === 'home'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">analytics</span>
                Daily Summary
              </button>
              <button
                onClick={() => setCurrentTab('admin-students')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'admin-students'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">group</span>
                Student Data
              </button>
              <button
                onClick={() => setCurrentTab('admin-scanner')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'admin-scanner'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                Scanner
              </button>
              <button
                onClick={() => setCurrentTab('admin-menu')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'admin-menu'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
                Menu
              </button>
              <button
                onClick={() => setCurrentTab('admin-ledger')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'admin-ledger'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
                Ledger
              </button>
              <button
                onClick={() => setCurrentTab('admin-billing')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'admin-billing'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                Billing
              </button>
              <button
                onClick={() => setCurrentTab('admin-payments')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'admin-payments'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">payments</span>
                Payments
              </button>
              <button
                onClick={() => setCurrentTab('admin-stocks')}
                className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
                  currentTab === 'admin-stocks'
                    ? 'bg-[#2563eb] text-white font-semibold shadow-xs'
                    : 'text-[#434655] hover:bg-[#2563eb]/10 hover:text-[#004ac6]'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                Stocks
              </button>
            </>
          )}
        </nav>

        {/* Right Section: Profile Avatar */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentTab(isStudent ? 'profile' : 'admin-dashboard')}
            className="flex items-center gap-2 group cursor-pointer"
          >
            <div className="relative">
              <img
                src={isStudent ? studentAvatar : adminAvatar}
                alt="Profile Avatar"
                className="w-8 h-8 rounded-full object-cover border border-[#c3c6d7] group-hover:ring-2 group-hover:ring-[#2563eb]"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#006c49] border-2 border-white"></span>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
