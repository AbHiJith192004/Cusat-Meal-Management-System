import { useCallback, useEffect, useState } from 'react';
import { adminApi, menuApi } from '../services/api';

type MealKey = 'breakfast' | 'lunch' | 'dinner';

interface MealStats {
  total: number;
  served: number;
  skipped: number;
  pending: number;
  fined: number;
  not_eligible: number;
  time_window?: string;
}

interface DashboardData {
  date: string;
  total_students: number;
  pending_fines_count: number;
  today_stats: Record<MealKey, MealStats>;
}

const MEALS: MealKey[] = ['breakfast', 'lunch', 'dinner'];

/** Icon and accent per meal, matching the colours used on the menu cards. */
const MEAL_STYLE: Record<MealKey, { icon: string; tint: string; ink: string }> = {
  breakfast: { icon: 'bakery_dining', tint: '#FFF1E6', ink: '#B7470D' },
  lunch:     { icon: 'lunch_dining',  tint: '#E8F6EC', ink: '#3F9E52' },
  dinner:    { icon: 'dinner_dining', tint: '#EFE9FA', ink: '#6B4FA8' },
};

/** The six figures, in the order the old dashboard showed them. */
const TILES = [
  { key: 'total',        label: 'Total students', sub: 'On the mess',   icon: 'group',        ink: '#B7470D', tint: '#FFF6EE' },
  { key: 'served',       label: 'Served',         sub: 'Scanned & eaten', icon: 'check_circle', ink: '#3F9E52', tint: '#EFF9F1' },
  { key: 'skipped',      label: 'Skipped',        sub: 'Opted out',     icon: 'cancel',       ink: '#DC4A3D', tint: '#FDF0EE' },
  { key: 'pending',      label: 'Pending',        sub: 'Awaiting scan', icon: 'pending',      ink: '#E8A33D', tint: '#FEF7EC' },
  { key: 'fined',        label: 'Fined',          sub: 'Missed & fined', icon: 'warning',     ink: '#DC4A3D', tint: '#FDF0EE' },
  { key: 'not_eligible', label: 'Not eligible',   sub: 'Excluded',      icon: 'block',        ink: '#9B7B52', tint: '#F7F2E9' },
] as const;

/** "07:00–09:30 IST" -> minutes past midnight, so the card can say where we are. */
const windowMinutes = (w?: string): [number, number] | null => {
  const m = (w || '').match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return [Number(m[1]) * 60 + Number(m[2]), Number(m[3]) * 60 + Number(m[4])];
};

const prettyWindow = (w?: string) => {
  const parsed = windowMinutes(w);
  if (!parsed) return w || 'Serving window not configured';
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60), mm = String(mins % 60).padStart(2, '0');
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${mm} ${suffix}`;
  };
  return `${fmt(parsed[0])} – ${fmt(parsed[1])}`;
};

const phaseOf = (w?: string) => {
  const parsed = windowMinutes(w);
  if (!parsed) return null;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < parsed[0]) return { text: 'Upcoming', ink: '#9B7B52', tint: '#F7F2E9', icon: 'schedule' };
  if (mins > parsed[1]) return { text: 'Meal Over', ink: '#5C3D1E', tint: '#F2EADA', icon: 'check_circle' };
  return { text: 'Serving now', ink: '#3F9E52', tint: '#E8F6EC', icon: 'radio_button_checked' };
};

export function AdminOverviewView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [menu, setMenu] = useState<any[]>([]);
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      // Local calendar date. toISOString() would roll back a day in IST
      // before 05:30 and show yesterday's menu as today's.
      const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      // The menu and payment counts are extras: if either fails the meal
      // figures are still worth showing, so they settle separately rather
      // than taking the whole screen down with them.
      const [dash, todayMenu, payments] = await Promise.allSettled([
        adminApi.getDashboard(),
        menuApi.list(iso, iso),
        adminApi.getPayments('PENDING'),
      ]);
      if (dash.status === 'rejected') throw dash.reason;
      setData(dash.value as DashboardData);
      setMenu(todayMenu.status === 'fulfilled' && Array.isArray(todayMenu.value) ? todayMenu.value : []);
      setPendingPayments(payments.status === 'fulfilled' && Array.isArray(payments.value)
        ? payments.value.length : null);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Could not load the live dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const menuFor = (meal: MealKey) => {
    const row = menu.find((m: any) => String(m.meal_type).toLowerCase() === meal);
    return row && Array.isArray(row.items) && row.items.length > 0 ? row.items.join(', ') : null;
  };

  const prettyDate = data?.date
    ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN',
        {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'})
    : 'today';

  return (
    <main className="page-container">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold" style={{ color: 'var(--text-dark)' }}>
            Live meal overview
          </h1>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Counts are read from the server for {prettyDate}.
          </p>
        </div>
        <button className="btn-secondary" type="button" onClick={() => void load()} disabled={loading}>
          <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>refresh</span>
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-5 rounded-xl border p-4 text-sm font-bold"
          style={{ background: '#FDECEA', borderColor: '#F6C8C3', color: 'var(--red)' }}>
          {error} No figures are shown because stale or sample values could be mistaken for live records.
        </div>
      )}

      {loading && !data && <p role="status" className="py-12 text-center font-bold">Loading live records...</p>}

      {data && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <article className="stitch-card p-5">
              <p className="section-label">Active student records</p>
              <p className="mt-2 font-display text-3xl font-bold">{data.total_students.toLocaleString()}</p>
            </article>
            <article className="stitch-card p-5">
              <p className="section-label">Pending fines</p>
              <p className="mt-2 font-display text-3xl font-bold">{data.pending_fines_count.toLocaleString()}</p>
            </article>
            <article className="stitch-card p-5">
              <p className="section-label">Payments awaiting review</p>
              <p className="mt-2 font-display text-3xl font-bold">
                {pendingPayments === null ? '—' : pendingPayments.toLocaleString()}
              </p>
            </article>
          </div>

          <div className="space-y-4">
            {MEALS.map(meal => {
              const stats = data.today_stats[meal];
              const style = MEAL_STYLE[meal];
              const phase = phaseOf(stats.time_window);
              const items = menuFor(meal);
              return (
                <article key={meal} className="stitch-card p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                          style={{ background: style.tint, color: style.ink }}>
                      <span className="material-symbols-outlined">{style.icon}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-xl font-bold capitalize"
                            style={{ color: 'var(--text-dark)' }}>{meal}</h2>
                        {phase && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                                style={{ background: phase.tint, color: phase.ink }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{phase.icon}</span>
                            {phase.text}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                        {prettyWindow(stats.time_window)}
                      </p>
                      <p className="mt-1.5 text-sm" style={{ color: 'var(--text-body)' }}>
                        <span className="font-bold" style={{ color: 'var(--text-dark)' }}>Today's menu: </span>
                        {items || <span style={{ color: 'var(--text-muted)' }}>not published yet</span>}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {TILES.map(tile => (
                      <div key={tile.key} className="rounded-xl p-3"
                           style={{ background: tile.tint, border: '1px solid var(--card-border)' }}>
                        <p className="flex items-center gap-1 text-[11px] font-bold" style={{ color: tile.ink }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{tile.icon}</span>
                          {tile.label}
                        </p>
                        <p className="mt-0.5 font-display text-2xl font-black" style={{ color: 'var(--text-dark)' }}>
                          {Number(stats[tile.key as keyof MealStats] ?? 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{tile.sub}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
