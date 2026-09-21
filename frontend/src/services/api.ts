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

const setAuthToken = (token: string | null) => {
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
let refreshInFlight: Promise<boolean> | null = null;
export const restoreSession = (): Promise<boolean> => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST', credentials: 'include', signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { setAuthToken(null); return false; }
      const json = await res.json();
      const token = json?.data?.access_token;
      setAuthToken(token || null);
      return Boolean(token);
    } catch { return false; }
    finally { refreshInFlight = null; }
  })();
  return refreshInFlight;
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const send = () => fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    credentials: 'include', signal: options.signal || AbortSignal.timeout(15000),
  });
  let response: Response;
  try {
    const sentToken = authToken;
    response = await send();
    // A 401 occurs before the authenticated handler executes. Never retry an
    // ambiguous network failure: the server may already have saved the write.
    if (response.status === 401 && !endpoint.startsWith('/auth/')) {
      if ((authToken && authToken !== sentToken) || await restoreSession()) response = await send();
    }
  } catch {
    throw new Error('Could not reach the server. Refresh to check whether your change was saved before trying again.');
  }
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    // A 422 puts the useful part in `details` and leaves `message` as the
    // generic "Request validation failed." Dropping the details meant a
    // student who chose a short password was told only that something was
    // wrong, with no way to find out what.
    const details = json?.error?.details;
    const fields = Array.isArray(details)
      ? details.map((d: any) => d?.message).filter(Boolean).join(' ')
      : '';
    const message = [json?.error?.message || `Request failed (HTTP ${response.status}).`, fields]
      .filter(Boolean).join(' ');
    throw new Error(`[${json?.error?.code || 'REQUEST_FAILED'}] ${message}`);
  }
  return json.data as T;
}

// Authentication API
export const authApi = {
  activate: (registration_number: string, setup_code: string, password: string) =>
    request<{ message: string }>('/auth/activate', {
      method: 'POST',
      body: JSON.stringify({ registration_number, setup_code, password }),
    }),

  // First activation on id + date of birth. Works only while the account is
  // PENDING; once it has a password this route refuses, and a forgotten
  // password needs a staff-issued code instead.
  activateWithDob: (registration_number: string, date_of_birth: string, password: string) =>
    request<{ message: string }>('/auth/activate-with-dob', {
      method: 'POST',
      body: JSON.stringify({ registration_number, date_of_birth, password }),
    }),

  resetPasswordWithCode: (registration_number: string, setup_code: string, password: string) =>
    request<{ message: string }>('/auth/activate', {
      method: 'POST', body: JSON.stringify({ registration_number, setup_code, password }),
    }),

  login: async (registration_number: string, password: string) => {
    const res = await request<{ access_token: string; expires_in: number }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ registration_number, password }),
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

  updateFullDay: (mealDate: string, status: 'CONFIRMED' | 'SKIPPED') =>
    request<any>(`/meals/${mealDate}`, { method: 'PUT', body: JSON.stringify({ status }) }),

  updateMealSelection: (mealDate: string, mealType: string, status: 'CONFIRMED' | 'SKIPPED') =>
    request<any>(`/meals/${mealDate}/${mealType}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
};

export const menuApi = {
  list: (startDate?: string, endDate?: string) => {
    const p = new URLSearchParams();
    if (startDate) p.set('start_date', startDate);
    if (endDate) p.set('end_date', endDate);
    return request<any[]>(`/menus${p.toString() ? `?${p}` : ''}`);
  },
};

// Attendance API
export const attendanceApi = {
  getRecent: () => request<any[]>('/attendance/recent'),
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
  /**
   * The whole roll, walked a page at a time because the server caps per_page
   * at 100. The page ceiling used to be 10, which silently returned the first
   * 1,000 students and no indication that more existed -- a directory that
   * quietly loses people is worse than one that refuses. It now walks far
   * enough for any realistic roll and throws if it somehow does not finish.
   */
  getAllStudents: async (query?: string) => {
    const PER_PAGE = 100;
    const MAX_PAGES = 100;
    const all: any[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({page: String(page), per_page: String(PER_PAGE)});
      if (query) params.set('query', query);
      const rows = await request<any[]>(`/admin/students?${params}`);
      all.push(...rows);
      if (rows.length < PER_PAGE) return all;
    }
    throw new Error(
      `The student roll is larger than ${MAX_PAGES * PER_PAGE} records, which this screen cannot page through. ` +
      'Use the search box to narrow it down.');
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

  issueSetupCode: (studentId: string, reason: string) =>
    request<{setup_code: string; expires_at: string}>(`/admin/students/${studentId}/setup-code`, {
      method: 'POST', body: JSON.stringify({reason}),
    }),

  /**
   * Change what a student is for billing. Both fields move money -- OUTMESS
   * leaves the billing cohort entirely and the campus carries a different
   * rate -- so the server demands a reason and audits the before/after.
   */
  updateMembership: (studentId: string, data: {
    student_type: string; campus_location: string; reason: string;
  }) => request<any>(`/admin/students/${studentId}/membership`, {
    method: 'PATCH', body: JSON.stringify(data),
  }),

  /**
   * Suspend a student, or put a suspended one back.
   *
   * The caller says which direction; the server decides the resulting status,
   * because reinstating someone who never activated must return them to
   * PENDING rather than claim they are ready to sign in.
   */
  setStudentSuspended: (studentId: string, suspend: boolean, reason: string) =>
    request<{student_id: string; account_status: string}>(
      `/admin/students/${studentId}/status`,
      {method: 'PATCH', body: JSON.stringify({suspend, reason})}),

  resetAttendance: (registration_number: string, reason: string, meal_type?: string) => {
    const params = new URLSearchParams({ registration_number, reason });
    if (meal_type) params.append('meal_type', meal_type);
    return request<any>(`/admin/attendance/reset?${params.toString()}`, {
      method: 'DELETE',
    });
  },

  /**
   * Download a monthly report.
   *
   * Two things were removed here:
   *  - the token was appended to the URL as `?token=`, which puts a bearer
   *    credential into browser history and proxy access logs. The server no
   *    longer accepts that fallback either; the Authorization header is the
   *    only accepted form.
   *  - an old fallback silently signed in with a credential embedded in the
   *    shipped bundle. An auth failure now surfaces so the user signs in.
   */
  // --- Billing periods and physical stock -----------------------------------
  // These replace a localStorage map that decided, per browser, whether a month
  // was published. Publication state is a shared financial fact, so it now
  // comes from the server.

  getBillStatus: (month: number, year: number) =>
    request<any>(`/admin/bills/status?month=${month}&year=${year}`),

  previewBill: (payload: Record<string, number | string>) => request<any>('/admin/bills/preview', {method: 'POST', body: JSON.stringify(payload)}),
  getPublishedBills: (month: number, year: number) => request<any[]>(`/admin/bills/students?month=${month}&year=${year}`),

  publishBill: (payload: {
    month: number;
    year: number;
    opening_stock_value: number;
    purchases_value: number;
    closing_stock_value: number;
    operational_expenses: number;
    administrative_expenses: number;
    preview_token?: string;
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

  downloadReportFile: async (year: number, month: number, format: 'excel' | 'pdf') => {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Your session has expired. Sign in again to export a report.');
    }

    const url = `${API_BASE_URL}/admin/reports/monthly?year=${year}&month=${month}&format=${format}`;

    let response: Response | undefined;

    // Retry transient network failures only - never an auth failure.
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        break;
      } catch {
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

  publishMenu: (date: string, mealType: string, items: string[], notes?: string) =>
    request<any>(`/admin/menus/${date}/${mealType}`, {method: 'PUT', body: JSON.stringify({items, notes})}),

  // Mess closures. meal_type null shuts the whole day; a meal name shuts just
  // that sitting. The server cascades the affected selections to NO_SERVICE
  // and reverses them again if the closure is cancelled.
  listHolidays: (start: string, end: string) =>
    request<any[]>(`/admin/holidays?start=${start}&end=${end}`),
  declareHoliday: (date: string, mealType: string | null, reason: string) =>
    request<any>('/admin/holidays', {
      method: 'POST', body: JSON.stringify({date, meal_type: mealType, reason}),
    }),
  cancelHoliday: (holidayId: string) =>
    request<any>(`/admin/holidays/${holidayId}`, {method: 'DELETE'}),
  getLedger: (kind?: string) => request<any>(`/admin/ledger${kind ? `?kind=${kind}` : ''}`),
  getLedgerPeriodSummary: (month: number, year: number) => request<any>(`/admin/ledger/period-summary?month=${month}&year=${year}`),
  createLedger: (data: any) => request<any>('/admin/ledger', {method: 'POST', body: JSON.stringify(data)}),
  voidLedger: (id: string, reason: string) => request<any>(`/admin/ledger/${id}/void`, {method: 'POST', body: JSON.stringify({reason})}),
  getCommittee: () => request<any[]>('/admin/committee'),
  assignCommittee: (data: any) => request<any>('/admin/committee/promote', {method: 'POST', body: JSON.stringify(data)}),
  revokeCommittee: (studentId: string, reason: string) => request<any>(`/admin/committee/revoke/${studentId}`, {method: 'POST', body: JSON.stringify({reason})}),
  bulkAttendance: (data: any) => request<any>('/admin/attendance/bulk-mark', {method: 'POST', body: JSON.stringify(data)}),

  /** Active students only, name-sorted -- the picker for marking attendance by hand. */
  getStudentOptions: () =>
    request<Array<{id: string; name: string; registration_number: string}>>('/admin/student-options'),

  /**
   * Record a meal for a student who could not present a pass.
   *
   * ADMIN and SUPER_ADMIN only: a committee student with scanner access is
   * refused by the server, which is why the form is not offered to them.
   * The reason is mandatory and lands in the audit log beside the row.
   */
  recordManualAttendance: (payload: {
    student_id: string;
    meal_date: string;
    meal_type: 'BREAKFAST' | 'LUNCH' | 'DINNER';
    reason: string;
  }) =>
    request<any>('/admin/attendance/manual', {
      method: 'POST',
      body: JSON.stringify({...payload, attendance_type: 'MANUAL'}),
    }),
  getPayments: (status?: string) => request<any[]>(`/admin/payments${status ? `?status=${status}` : ''}`),
  reviewPayment: (id: string, decision: 'VERIFIED' | 'REJECTED', note: string) =>
    request<any>(`/admin/payments/${id}/review`, {method: 'POST', body: JSON.stringify({decision, note})}),
};

export const paymentApi = {
  listMine: () => request<any[]>('/me/payments'),
  submit: (month: number, year: number, utr: string, amount: number) =>
    request<any>('/me/payments', {method: 'POST', body: JSON.stringify({month, year, utr, amount})}),
};

// Notifications API
export const notificationsApi = {
  getNotifications: (page: number = 1) => request<any>(`/notifications?page=${page}`),
  markRead: (notification_id: string) =>
    request<any>(`/notifications/${notification_id}/read`, { method: 'POST' }),
};

// Super Admin API
export const superAdminApi = {
  /** Every system setting, as stored. Super Admin only. */
  getSettings: () =>
    request<Array<{id: string; key: string; value: string; description: string | null;
                   updated_at: string | null}>>('/super-admin/settings'),

  /**
   * Write settings as one batch. The server validates the whole batch and
   * rejects it entirely if any known key would be left unparseable, so a
   * half-applied meal window cannot happen.
   */
  updateSettings: (settings: Array<{key: string; value: string}>) =>
    request<{message: string}>('/super-admin/settings', {
      method: 'PUT', body: JSON.stringify({settings}),
    }),

  // No password argument: the creator does not choose the new administrator's
  // password. The response carries a one-time setup_code they redeem to set
  // their own, and it is never retrievable again.
  createAdmin: (registration_number: string, name: string, role: string = 'ADMIN') =>
    request<{
      id: string;
      registration_number: string;
      name: string;
      role: string;
      account_status: string;
      setup_code: string;
      setup_code_expires_at: string;
    }>('/super-admin/admins', {
      method: 'POST',
      body: JSON.stringify({ registration_number, name, role }),
    }),
};
