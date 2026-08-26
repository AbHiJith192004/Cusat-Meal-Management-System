/// <reference types="vite/client" />
/**
 * API Integration Service connecting the Frontend to CUSAT Mess Backend REST API
 * Base URL: http://localhost:8000/api/v1
 */

const getApiBaseUrl = () => {
  const env = (import.meta as any).env;
  if (env && env.VITE_API_BASE_URL) {
    return env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
    return `${window.location.origin}/api/v1`;
  }
  return 'http://localhost:8000/api/v1';
};

const API_BASE_URL = getApiBaseUrl();

/**
 * The access token lives in memory only.
 *
 * It used to be persisted in localStorage, where any script on the page could
 * read it. Nothing is lost by holding it here: the refresh token is an
 * HttpOnly cookie, so a page reload re-obtains an access token via
 * `restoreSession()` below without the token ever being readable by script.
 */
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  // Clear any token left behind by a previous version of the app.
  try {
    localStorage.removeItem('access_token');
  } catch {
    /* storage unavailable (private mode) - nothing to clean up */
  }
};

export const getAuthToken = () => authToken;

/**
 * Exchange the HttpOnly refresh cookie for a fresh access token.
 * Call once on app start, in place of reading a persisted token.
 * Returns false when there is no valid session.
 */
export const restoreSession = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const json = await res.json();
    const token = json?.data?.access_token ?? json?.access_token;
    if (!token) return false;
    setAuthToken(token);
    return true;
  } catch {
    return false;
  }
};

async function request<T>(endpoint: string, options: RequestInit = {}, retries = 2): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  let response: Response | undefined;
  let lastErr: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include', // Send cookies for refresh token
      });
      break; // Success or HTTP response received
    } catch (netErr: any) {
      lastErr = netErr;
      if (attempt < retries) {
        // Wait 2.5s before retrying to allow Render free tier backend container to finish spinning up
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
  }

  if (!response) {
    throw new Error(`The backend server at ${API_BASE_URL} is waking up (Render cold start) or unreachable. Please wait 10-15 seconds and try clicking Sign In again.`);
  }

  const json = await response.json();

  if (!response.ok || !json.success) {
    const errorMsg = json.error?.message || `HTTP Error ${response.status}`;
    const errorCode = json.error?.code || 'UNKNOWN_ERROR';
    throw new Error(`[${errorCode}] ${errorMsg}`);
  }

  return json.data as T;
}

// Authentication API
export const authApi = {
  activate: (registration_number: string, date_of_birth: string, password: string) =>
    request<{ message: string }>('/auth/activate', {
      method: 'POST',
      body: JSON.stringify({ registration_number, date_of_birth, password }),
    }),

  resetPasswordByDob: (registration_number: string, date_of_birth: string, new_password: string) =>
    request<{ message: string }>('/auth/reset-password-dob', {
      method: 'POST',
      body: JSON.stringify({ registration_number, date_of_birth, new_password }),
    }),

  login: async (registration_number: string, password: string) => {
    const res = await request<{ access_token: string; expires_in: number }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ registration_number, password }),
    });
    setAuthToken(res.access_token);
    return res;
  },

  refresh: async () => {
    const res = await request<{ access_token: string; expires_in: number }>('/auth/refresh', {
      method: 'POST',
    });
    setAuthToken(res.access_token);
    return res;
  },

  logout: async () => {
    try {
      await request<{ message: string }>('/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },
};

// Student API
export const studentApi = {
  getProfile: () => request<any>('/me'),
  getDashboard: () => request<any>('/me/dashboard'),
  // Only returns data once the admin has published that month's bill - the
  // server enforces this, this just surfaces whatever it says.
  getMyBill: (month: number, year: number) => request<any>(`/me/bill?month=${month}&year=${year}`),
};

// Meal API
export const mealApi = {
  getMeals: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const q = params.toString();
    return request<any[]>(`/meals${q ? `?${q}` : ''}`);
  },

  updateMealSelection: (mealDate: string, mealType: string, status: 'CONFIRMED' | 'SKIPPED') =>
    request<any>(`/meals/${mealDate}/${mealType}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
};

// Attendance API
export const attendanceApi = {
  getQrToken: (mealType: string) =>
    request<{ qr_token: string; expires_at: string; validity_seconds: number }>(
      `/attendance/qr?meal_type=${mealType.toUpperCase()}`
    ),

  verifyQr: (qr_token: string) =>
    request<any>('/attendance/verify', {
      method: 'POST',
      body: JSON.stringify({ qr_token }),
    }),

  confirmQr: (verification_id: string) =>
    request<any>('/attendance/confirm', {
      method: 'POST',
      body: JSON.stringify({ verification_id }),
    }),
};

// Admin Operations API
export const adminApi = {
  getDashboard: () => request<any>('/admin/dashboard'),

  getStudentsByStatus: (mealType: string, category: string, mealDate?: string) => {
    const params = new URLSearchParams({ meal_type: mealType, category });
    if (mealDate) params.append('meal_date', mealDate);
    return request<any[]>(`/admin/dashboard/students-by-status?${params.toString()}`);
  },

  getStudents: (query?: string, page: number = 1) => {
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.append('query', query);
    return request<any[]>(`/admin/students?${params.toString()}`);
  },

  createStudent: (data: {
    name: string;
    registration_number: string;
    date_of_birth: string;
    department?: string;
    mess_id?: string;
    student_type?: string;
    campus_location?: string;
  }) =>
    request<any>('/admin/students', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStudentDetail: (id: string) => request<any>(`/admin/students/${id}`),

  resetAttendance: (registration_number: string, meal_type?: string) => {
    const params = new URLSearchParams({ registration_number });
    if (meal_type) params.append('meal_type', meal_type);
    return request<any>(`/admin/attendance/reset?${params.toString()}`, {
      method: 'DELETE',
    });
  },

  recordManualAttendance: (
    student_id: string,
    meal_date: string,
    meal_type: string,
    attendance_type: string,
    reason: string
  ) =>
    request<any>('/admin/attendance/manual', {
      method: 'POST',
      body: JSON.stringify({ student_id, meal_date, meal_type, attendance_type, reason }),
    }),

  listFines: (status?: string) => {
    const q = status ? `?status=${status}` : '';
    return request<any[]>(`/admin/fines${q}`);
  },

  waiveFine: (fine_id: string, reason: string) =>
    request<any>(`/admin/fines/${fine_id}/waive`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  reconcileFines: (target_date: string, meal_type?: string) =>
    request<any>('/admin/fines/reconcile', {
      method: 'POST',
      body: JSON.stringify({ target_date, meal_type }),
    }),

  declareHoliday: (date: string, meal_type: string | null, reason: string) =>
    request<any>('/admin/holidays', {
      method: 'POST',
      body: JSON.stringify({ date, meal_type, reason }),
    }),

  deleteHoliday: (holiday_id: string) =>
    request<any>(`/admin/holidays/${holiday_id}`, {
      method: 'DELETE',
    }),

  /**
   * Download a monthly report.
   *
   * Two things were removed here:
   *  - the token was appended to the URL as `?token=`, which puts a bearer
   *    credential into browser history and proxy access logs. The server no
   *    longer accepts that fallback either; the Authorization header is the
   *    only accepted form.
   *  - on 401/403 (and when no token was present) this used to silently call
   *    `login('ADMIN001', 'password123')` with a credential hardcoded into the
   *    shipped bundle. An auth failure now surfaces to the caller so the user
   *    can sign in again themselves.
   */
  // --- Billing periods and physical stock -----------------------------------
  // These replace a localStorage map that decided, per browser, whether a month
  // was published. Publication state is a shared financial fact, so it now
  // comes from the server.

  getBillStatus: (month: number, year: number) =>
    request<any>(`/admin/bills/status?month=${month}&year=${year}`),

  publishBill: (payload: {
    month: number;
    year: number;
    opening_stock_value: number;
    purchases_value: number;
    closing_stock_value: number;
    operational_expenses: number;
    administrative_expenses: number;
    chargeable_days: number;
  }) =>
    request<any>('/admin/bills/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  unpublishBill: (month: number, year: number, reason: string) =>
    request<any>('/admin/bills/unpublish', {
      method: 'POST',
      body: JSON.stringify({ month, year, reason }),
    }),

  listStockCounts: (month: number, year: number) =>
    request<any>(`/admin/stocks?month=${month}&year=${year}`),

  updatePhysicalStock: (payload: {
    month: number;
    year: number;
    item_id: string;
    item_name?: string;
    unit?: string;
    physical_closing_qty: number;
    unit_cost?: number;
  }) =>
    request<any>('/admin/stocks/update-physical', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  downloadReportFile: async (year: number, month: number, format: 'excel' | 'pdf') => {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Your session has expired. Sign in again to export a report.');
    }

    const url = `${API_BASE_URL}/admin/reports/monthly?year=${year}&month=${month}&format=${format}`;

    let response: Response | undefined;
    let lastNetworkError: unknown;

    // Retry transient network failures only - never an auth failure.
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        break;
      } catch (netErr) {
        lastNetworkError = netErr;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      }
    }

    if (!response) {
      throw new Error(
        'Could not reach the report server. Check your connection and try again.'
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error('Your session has expired. Sign in again to export a report.');
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Export failed (HTTP ${response.status}): ${errText || 'Report server error'}`);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `cusat_mess_report_${year}_${month.toString().padStart(2, '0')}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },

  getAuditLogs: (page: number = 1) => request<any[]>(`/admin/audit?page=${page}`),
};

// Notifications API
export const notificationsApi = {
  getNotifications: (page: number = 1) => request<any>(`/notifications?page=${page}`),
  markRead: (notification_id: string) =>
    request<any>(`/notifications/${notification_id}/read`, { method: 'PUT' }),
};

// Super Admin API
export const superAdminApi = {
  createAdmin: (registration_number: string, name: string, password: string, role: string = 'ADMIN') =>
    request<any>('/super-admin/admins', {
      method: 'POST',
      body: JSON.stringify({ registration_number, name, password, role }),
    }),

  getSettings: () => request<any[]>('/super-admin/settings'),

  updateSettings: (settings: { key: string; value: string }[]) =>
    request<any>('/super-admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    }),
};

// Meal Rates Pricing API
export const mealRateApi = {
  getMealRates: (year: number, month: number) =>
    request<any[]>(`/admin/meal-rates?year=${year}&month=${month}`),

  setMealRate: (data: {
    rate_date: string;
    breakfast_rate: number;
    lunch_rate: number;
    dinner_rate: number;
    notes?: string;
  }) =>
    request<any>('/admin/meal-rates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  bulkSetMealRates: (data: {
    year: number;
    month: number;
    breakfast_rate: number;
    lunch_rate: number;
    dinner_rate: number;
    notes?: string;
  }) =>
    request<any>('/admin/meal-rates/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
