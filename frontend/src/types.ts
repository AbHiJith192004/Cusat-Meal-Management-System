export type UserRole = 'student' | 'admin';

export type ActiveTab =
  // Student tabs
  | 'home'
  | 'calendar'
  | 'qr'
  | 'alerts'
  | 'profile'
  | 'bill'
  // Admin tabs
  | 'admin-dashboard'
  | 'admin-students'
  | 'admin-scanner'
  | 'admin-menu'
  | 'admin-ledger'
  | 'admin-payments'
  | 'admin-billing';

export type CommitteeDuration = 'MEAL' | 'DAY' | 'WEEK';

export interface StudentRecord {
  id: string;
  messId: string;
  regNo: string;
  name: string;
  room: string;
  avatar: string;
  lunchStatus: 'Confirmed' | 'Skipped';
  attendanceStatus: 'Present' | 'Absent' | 'Pending';
  accountStatus?: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'INACTIVE';
  attendancePct: number;
  fines: number;
  phone?: string;
  /**
   * The server's StudentType, verbatim. This used to be the display strings
   * 'Hosteller' | 'Day Scholar', which no API ever returns and which left no
   * room for OUTMESS at all -- the label is applied where it is shown.
   */
  category?: 'HOSTELLER' | 'DAY_SCHOLAR' | 'OUTMESS';
  campusLocation?: 'MAIN_CAMPUS' | 'LAKESIDE_CAMPUS';
  mealsDone?: number;
  mealsSkipped?: number;
  isCommitteeMember?: boolean;
  committeeDuration?: CommitteeDuration;
}


export interface ScanLog {
  id: string;
  studentName: string;
  regNo: string;
  meal: 'Breakfast' | 'Lunch' | 'Dinner';
  status: 'Success' | 'Duplicate' | 'Skipped';
  timestamp: string;
  timeAgo: string;
}

export interface AlertItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'info' | 'warning' | 'success';
  isUnread?: boolean;
}
