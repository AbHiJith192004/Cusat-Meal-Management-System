import { ActiveTab, UserRole } from './types';

/**
 * Single source of truth for navigation.
 *
 * The sidebar and the bottom bar used to keep their own hardcoded lists, which
 * drifted: the admin bottom bar was missing Ledger, Billing, Payments, Stocks
 * and Alerts entirely, so five screens were unreachable on a phone. Both now
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
      { id: 'admin-payments', label: 'Payments', short: 'Payments', icon: 'payments' },
      { id: 'admin-stocks',   label: 'Stocks',   short: 'Stocks',   icon: 'inventory_2' },
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

export const groupsFor = (role: UserRole): NavGroup[] =>
  role === 'student' ? STUDENT_GROUPS : ADMIN_GROUPS;

/**
 * Alerts and Profile already live in the top header for both roles, so they
 * are left out of the bottom bar entirely rather than duplicated there.
 * Everything else goes straight into the bar instead of hiding some of it
 * behind "More".
 */
const BAR_IDS: Record<UserRole, ActiveTab[]> = {
  student: ['home', 'calendar', 'qr', 'bill'],
  admin: [
    'admin-dashboard', 'admin-scanner', 'admin-menu', 'admin-students',
    'admin-ledger', 'admin-billing', 'admin-payments', 'admin-stocks',
  ],
};

const allEntries = (role: UserRole): NavEntry[] =>
  groupsFor(role).flatMap(g => g.items);

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
export const barEntries = (role: UserRole): NavEntry[] => {
  const all = allEntries(role);
  return BAR_IDS[role]
    .map(id => all.find(e => e.id === id))
    .filter((e): e is NavEntry => Boolean(e));
};

/** Everything that did not fit the bar, still grouped for the "More" sheet. */
export const overflowGroups = (role: UserRole): NavGroup[] => {
  const inBar = new Set(BAR_IDS[role]);
  const excluded = new Set(BOTTOM_NAV_EXCLUDE[role]);
  return groupsFor(role)
    .map(g => ({ heading: g.heading, items: g.items.filter(i => !inBar.has(i.id) && !excluded.has(i.id)) }))
    .filter(g => g.items.length > 0);
};

/** True when the active tab lives behind "More", so that tab can be highlighted. */
export const isOverflowTab = (role: UserRole, tab: ActiveTab): boolean =>
  overflowGroups(role).some(g => g.items.some(i => i.id === tab));
