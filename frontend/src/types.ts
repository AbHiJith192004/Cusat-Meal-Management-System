export type UserRole = 'student' | 'admin';

export type ActiveTab =
  // Student tabs
  | 'home'
  | 'calendar'
  | 'qr'
  | 'alerts'
  | 'profile'
  // Admin tabs
  | 'admin-dashboard'
  | 'admin-menu'
  | 'admin-ledger'
  | 'admin-logs'
  | 'admin-students'
  | 'admin-scanner'
  | 'admin-billing'
  | 'admin-payments'
  | 'admin-stocks'
  | 'admin-settings';

export interface MealOption {
  id: 'breakfast' | 'lunch' | 'dinner';
  name: string;
  time: string;
  status: 'confirmed' | 'skipped';
  isVegOnly?: boolean;
  items: string[];
  icon: string;
}

export interface DayMealPlan {
  date: string; // YYYY-MM-DD
  dayName: string; // Mon, Tue, Wed...
  dayNum: number; // 14, 15, 16...
  isPast?: boolean;
  isToday?: boolean;
  meals: {
    breakfast: MealOption;
    lunch: MealOption;
    dinner: MealOption;
  };
}

export interface StudentRecord {
  id: string;
  messId: string;
  regNo: string;
  name: string;
  room: string;
  avatar: string;
  lunchStatus: 'Confirmed' | 'Skipped';
  attendanceStatus: 'Present' | 'Absent' | 'Pending';
  attendancePct: number;
  fines: number;
  phone?: string;
  category?: 'Hosteller' | 'Day Scholar';
  campusLocation?: 'MAIN_CAMPUS' | 'LAKESIDE_CAMPUS';
  mealsDone?: number;
  mealsSkipped?: number;
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
