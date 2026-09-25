import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, menuApi } from '../services/api';
import { Modal } from '../components/Modal';
import { DashboardSummary, type DashboardSummaryProps } from '../components/DashboardSummary';
import { parseWindow, formatWindow } from '../utils/mealWindows';

type MealKey = 'breakfast' | 'lunch' | 'dinner';
type TileKey = 'total' | 'served' | 'skipped' | 'pending' | 'fined' | 'not_eligible';

interface MealStats {
  total: number;
  served: number;
  skipped: number;
  pending: number;
  fined: number;
  not_eligible: number;
  time_window?: string;
}

interface Reconciliation {
  status: 'COMPLETED' | 'FAILED';
  ran_at: string | null;
  target_date: string | null;
  fines_created: number | null;
  error: string | null;
}

interface DashboardData {
  date: string;
  total_students: number;
  pending_fines_count: number;
  today_stats: Record<MealKey, MealStats>;
  /** Null until the nightly job has run once since this was deployed. */
  last_reconciliation?: Reconciliation | null;
}

/**
 * The nightly job raises the missed-meal fines. Nothing alerts on a
 * scheduled job failing, so the only way to notice it had stopped was a
 * wrong bill weeks later. A run older than ~26 hours means it has missed
 * its 01:00 slot -- the hour of slack covers a late start without crying
 * wolf every morning.
 */
const STALE_AFTER_HOURS = 26;

const reconciliationState = (r: Reconciliation | null | undefined) => {
  if (!r) return {
    tone: 'unknown' as const,
    text: 'The nightly fine run has not reported yet.',
  };
  const ranAt = r.ran_at ? new Date(r.ran_at) : null;
  const when = ranAt
    ? ranAt.toLocaleString('en-IN', {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'})
    : 'an unknown time';
  if (r.status === 'FAILED') return {
    tone: 'bad' as const,
    text: `The nightly fine run failed at ${when}. ${r.error || ''}`.trim(),
  };
  const hours = ranAt ? (Date.now() - ranAt.getTime()) / 3_600_000 : Infinity;
  if (hours > STALE_AFTER_HOURS) return {
    tone: 'bad' as const,
    text: `The nightly fine run has not completed since ${when}. Fines are not being raised.`,
  };
  const count = r.fines_created;
  return {
    tone: 'good' as const,
    text: `Nightly fine run completed ${when}`
      + (count === null || count === undefined ? '.' : ` · ${count} fine${count === 1 ? '' : 's'} raised.`),
  };
};

interface DrillDown {
  mealType: string;
  mealTitle: string;
  category: string;
  categoryLabel: string;
  colorHex: string;
}

const MEALS: MealKey[] = ['breakfast', 'lunch', 'dinner'];

/** Header band colour per meal, taken from the meal palette in index.css. */
const MEAL_BAND: Record<MealKey, { icon: string; band: string; ink: string }> = {
  breakfast: { icon: 'bakery_dining', band: 'var(--meal-breakfast)', ink: '#8B5E0A' },
  lunch:     { icon: 'lunch_dining',  band: 'var(--meal-lunch)',     ink: '#8B1A1A' },
  dinner:    { icon: 'dinner_dining', band: 'var(--meal-dinner)',    ink: '#3D1A8B' },
};

/**
 * The six figures, in the order the dashboard has always shown them. Each one
 * is a button: the server can list the exact students behind every count, so
 * there is no reason to make an admin go and search for them by hand.
 */
const TILES: ReadonlyArray<{
  key: TileKey;
  label: string;
  title: string;
  sub: string;
  icon: string;
  color: string;
  category: string;
}> = [
  { key: 'total',        label: 'Total students', title: 'Total Students',   sub: 'Click for list',  icon: 'groups',       color: '#F47A35', category: 'TOTAL' },
  { key: 'served',       label: 'Served',         title: 'Students Served',  sub: 'Scanned & eaten', icon: 'check_circle', color: '#16A34A', category: 'SERVED' },
  { key: 'skipped',      label: 'Skipped',        title: 'Students Skipped', sub: 'Opted out',       icon: 'cancel',       color: '#DC2626', category: 'SKIPPED' },
  { key: 'pending',      label: 'Pending',        title: 'Students Pending', sub: 'Awaiting scan',   icon: 'pending',      color: '#EA580C', category: 'PENDING' },
  { key: 'fined',        label: 'Fined',          title: 'Fined Students',   sub: 'Missed & fined',  icon: 'warning',      color: '#DC2626', category: 'FINED' },
  { key: 'not_eligible', label: 'Not eligible',   title: 'Not Eligible',     sub: 'Excluded',        icon: 'block',        color: '#6B7280', category: 'NOT_ELIGIBLE' },
];

/** "07:00–09:30 IST" -> minutes past midnight, so the card can say where we are. */
const windowMinutes = parseWindow;

const prettyWindow = (w?: string) => formatWindow(w) ?? 'Serving window not configured';

/**
 * Currently Serving / Upcoming / Meal Over. The windows come from the server's
 * meal-timing settings, not from constants baked into the bundle, so changing
 * the serving hours in Operations changes this badge too.
 */
const statusInfo = (w?: string) => {
  const parsed = windowMinutes(w);
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (!parsed) return { label: 'Window not set', bg: 'bg-[#6B7280]/10 text-[#4B5563] border-[#6B7280]/30', icon: 'help' };
  if (mins >= parsed[0] && mins <= parsed[1])
    return { label: 'Currently Serving', bg: 'bg-[#22C55E]/10 text-[#16A34A] border-[#22C55E]/30', icon: 'play_circle' };
  if (mins < parsed[0])
    return { label: 'Upcoming', bg: 'bg-[#3B82F6]/10 text-[#2563EB] border-[#3B82F6]/30', icon: 'schedule' };
  return { label: 'Meal Over', bg: 'bg-[#6B7280]/10 text-[#4B5563] border-[#6B7280]/30', icon: 'check_circle' };
};

const isoToday = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  // Local calendar date. toISOString() would roll back a day in IST before
  // 05:30 and show yesterday's menu as today's.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function AdminOverviewView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [menu, setMenu] = useState<any[]>([]);
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [drill, setDrill] = useState<DrillDown | null>(null);
  const [drillRows, setDrillRows] = useState<any[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillSearch, setDrillSearch] = useState('');

  const [marking, setMarking] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // The history rows carry their own window, and load separately from the
  // live figures: changing the window must not blank out today's meal cards,
  // and a failure in one must not hide the other.
  const [days, setDays] = useState(7);
  const [meal, setMeal] = useState('ALL');
  const [trends, setTrends] = useState<DashboardSummaryProps['data']>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendsError, setTrendsError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const iso = isoToday();
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

  useEffect(() => {
    let current = true;
    setTrendsLoading(true);
    setTrendsError('');
    adminApi.getDashboardTrends(days, meal)
      .then(res => { if (current) setTrends(res); })
      .catch(err => {
        if (!current) return;
        setTrends(null);
        setTrendsError(err instanceof Error ? err.message : 'Could not load the history rows.');
      })
      .finally(() => { if (current) setTrendsLoading(false); });
    // A quick change of window would otherwise let a slow earlier response
    // land last and show counts for a window nobody is looking at.
    return () => { current = false; };
  }, [days, meal]);

  const menuFor = (meal: MealKey) => {
    const row = menu.find((m: any) => String(m.meal_type).toLowerCase() === meal);
    return row && Array.isArray(row.items) && row.items.length > 0 ? row.items.join(', ') : null;
  };

  const openDrill = async (meal: MealKey, tile: typeof TILES[number]) => {
    const title = meal.charAt(0).toUpperCase() + meal.slice(1);
    setDrill({
      mealType: meal.toUpperCase(),
      mealTitle: title,
      category: tile.category,
      categoryLabel: tile.title,
      colorHex: tile.color,
    });
    setDrillSearch('');
    setDrillRows([]);
    setDrillLoading(true);
    try {
      const rows = await adminApi.getStudentsByStatus(meal.toUpperCase(), tile.category);
      setDrillRows(Array.isArray(rows) ? rows : []);
    } catch {
      setDrillRows([]);
    } finally {
      setDrillLoading(false);
    }
  };

  const filteredDrillRows = useMemo(() => {
    const q = drillSearch.trim().toLowerCase();
    if (!q) return drillRows;
    return drillRows.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.registration_number || '').toLowerCase().includes(q) ||
      (s.mess_id || '').toLowerCase().includes(q) ||
      (s.department || '').toLowerCase().includes(q));
  }, [drillRows, drillSearch]);

  /** The meal whose serving window contains right now, else the next one up. */
  const currentMeal = (): MealKey | null => {
    if (!data) return null;
    const mins = new Date().getHours() * 60 + new Date().getMinutes();
    for (const meal of MEALS) {
      const parsed = windowMinutes(data.today_stats[meal]?.time_window);
      if (parsed && mins >= parsed[0] && mins <= parsed[1]) return meal;
    }
    return null;
  };

  /**
   * Records Present for exactly the students the server reports as Pending for
   * the meal being served — everyone opted in who has not been scanned. Skips
   * and mess cuts are never in that list, so they cannot be swept up by this.
   */
  const autoMarkPresent = async () => {
    const meal = currentMeal();
    if (!meal) {
      setNotice({ ok: false, text: 'No meal is being served right now. Auto-marking is only for the meal in progress.' });
      return;
    }
    const title = meal.charAt(0).toUpperCase() + meal.slice(1);
    setNotice(null);
    setMarking(true);
    try {
      const pending = await adminApi.getStudentsByStatus(meal.toUpperCase(), 'PENDING');
      const ids = (Array.isArray(pending) ? pending : []).map((s: any) => s.id).filter(Boolean);
      if (ids.length === 0) {
        setNotice({ ok: true, text: `Every opted-in student already has ${title} attendance recorded.` });
        return;
      }
      if (!window.confirm(
        `Record ${title} attendance as Present for ${ids.length} student(s)?\n\n` +
        'These are the students who opted in and have not been scanned. ' +
        'Mess cuts and skips are not included.\n\nThis is written to the attendance record and audited.'
      )) return;

      const res: any = await adminApi.bulkAttendance({
        student_ids: ids,
        meal_date: isoToday(),
        meal_type: meal.toUpperCase(),
        reason: `Bulk ${title} attendance recorded from the dashboard; no scanner was staffed.`,
      });
      setNotice({ ok: true, text: `${res?.recorded ?? ids.length} student(s) recorded Present for ${title}.` });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Could not record attendance.' });
    } finally {
      setMarking(false);
    }
  };

  const prettyDate = data?.date
    ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN',
        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in" style={{ background: 'var(--bg)' }}>
      <div className="max-w-[1280px] mx-auto space-y-6">

        {/* Page header — the top bar already names the section, so this is just
            the date and the page action, on one row at every size */}
        <div
          className="flex items-center justify-between gap-3 pb-3"
          style={{ borderBottom: '1px solid var(--card-border)' }}
        >
          <p
            className="text-[12px] sm:text-sm font-semibold flex items-center gap-1.5 min-w-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>calendar_today</span>
            <span className="truncate">{prettyDate}</span>
          </p>

          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 font-bold text-xs rounded-xl cursor-pointer"
            style={{ background: 'var(--card)', color: 'var(--text-body)', border: '1px solid var(--card-border)' }}
            title="Refresh"
          >
            <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`} style={{ fontSize: 17 }}>refresh</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Nightly job heartbeat. Quiet when it is healthy, loud when it is
            not: a failed or stalled run means fines have stopped being
            raised, and nothing else in the product would say so. */}
        {data && (() => {
          const recon = reconciliationState(data.last_reconciliation);
          const tone = recon.tone === 'bad'
            ? { background: '#FDECEA', borderColor: '#F6C8C3', color: 'var(--red)', icon: 'error' }
            : recon.tone === 'unknown'
            ? { background: 'var(--card)', borderColor: 'var(--card-border)', color: 'var(--text-muted)', icon: 'schedule' }
            : { background: 'var(--card)', borderColor: 'var(--card-border)', color: 'var(--text-muted)', icon: 'task_alt' };
          return (
            <p
              role={recon.tone === 'bad' ? 'alert' : 'status'}
              className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-[11.5px] font-bold"
              style={{ background: tone.background, border: `1px solid ${tone.borderColor}`, color: tone.color }}
            >
              <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16 }}>{tone.icon}</span>
              <span className="flex-1">{recon.text}</span>
            </p>
          );
        })()}

        {/* History first: the week is the context for today's numbers. */}
        <DashboardSummary
          days={days}
          meal={meal}
          onDaysChange={setDays}
          onMealChange={setMeal}
          loading={trendsLoading}
          error={trendsError}
          data={trends}
        />

        <section className="space-y-6 animate-fade-in">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-[#EFDCB4] shadow-xs">
            <div>
              <h2 className="font-display text-[20px] font-bold flex items-center gap-2" style={{ color: 'var(--text-dark)' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--orange)' }}>today</span>
                Live Meal Overview
              </h2>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Click any metric card to inspect individual student records
              </p>
            </div>

            <button
              type="button"
              onClick={() => void autoMarkPresent()}
              disabled={marking || loading || !data}
              className="px-4 py-2.5 bg-[#15803d] hover:bg-[#126b33] disabled:opacity-60 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02]"
              title="Record Present for every opted-in student who has not been scanned for the meal now being served. Mess cuts and skips are excluded."
            >
              <span className={`material-symbols-outlined text-[18px] ${marking ? 'animate-spin' : ''}`}>
                {marking ? 'sync' : 'done_all'}
              </span>
              <span>{marking ? 'Recording…' : 'Auto-Mark All Present (Except Skips)'}</span>
            </button>
          </div>

          {notice && (
            <div
              role="status"
              className="px-4 py-3 rounded-xl text-xs font-bold flex items-start gap-2"
              style={notice.ok
                ? { background: 'var(--green-light)', border: '1px solid #A6DCBB', color: 'var(--green)' }
                : { background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                {notice.ok ? 'check_circle' : 'error'}
              </span>
              <span className="flex-1">{notice.text}</span>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border p-4 text-sm font-bold"
              style={{ background: '#FDECEA', borderColor: '#F6C8C3', color: 'var(--red)' }}>
              {error} No figures are shown because stale or sample values could be mistaken for live records.
            </div>
          )}

          {loading && !data && (
            <p role="status" className="py-12 text-center font-bold" style={{ color: 'var(--text-muted)' }}>
              Loading live records…
            </p>
          )}

          {data && MEALS.map(mealKey => {
            const mealTitle = mealKey.charAt(0).toUpperCase() + mealKey.slice(1);
            const stats = data.today_stats[mealKey] || ({} as MealStats);
            const band = MEAL_BAND[mealKey];
            const status = statusInfo(stats.time_window);
            const menuText = menuFor(mealKey);

            return (
              <div
                key={mealKey}
                className="rounded-2xl border overflow-hidden transition-all hover:shadow-md"
                style={{ background: 'var(--card)', borderColor: 'var(--card-border)', boxShadow: 'var(--card-shadow)' }}
              >
                {/* Header band — stacks on phones so the time range and the
                    status pill never get squeezed onto one line */}
                <div className="p-4 border-b" style={{ background: band.band, borderColor: 'var(--card-border)' }}>
                  <div className="flex items-start gap-3">
                    <span
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(255,255,255,0.65)', color: band.ink }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{band.icon}</span>
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <h3 className="font-display text-[19px] font-bold leading-none" style={{ color: 'var(--text-dark)' }}>
                          {mealTitle}
                        </h3>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${status.bg}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{status.icon}</span>
                          {status.label}
                        </span>
                      </div>

                      <p
                        className="text-[12px] font-bold mt-1 whitespace-nowrap"
                        style={{ color: 'var(--text-body)', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {prettyWindow(stats.time_window)}
                      </p>
                    </div>
                  </div>

                  <p className="text-[12px] font-semibold mt-2.5 leading-snug" style={{ color: 'var(--text-body)' }}>
                    <span style={{ color: 'var(--text-dark)', fontWeight: 800 }}>Today&rsquo;s menu: </span>
                    {menuText || <span style={{ color: 'var(--text-muted)' }}>not published yet</span>}
                  </p>
                </div>

                {/* Metric tiles */}
                <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                  {TILES.map(m => {
                    const value = Number(stats[m.key] ?? 0);
                    return (
                      <button
                        key={m.key}
                        onClick={() => void openDrill(mealKey, m)}
                        className="p-3 rounded-xl text-left cursor-pointer transition-colors flex flex-col gap-1"
                        style={{ border: `1px solid ${m.color}38`, background: `${m.color}0D` }}
                        title={`${m.title} — ${mealTitle}`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 15, color: m.color }}>
                            {m.icon}
                          </span>
                          <span className="text-[11px] font-bold truncate" style={{ color: m.color, fontFamily: 'Nunito, sans-serif' }}>
                            {m.label}
                          </span>
                        </span>

                        <span
                          className="font-display text-[22px] font-bold leading-none"
                          style={{ color: m.color, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {value.toLocaleString()}
                        </span>

                        <span className="flex items-center gap-0.5 text-[10.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          <span className="truncate">{m.sub}</span>
                          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 12 }}>chevron_right</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Things waiting on someone, rather than today's service */}
          {data && (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Student records', value: data.total_students, icon: 'group' },
                { label: 'Pending fines', value: data.pending_fines_count, icon: 'gavel' },
                { label: 'Payments awaiting review', value: pendingPayments, icon: 'payments' },
              ].map(card => (
                <div
                  key={card.label}
                  className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ background: 'var(--card)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)' }}
                >
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'var(--orange-soft)', color: 'var(--orange-ink)' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{card.icon}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider truncate" style={{ color: 'var(--text-muted)' }}>
                      {card.label}
                    </p>
                    <p className="font-display text-[22px] font-bold leading-tight" style={{ color: 'var(--text-dark)', fontVariantNumeric: 'tabular-nums' }}>
                      {card.value === null || card.value === undefined ? '—' : Number(card.value).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Metric drill-down ────────────────────────────────────── */}
      <Modal open={Boolean(drill)} onClose={() => setDrill(null)} panelClassName="max-w-3xl space-y-4">
        {drill && (
          <>

            <div className="flex justify-between items-start gap-3 pb-4 border-b border-[#EFDCB4]">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: drill.colorHex }}>
                  {drill.mealTitle}
                </p>
                <h3 className="font-display text-[19px] sm:text-[21px] font-bold text-[#2D1A0E] leading-tight mt-0.5">
                  {drill.categoryLabel}
                  <span className="font-semibold text-[#9B7B52]"> · {filteredDrillRows.length}</span>
                </h3>
                <p className="text-[11.5px] font-semibold text-[#9B7B52] mt-1">
                  Student breakdown for today&rsquo;s service
                </p>
              </div>

              <button
                onClick={() => setDrill(null)}
                className="w-9 h-9 shrink-0 rounded-full bg-[#F7EEDA] hover:bg-[#EFDCB4] text-[#9B7B52] flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#BFA37A] text-[20px]">search</span>
              <input
                type="text"
                value={drillSearch}
                onChange={e => setDrillSearch(e.target.value)}
                placeholder="Search student name, registration ID, department..."
                className="w-full pl-10 pr-4 py-2 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium focus:outline-none focus:border-[#F47A35]"
              />
            </div>

            <div className="flex-1 overflow-y-auto table-scroll min-h-[250px] border border-[#EFDCB4] rounded-xl">
              {drillLoading ? (
                <div className="p-12 text-center text-[#9B7B52] flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-[32px] text-[#F47A35]">sync</span>
                  <p className="text-sm font-semibold">Loading student records...</p>
                </div>
              ) : filteredDrillRows.length === 0 ? (
                <div className="p-12 text-center text-[#9B7B52] flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-[36px] text-[#BFA37A]">person_off</span>
                  <p className="text-base font-bold text-[#5C3D1E]">No students found</p>
                  <p className="text-xs text-[#9B7B52]">No student records matching this status criteria.</p>
                </div>
              ) : (
                <table className="data-table text-left text-sm">
                  <thead className="bg-[#FDF7EA] text-[#6B4A28] font-bold text-xs uppercase border-b border-[#EFDCB4] sticky top-0">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Reg No</th>
                      <th className="py-3 px-4">Mess ID</th>
                      <th className="py-3 px-4">Department / Class</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFDCB4]">
                    {filteredDrillRows.map((s, idx) => (
                      <tr key={s.id || idx} className="hover:bg-[#FDF7EA] transition-colors">
                        <td className="py-3 px-4 font-semibold text-[#2D1A0E] flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#F47A35]/10 text-[#F47A35] font-bold text-xs flex items-center justify-center">
                            {s.name?.charAt(0) || 'S'}
                          </div>
                          <span>{s.name}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-[#5C3D1E]">{s.registration_number}</td>
                        <td className="py-3 px-4 font-mono text-xs text-[#9B7B52]">{s.mess_id}</td>
                        <td className="py-3 px-4 text-xs text-[#6B4A28]">{s.department || '—'}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            style={{
                              backgroundColor: `${drill.colorHex}15`,
                              color: drill.colorHex,
                              borderColor: `${drill.colorHex}30`,
                            }}
                            className="px-2.5 py-0.5 border text-xs font-extrabold rounded-full inline-block"
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-2 flex justify-between items-center">
              <span className="text-xs font-semibold text-[#9B7B52]">
                Showing {filteredDrillRows.length} of {drillRows.length} records
              </span>
              <button
                onClick={() => setDrill(null)}
                className="px-5 py-2 bg-[#2D1A0E] text-white font-semibold text-xs rounded-xl hover:bg-[#3E2718] cursor-pointer"
              >
                Done / Close
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
