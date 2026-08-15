import { DayMealPlan, StudentRecord, ScanLog, AlertItem } from '../types';

export const INITIAL_STUDENT = {
  name: 'Student Account',
  regNo: 'STUDENT',
  hostel: 'CUSAT Hostel Mess 1',
  category: 'Hosteller',
  avatar: 'https://ui-avatars.com/api/?name=Student&background=2563eb&color=fff'
};

export const INITIAL_MEAL_PLANS: DayMealPlan[] = [];

export const INITIAL_STUDENTS: StudentRecord[] = [];

export const INITIAL_SCAN_LOGS: ScanLog[] = [];

export const INITIAL_ALERTS: AlertItem[] = [];
