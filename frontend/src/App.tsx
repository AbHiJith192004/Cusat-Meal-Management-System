import { useState, useEffect, lazy, Suspense } from 'react';
import { UserRole, ActiveTab } from './types';
import { INITIAL_STUDENT } from './data/defaults';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { SideNav } from './components/SideNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StudentHomeView } from './views/StudentHomeView';
import { MealPlanningView } from './views/MealPlanningView';
const StudentQrView = lazy(() => import('./views/StudentQrView').then(module => ({ default: module.StudentQrView })));
import { StudentBillView } from './views/StudentBillView';
const AdminOverviewView = lazy(() => import('./views/AdminOverviewView').then(module => ({ default: module.AdminOverviewView })));
const BillingManagementView = lazy(() => import('./views/BillingManagementView').then(module => ({ default: module.BillingManagementView })));
const AdminScannerView = lazy(() => import('./views/AdminScannerView').then(module => ({ default: module.AdminScannerView })));
const WeeklyMenuView = lazy(() => import('./views/WeeklyMenuView').then(module => ({ default: module.WeeklyMenuView })));
const LedgerView = lazy(() => import('./views/LedgerView').then(module => ({ default: module.LedgerView })));
const PaymentsView = lazy(() => import('./views/PaymentsView').then(module => ({ default: module.PaymentsView })));
const SettingsView = lazy(() => import('./views/SettingsView').then(module => ({ default: module.SettingsView })));
import { StudentDirectoryView } from './views/StudentDirectoryView';
import { ProfileView } from './views/ProfileView';
import { AlertsView } from './views/AlertsView';
import { authApi, notificationsApi, studentApi, getAuthToken, restoreSession } from './services/api';

import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { LoginModal } from './components/LoginModal';


/**
 * Which screen to open on.
 *
 * The PWA manifest's shortcuts -- long-press the app icon for "Meal Schedule"
 * or "Mess Pass" -- point at /?tab=calendar and /?tab=qr. Nothing read that
 * parameter, so both shortcuts silently dropped the student wherever they had
 * been last. Only the two tabs the shortcuts actually use are accepted, so a
 * crafted link cannot deep-link into an admin screen; the role check in the
 * view switcher decides what renders regardless.
 */
const SHORTCUT_TABS: ActiveTab[] = ['calendar', 'qr'];

const shortcutTab = (): ActiveTab | null => {
  try {
    const asked = new URLSearchParams(window.location.search).get('tab') as ActiveTab | null;
    if (asked && SHORTCUT_TABS.includes(asked)) return asked;
  } catch {
    /* malformed query string - fall through to the remembered tab */
  }
  return null;
};

const requestedTab = (): ActiveTab =>
  shortcutTab() || (localStorage.getItem('messconnect_tab') as ActiveTab) || 'home';

export function App() {
  const [userRole, setUserRole] = useState<UserRole>(
    () => (localStorage.getItem('messconnect_role') as UserRole) || 'student'
  );
  const [currentTab, setCurrentTab] = useState<ActiveTab>(() => requestedTab());
  const [studentInfo, setStudentInfo] = useState(INITIAL_STUDENT);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);
  const [canScan, setCanScan] = useState(false);
  // The server's own word on the role. 'admin' above only says which shell to
  // render; this says what the account is actually allowed to do, so
  // Super-Admin-only controls are not offered to a plain admin who would then
  // be refused by the API.
  const [serverRole, setServerRole] = useState<string>('STUDENT');
  const isSuperAdmin = serverRole === 'SUPER_ADMIN';

  // Helper to change tab & persist in localStorage
  const handleTabChange = (tab: ActiveTab) => {
    setCurrentTab(tab);
    localStorage.setItem('messconnect_tab', tab);
  };

  // Check session and restore saved role & tab on app load / refresh
  useEffect(() => {
    const checkSession = async () => {
      setCheckingSession(true);

      // The access token is no longer persisted in localStorage, so on a fresh
      // page load there is nothing to read. Exchange the HttpOnly refresh
      // cookie for a new one instead - same outcome, but the token is never
      // readable by script.
      const token = getAuthToken() ?? ((await restoreSession()) ? getAuthToken() : null);

      if (token) {
        try {

          // /me works for every role — without this an admin's name resets to
          // the placeholder on every refresh.
          const profile = await studentApi.getProfile();
          const verifiedRole: UserRole = ["ADMIN", "SUPER_ADMIN"].includes(profile.role) ? "admin" : "student";
          setCanScan(Boolean(profile.capabilities?.attendance_scanner));
          setServerRole(profile.role || 'STUDENT');
          setUserRole(verifiedRole);
          // A shortcut the student deliberately tapped outranks the default
          // landing screen; otherwise restoring the session would throw them
          // back to Home and the shortcut would look broken again.
          const asked = shortcutTab();
          setCurrentTab(asked && verifiedRole === "student"
            ? asked
            : verifiedRole === "admin" ? "admin-dashboard" : "home");
          setStudentInfo((prev) => ({
            ...prev,
            name: profile.name || prev.name,
            regNo: profile.registration_number || prev.regNo,
            hostel: verifiedRole === 'admin' ? 'CUSAT Mess Administration' : prev.hostel,
          }));
          notificationsApi.getNotifications().then(rows => setUnreadAlertsCount(
            Array.isArray(rows) ? rows.filter((x:any) => !x.is_read).length : 0
          )).catch(() => {});
          setIsLoggedIn(true);
        } catch (e) {
          // Token expired or invalid — clear session
          ['messconnect_role', 'messconnect_tab', 'access_token'].forEach(key => localStorage.removeItem(key));
          setIsLoggedIn(false);
        }
      } else {
        // No saved token — show login screen
        setIsLoggedIn(false);
      }
      setCheckingSession(false);
    };
    checkSession();
  }, []);

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
    notificationsApi.getNotifications().then(rows => setUnreadAlertsCount(
      Array.isArray(rows) ? rows.filter((x:any) => !x.is_read).length : 0
    )).catch(() => {});

    if (role === 'student') {
      try {
        const profile = await studentApi.getProfile();
        setCanScan(Boolean(profile.capabilities?.attendance_scanner));
        setStudentInfo({
          name: profile.name || name,
          regNo: profile.registration_number || regNo,
          hostel: 'CUSAT Hostel Mess 1',
          category: 'Hosteller',
        });
      } catch (e) {
        setStudentInfo({
          name: name,
          regNo: regNo,
          hostel: 'CUSAT Hostel Mess 1',
          category: 'Hosteller',
        });
      }
      handleTabChange('home');
    } else {
      let adminRole = 'ADMIN';
      try {
        const profile = await studentApi.getProfile();
        adminRole = profile.role || 'ADMIN';
        setServerRole(adminRole);
      } catch (e) {
        setServerRole('ADMIN');
      }
      const adminDisplayName = name || (adminRole === 'SUPER_ADMIN' ? 'Super Warden' : 'Mess Admin');
      setStudentInfo({
        name: adminDisplayName,
        regNo: regNo,
        hostel: 'CUSAT Mess Administration',
        category: 'Hosteller',
      });
      handleTabChange('admin-dashboard');
    }
  };

  const handleUpdateStudentName = (newName: string) => {
    setStudentInfo((prev) => ({ ...prev, name: newName }));
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (e) {}
    ['messconnect_role', 'messconnect_tab', 'access_token'].forEach(key => localStorage.removeItem(key));
    setIsLoggedIn(false);
    setUnreadAlertsCount(0);
    setServerRole('STUDENT');
    setCanScan(false);
    setUserRole('student');
    setCurrentTab('home');
  };

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
        canScan={canScan}
        isSuperAdmin={isSuperAdmin}
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
        userName={studentInfo.name}
        unreadCount={unreadAlertsCount}
      />

      {/* View Switcher Container */}
      <div className="flex-1 w-full flex flex-col">
        <ErrorBoundary resetKey={currentTab}><Suspense fallback={<p role="status" className="p-6">Loading…</p>}>
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
              <StudentQrView studentName={studentInfo.name} regNo={studentInfo.regNo} canScan={canScan} />
            )}
            {currentTab === 'admin-scanner' && canScan && (
              <AdminScannerView />
            )}
            {currentTab === 'alerts' && (
              <AlertsView onUnreadChange={setUnreadAlertsCount} />
            )}
            {currentTab === 'bill' && <StudentBillView />}
            {currentTab === 'profile' && (
              <ProfileView
                userRole="student"
                studentName={studentInfo.name}
                regNo={studentInfo.regNo}
                onUpdateName={handleUpdateStudentName}
                onLogout={handleLogout}
              />
            )}
          </>
        )}

        {userRole === 'admin' && (
          <>
            {(currentTab === 'admin-dashboard' || currentTab === 'home') && <AdminOverviewView />}
            {currentTab === 'admin-students' && (
              <StudentDirectoryView isSuperAdmin={isSuperAdmin} />
            )}
            {currentTab === 'admin-scanner' && (
              <AdminScannerView
                canMarkManually={serverRole === 'ADMIN' || isSuperAdmin}
              />
            )}
            {currentTab === 'admin-billing' && (
              <BillingManagementView />
            )}
            {currentTab === 'admin-menu' && <WeeklyMenuView />}
            {currentTab === 'admin-ledger' && <LedgerView />}
            {currentTab === 'admin-payments' && <PaymentsView />}
            {currentTab === 'admin-settings' && isSuperAdmin && <SettingsView />}
            {currentTab === 'alerts' && (
              <AlertsView onUnreadChange={setUnreadAlertsCount} />
            )}
            {currentTab === 'profile' && (
              <ProfileView
                userRole={isSuperAdmin ? 'super_admin' : 'admin'}
                studentName={studentInfo.name || 'Admin'}
                regNo={studentInfo.regNo || 'ADMIN001'}
                onUpdateName={handleUpdateStudentName}
                onLogout={handleLogout}
              />
            )}
          </>
        )}
        </Suspense></ErrorBoundary>
      </div>

        {/* Bottom Navigation for Mobile */}
        <BottomNav
          currentTab={currentTab}
          setCurrentTab={handleTabChange}
          userRole={userRole}
          unreadAlertsCount={unreadAlertsCount}
          canScan={canScan}
          isSuperAdmin={isSuperAdmin}
        />
      </div>
    </div>
  );
}

export default App;
