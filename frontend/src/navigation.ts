import { ActiveTab, UserRole } from './types';

/**
 * Single source of truth for navigation.
 *
 * The sidebar and the bottom bar used to keep their own hardcoded lists, which
 * drifted between screen sizes. Both now
 * read from here, and a destination added below shows up in both places.
 */

export interface NavEntry {
  id: ActiveTab;
  /** Sidebar label — room for the full name. */
  label: string;
  /** Bottom-bar label — must survive a ~64px tab. */
  short: string;
  icon: string;
}

export interface NavGroup {
  heading?: string;
  items: NavEntry[];
}

export const STUDENT_GROUPS: NavGroup[] = [
  {
    items: [
      { id: 'home',     label: 'Home',          short: 'Home',   icon: 'home' },
      { id: 'calendar', label: 'Meal Schedule', short: 'Menu',   icon: 'restaurant_menu' },
      { id: 'qr',       label: 'Mess Pass',     short: 'Pass',   icon: 'confirmation_number' },
      { id: 'alerts',   label: 'Alerts',        short: 'Alerts', icon: 'notifications' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { id: 'bill',    label: 'My Bill', short: 'Bill',    icon: 'receipt_long' },
      { id: 'profile', label: 'Profile', short: 'Profile', icon: 'person' },
    ],
  },
];

/**
 * Settings is Super Admin only, and the server agrees: the endpoints behind it
 * are guarded by SuperAdminUser, so a plain admin shown this row would just
 * collect a 403. It is appended rather than sitting in the list with a flag so
 * that everything reading ADMIN_GROUPS keeps seeing only what it should.
 */
export const SETTINGS_ENTRY: NavEntry = {
  id: 'admin-settings', label: 'Settings', short: 'Settings', icon: 'settings',
};

export const ADMIN_GROUPS: NavGroup[] = [
  {
    items: [
      { id: 'admin-dashboard', label: 'Overview',    short: 'Overview', icon: 'space_dashboard' },
      { id: 'admin-scanner',   label: 'QR Scanner',  short: 'Scan',     icon: 'qr_code_scanner' },
      { id: 'admin-menu',      label: 'Weekly Menu', short: 'Menu',     icon: 'restaurant_menu' },
      { id: 'admin-students',  label: 'Students',    short: 'Students', icon: 'group' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { id: 'admin-ledger',   label: 'Ledger',   short: 'Ledger',   icon: 'account_balance_wallet' },
      { id: 'admin-billing',  label: 'Billing',  short: 'Billing',  icon: 'receipt_long' },
      { id: 'admin-payments', label: 'Payments', short: 'Pay',      icon: 'payments' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { id: 'alerts',  label: 'Alerts',  short: 'Alerts',  icon: 'notifications' },
      { id: 'profile', label: 'Profile', short: 'Profile', icon: 'person' },
    ],
  },
];

export const groupsFor = (role: UserRole, canScan = false, isSuperAdmin = false): NavGroup[] => {
  if (role !== 'student') {
    if (!isSuperAdmin) return ADMIN_GROUPS;
    return ADMIN_GROUPS.map(g =>
      g.heading === 'Account' ? { ...g, items: [...g.items, SETTINGS_ENTRY] } : g);
  }
  if (!canScan) return STUDENT_GROUPS;
  return [{items:[...STUDENT_GROUPS[0].items,
    {id:'admin-scanner',label:'Committee Scanner',short:'Scan',icon:'qr_code_scanner'}]}, ...STUDENT_GROUPS.slice(1)];
};

/**
 * Alerts and Profile already live in the top header for both roles, so they
 * are left out of the bottom bar entirely rather than duplicated there.
 * Everything else goes straight into the bar instead of hiding some of it
 * behind "More".
 */
const BAR_IDS: Record<UserRole, ActiveTab[]> = {
  student: ['home', 'calendar', 'qr', 'bill'],
  admin: [
    'admin-dashboard', 'admin-scanner', 'admin-students', 'admin-billing',
  ],
};

/**
 * Alerts and Profile stay in STUDENT_GROUPS/ADMIN_GROUPS for the desktop
 * sidebar (which has no top-header icons of its own), but the mobile header
 * already carries a notification bell and avatar for both roles - so the
 * bottom bar/"More" sheet drops them entirely instead of surfacing a
 * redundant second copy.
 */
const BOTTOM_NAV_EXCLUDE: Record<UserRole, ActiveTab[]> = {
  student: ['alerts', 'profile'],
  admin: ['alerts', 'profile'],
};

/** Entries shown directly in the bottom bar, in bar order. */
export const barEntries = (role: UserRole, canScan = false, isSuperAdmin = false): NavEntry[] => {
  const all = groupsFor(role, canScan, isSuperAdmin).flatMap(g => g.items);
  if (role === 'student' && canScan) return ['home','qr','admin-scanner','bill']
    .map(id => all.find(e => e.id === id)).filter((e): e is NavEntry => Boolean(e));
  return BAR_IDS[role]
    .map(id => all.find(e => e.id === id))
    .filter((e): e is NavEntry => Boolean(e));
};

/** Everything that did not fit the bar, still grouped for the "More" sheet. */
export const overflowGroups = (role: UserRole, canScan = false, isSuperAdmin = false): NavGroup[] => {
  const inBar = new Set(BAR_IDS[role]);
  const excluded = new Set(BOTTOM_NAV_EXCLUDE[role]);
  const scanBar = role === 'student' && canScan
    ? new Set<ActiveTab>(['home','qr','admin-scanner','bill']) : inBar;
  return groupsFor(role, canScan, isSuperAdmin)
    .map(g => ({ heading: g.heading, items: g.items.filter(i => !scanBar.has(i.id) && !excluded.has(i.id)) }))
    .filter(g => g.items.length > 0);
};

/** True when the active tab lives behind "More", so that tab can be highlighted. */
export const isOverflowTab = (role: UserRole, tab: ActiveTab, canScan = false, isSuperAdmin = false): boolean =>
  overflowGroups(role, canScan, isSuperAdmin).some(g => g.items.some(i => i.id === tab));
