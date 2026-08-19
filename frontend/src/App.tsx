import { useState, useEffect } from 'react';
import { UserRole, ActiveTab, StudentRecord, ScanLog, AlertItem } from './types';
import {
  INITIAL_STUDENT,
  INITIAL_STUDENTS,
  INITIAL_SCAN_LOGS,
  INITIAL_ALERTS
} from './data/mockData';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { SideNav } from './components/SideNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentHomeView } from './views/StudentHomeView';
import { MealPlanningView } from './views/MealPlanningView';
import { StudentQrView } from './views/StudentQrView';
import { AdminDashboardView } from './views/AdminDashboardView';
import { AdminScannerView } from './views/AdminScannerView';
import { StudentDirectoryView } from './views/StudentDirectoryView';
import { ProfileView } from './views/ProfileView';
import { AlertsView } from './views/AlertsView';
import { authApi, studentApi, getAuthToken } from './services/api';

import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { LoginModal } from './components/LoginModal';

export function App() {
  const [userRole, setUserRole] = useState<UserRole>(
    () => (localStorage.getItem('messconnect_role') as UserRole) || 'student'
  );
  const [currentTab, setCurrentTab] = useState<ActiveTab>(
    () => (localStorage.getItem('messconnect_tab') as ActiveTab) || 'home'
  );
  const [studentInfo, setStudentInfo] = useState(INITIAL_STUDENT);
  const [students, setStudents] = useState<StudentRecord[]>(INITIAL_STUDENTS);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>(INITIAL_SCAN_LOGS);
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);

  // Helper to change tab & persist in localStorage
  const handleTabChange = (tab: ActiveTab) => {
    setCurrentTab(tab);
    localStorage.setItem('messconnect_tab', tab);
  };

  // Check session and restore saved role & tab on app load / refresh
  useEffect(() => {
    const checkSession = async () => {
      setCheckingSession(true);
      const token = getAuthToken();
      const savedRole = (localStorage.getItem('messconnect_role') as UserRole) || 'student';
      const savedTab = (localStorage.getItem('messconnect_tab') as ActiveTab) || (savedRole === 'admin' ? 'admin-dashboard' : 'home');

      if (token) {
        try {
          setUserRole(savedRole);
          setCurrentTab(savedTab);

          // /me works for every role — without this an admin's name resets to
          // the placeholder on every refresh.
          const profile = await studentApi.getProfile();
          setStudentInfo((prev) => ({
            ...prev,
            name: profile.name || prev.name,
            regNo: profile.registration_number || prev.regNo,
            hostel: savedRole === 'admin' ? 'CUSAT Mess Administration' : prev.hostel,
          }));
          setIsLoggedIn(true);
        } catch (e) {
          // Token expired or invalid — clear session
          localStorage.clear();
          setIsLoggedIn(false);
          setIsLoginOpen(true);
        }
      } else {
        // No saved token — show login screen
        setIsLoggedIn(false);
        setIsLoginOpen(true);
      }
      setCheckingSession(false);
    };
    checkSession();
  }, []);

  const adminAvatar =
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

  const handleRoleChange = async (role: UserRole) => {
    setUserRole(role);
    localStorage.setItem('messconnect_role', role);

    const defaultTab = role === 'admin' ? 'admin-dashboard' : 'home';
    setCurrentTab(defaultTab);
    localStorage.setItem('messconnect_tab', defaultTab);
  };

  const handleLoginSuccess = async (role: 'student' | 'admin', name: string, regNo: string) => {
    setUserRole(role);
    localStorage.setItem('messconnect_role', role);
    setIsLoggedIn(true);

    if (role === 'student') {
      try {
        const profile = await studentApi.getProfile();
        setStudentInfo({
          name: profile.name || name,
          regNo: profile.registration_number || regNo,
          hostel: 'CUSAT Hostel Mess 1',
          category: 'Hosteller',
          avatar: profile.profile?.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || name)}&background=2563eb&color=fff`,
        });
      } catch (e) {
        setStudentInfo({
          name: name,
          regNo: regNo,
          hostel: 'CUSAT Hostel Mess 1',
          category: 'Hosteller',
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563eb&color=fff`,
        });
      }
      handleTabChange('home');
    } else {
      const adminDisplayName = regNo.toUpperCase() === 'SADMIN001' ? 'Super Warden (Super Admin)' : name || 'Mess Admin';
      setStudentInfo({
        name: adminDisplayName,
        regNo: regNo,
        hostel: 'CUSAT Mess Administration',
        category: 'Hosteller',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(adminDisplayName)}&background=2563eb&color=fff`,
      });
      handleTabChange('admin-dashboard');
    }
  };

  const handleAddStudent = (newStudent: StudentRecord) => {
    setStudents((prev) => [newStudent, ...prev]);
  };

  const handleAddScanLog = (newLog: ScanLog) => {
    setScanLogs((prev) => [newLog, ...prev]);
  };

  const handleMarkAllAlertsRead = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, isUnread: false })));
  };

  const handleUpdateStudentName = (newName: string) => {
    setStudentInfo((prev) => ({ ...prev, name: newName }));
  };

  const handleUpdateAvatar = (newAvatarUrl: string) => {
    setStudentInfo((prev) => ({ ...prev, avatar: newAvatarUrl }));
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (e) {}
    localStorage.clear();
    setIsLoggedIn(false);
    setUserRole('student');
    setCurrentTab('home');
    setIsLoginOpen(true);
  };

  const unreadAlertsCount = alerts.filter((a) => a.isUnread).length;

  // Show loading spinner while checking token
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: 'var(--orange-soft)', border: '1px solid var(--orange-light)' }}
          >
            🍴
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>
            Connecting to MessConnect…
          </p>
        </div>
      </div>
    );
  }

  // If user is not logged in, display full-screen Sign In page
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <PwaInstallPrompt />
        <LoginModal
          isOpen={true}
          isFullScreen={true}
          onClose={() => {}}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Desktop-only left rail */}
      <SideNav
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        userRole={userRole}
        userName={studentInfo.name}
        regNo={studentInfo.regNo}
        unreadAlertsCount={unreadAlertsCount}
        onLogout={handleLogout}
      />

      <div className="app-main">
        {/* PWA Install Banner (mobile) */}
        <PwaInstallPrompt />

      {/* Top bar */}
      <Header
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        userRole={userRole}
        setUserRole={handleRoleChange}
        studentAvatar={studentInfo.avatar}
        adminAvatar={adminAvatar}
        unreadCount={unreadAlertsCount}
      />

      {/* View Switcher Container */}
      <div className="flex-1 w-full flex flex-col">
        <ErrorBoundary resetKey={currentTab}>
        {userRole === 'student' && (
          <>
            {(currentTab === 'home' || currentTab === 'admin-dashboard') && (
              <StudentHomeView
                studentName={studentInfo.name}
                hostelName={studentInfo.hostel}
                onNavigate={handleTabChange}
              />
            )}
            {currentTab === 'calendar' && <MealPlanningView />}
            {currentTab === 'qr' && (
              <StudentQrView studentName={studentInfo.name} regNo={studentInfo.regNo} />
            )}
            {currentTab === 'alerts' && (
              <AlertsView alerts={alerts} onMarkAllRead={handleMarkAllAlertsRead} />
            )}
            {currentTab === 'profile' && (
              <ProfileView
                userRole="student"
                studentName={studentInfo.name}
                regNo={studentInfo.regNo}
                avatar={studentInfo.avatar}
                onUpdateName={handleUpdateStudentName}
                onUpdateAvatar={handleUpdateAvatar}
                onLogout={handleLogout}
              />
            )}
          </>
        )}

        {userRole === 'admin' && (
          <>
            {(currentTab === 'admin-dashboard' || currentTab === 'home') && (
              <AdminDashboardView initialModuleTab="daily-summary" onNavigate={handleTabChange} />
            )}
            {currentTab === 'admin-menu' && (
              <AdminDashboardView initialModuleTab="weekly-menu" onNavigate={handleTabChange} />
            )}
            {currentTab === 'admin-ledger' && (
              <AdminDashboardView initialModuleTab="ledger" onNavigate={handleTabChange} />
            )}
            {currentTab === 'admin-students' && (
              <AdminDashboardView initialModuleTab="student-data" onNavigate={handleTabChange} />
            )}
            {currentTab === 'admin-scanner' && (
              <AdminScannerView scanLogs={scanLogs} onAddScanLog={handleAddScanLog} />
            )}
            {currentTab === 'admin-billing' && (
              <AdminDashboardView initialModuleTab="billing" onNavigate={handleTabChange} />
            )}
            {currentTab === 'admin-payments' && (
              <AdminDashboardView initialModuleTab="payments" onNavigate={handleTabChange} />
            )}
            {currentTab === 'admin-stocks' && (
              <AdminDashboardView initialModuleTab="stocks" onNavigate={handleTabChange} />
            )}
            {currentTab === 'alerts' && (
              <AlertsView alerts={alerts} onMarkAllRead={handleMarkAllAlertsRead} />
            )}
            {currentTab === 'profile' && (
              <ProfileView
                userRole={studentInfo.regNo?.toUpperCase() === 'SADMIN001' ? 'super_admin' : 'admin'}
                studentName={studentInfo.name || 'Admin'}
                regNo={studentInfo.regNo || 'ADMIN001'}
                avatar={studentInfo.avatar}
                onUpdateName={handleUpdateStudentName}
                onUpdateAvatar={handleUpdateAvatar}
                onLogout={handleLogout}
              />
            )}
          </>
        )}
        </ErrorBoundary>
      </div>

        {/* Bottom Navigation for Mobile */}
        <BottomNav
          currentTab={currentTab}
          setCurrentTab={handleTabChange}
          userRole={userRole}
          unreadAlertsCount={unreadAlertsCount}
        />
      </div>
    </div>
  );
}

export default App;
