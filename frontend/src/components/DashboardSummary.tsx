import React from 'react';

/**
 * The Overview's history rows: a trend card of sparklines, then two labelled
 * rows of figures.
 *
 * The screen used to open on three large per-meal cards showing only today,
 * which answered "what is happening now" and nothing about the week. These
 * sit above those cards and answer the other question, over a window the
 * admin chooses. Everything is counted server-side from attendance, meal
 * selections, fines and users -- no figure here is derived from a guess, and
 * a zero means a zero.
 */

export interface TrendPoint { date: string; value: number }

const MEAL_OPTIONS = [
  { value: 'ALL', label: 'All meals' },
  { value: 'BREAKFAST', label: 'Breakfast' },
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'DINNER', label: 'Dinner' },
] as const;

const DAY_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
] as const;

/**
 * An inline sparkline. No chart library: four of these render on first paint
 * of the admin's landing screen, and a charting bundle would cost more than
 * the polyline it draws.
 *
 * A flat series (every value equal, including all-zero) has no range to scale
 * against, so it is drawn along the bottom instead of dividing by zero and
 * vanishing.
 */
const Sparkline: React.FC<{points: TrendPoint[]; stroke: string; fill: string}> = ({
  points, stroke, fill,
}) => {
  const W = 220;
  const H = 64;
  const PAD = 3;
  if (points.length === 0) return <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" />;

  const values = points.map(p => p.value);
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  const span = top - bottom;
  const x = (i: number) =>
    points.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) =>
    span === 0 ? H - PAD : H - PAD - ((v - bottom) * (H - PAD * 2)) / span;

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const area = `${PAD},${H} ${line} ${W - PAD},${H}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none"
         role="img" aria-hidden="true">
      <polygon points={area} fill={fill} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={1.75}
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/** One sparkline with its name and its latest value.
 *
 * `divided` draws the separator, and only at the width where all four cells
 * share a single row. Below that the grid reflows to two columns or one, and
 * a left border on what is now the first cell of a row reads as a stray line
 * against the card's own edge.
 */
const TrendCell: React.FC<{
  label: string; points: TrendPoint[]; stroke: string; fill: string; divided?: boolean;
}> = ({ label, points, stroke, fill, divided }) => {
  const last = points.length ? points[points.length - 1] : null;
  const day = last
    ? new Date(last.date + 'T00:00:00').toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})
    : '';
  return (
    <div
      className={`px-4 py-3 min-w-0 ${divided ? 'xl:border-l' : ''}`}
      style={divided ? { borderColor: 'var(--card-border)' } : undefined}
    >
      <p className="section-label">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-[22px] font-bold" style={{ color: 'var(--text-dark)' }}>
          {last ? last.value : '—'}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          {day ? `latest (${day})` : ''}
        </span>
      </p>
      <div className="mt-1.5">
        <Sparkline points={points} stroke={stroke} fill={fill} />
      </div>
    </div>
  );
};

/** One figure in the two summary rows. */
const StatCard: React.FC<{label: string; value: React.ReactNode; sub: string}> = ({
  label, value, sub,
}) => (
  <div
    className="rounded-2xl border p-4"
    style={{ background: 'var(--card)', borderColor: 'var(--card-border)',
             boxShadow: 'var(--card-shadow)' }}
  >
    <p className="section-label">{label}</p>
    <p className="font-display text-[26px] font-bold mt-1 leading-none"
       style={{ color: 'var(--text-dark)' }}>
      {value}
    </p>
    <p className="text-[11px] font-semibold mt-1.5" style={{ color: 'var(--text-muted)' }}>
      {sub}
    </p>
  </div>
);

export interface DashboardSummaryProps {
  days: number;
  meal: string;
  onDaysChange: (days: number) => void;
  onMealChange: (meal: string) => void;
  loading: boolean;
  error: string;
  data: {
    days: number; start: string; end: string;
    series: Record<'served' | 'eaters' | 'joined' | 'fines', TrendPoint[]>;
    reach: {students: number; active: number; ate: number; cut: number;
            fined: number; ate_rate: number};
    volume: {served: number; cuts: number; fines: number;
             fine_amount: string; closures: number};
  } | null;
}

export const DashboardSummary: React.FC<DashboardSummaryProps> = ({
  days, meal, onDaysChange, onMealChange, loading, error, data,
}) => {
  const money = (raw: string) => {
    const n = Number(raw);
    return Number.isFinite(n)
      ? `₹${n.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`
      : `₹${raw}`;
  };
  const mealNote = meal === 'ALL' ? 'all three sittings' : MEAL_OPTIONS.find(m => m.value === meal)!.label.toLowerCase() + ' only';

  return (
    <section className="space-y-4">
      {/* Filter bar. Both controls re-ask the server, so every figure below
          belongs to the same window and the same sitting. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
               style={{ background: 'var(--card)', border: '1px solid var(--card-border)',
                        color: 'var(--text-body)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>
          <select
            aria-label="Window length"
            value={days}
            onChange={e => onDaysChange(Number(e.target.value))}
            className="bg-transparent font-bold cursor-pointer outline-none"
            style={{ color: 'var(--text-body)' }}
          >
            {DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
               style={{ background: 'var(--card)', border: '1px solid var(--card-border)',
                        color: 'var(--text-body)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Meal</span>
          <select
            aria-label="Which sitting to count"
            value={meal}
            onChange={e => onMealChange(e.target.value)}
            className="bg-transparent font-bold cursor-pointer outline-none"
            style={{ color: 'var(--text-body)' }}
          >
            {MEAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {loading && (
          <span role="status" className="text-[11px] font-bold flex items-center gap-1.5"
                style={{ color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: 15 }}>
              progress_activity
            </span>
            Counting…
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="px-3.5 py-3 rounded-xl text-xs font-bold"
           style={{ background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)' }}>
          {error} The history rows are hidden rather than shown with stale counts.
        </p>
      )}

      {data && (
        <>
          {/* ── Trend ─────────────────────────────────────────────── */}
          <div className="rounded-2xl border overflow-hidden"
               style={{ background: 'var(--card)', borderColor: 'var(--card-border)',
                        boxShadow: 'var(--card-shadow)' }}>
            <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
              <p className="section-label">Daily trend</p>
              <p className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
                {data.days} days · {mealNote}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 pt-1 pb-2">
              <TrendCell label="Meals served" points={data.series.served}
                         stroke="var(--orange)" fill="rgba(244,122,53,0.13)" />
              <TrendCell label="Students who ate" points={data.series.eaters}
                         stroke="var(--green)" fill="rgba(22,163,74,0.12)" divided />
              <TrendCell label="Students activated" points={data.series.joined}
                         stroke="#2563EB" fill="rgba(37,99,235,0.12)" divided />
              <TrendCell label="Fines raised" points={data.series.fines}
                         stroke="var(--red)" fill="rgba(220,38,38,0.12)" divided />
            </div>
          </div>

          {/* ── Reach ─────────────────────────────────────────────── */}
          <div>
            <p className="section-label mb-2.5">Reach · distinct students</p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard label="Students" value={data.reach.students} sub="all accounts" />
              <StatCard label="Active" value={data.reach.active} sub="able to eat" />
              <StatCard label="Ate" value={data.reach.ate}
                        sub={`${data.reach.ate_rate}% of active`} />
              <StatCard label="Took a cut" value={data.reach.cut} sub="opted out at least once" />
              <StatCard label="Fined" value={data.reach.fined} sub="missed a confirmed meal" />
              <StatCard label="Ate → active" value={`${data.reach.ate_rate}%`}
                        sub={`${data.reach.ate} / ${data.reach.active} distinct`} />
            </div>
          </div>

          {/* ── Volume ────────────────────────────────────────────── */}
          <div>
            <p className="section-label mb-2.5">Volume · over the window</p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <StatCard label="Meals served" value={data.volume.served} sub="attendance records" />
              <StatCard label="Per day" value={(data.volume.served / data.days).toFixed(1)}
                        sub={`served ÷ ${data.days} days`} />
              <StatCard label="Mess cuts" value={data.volume.cuts} sub="students opted out" />
              <StatCard label="Fines raised" value={data.volume.fines} sub="not waived" />
              <StatCard label="Fines value" value={money(data.volume.fine_amount)}
                        sub="not waived" />
              <StatCard label="Closed days" value={data.volume.closures}
                        sub="mess shut, any sitting" />
            </div>
          </div>
        </>
      )}
    </section>
  );
};
