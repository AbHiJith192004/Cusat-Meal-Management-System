import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../services/api';

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

export function AdminOverviewView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await adminApi.getDashboard());
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Could not load the live dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="page-container">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold" style={{ color: 'var(--text-dark)' }}>
            Live meal overview
          </h1>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Counts are read from the server for {data?.date ?? 'today'}.
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
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <article className="stitch-card p-5">
              <p className="section-label">Active student records</p>
              <p className="mt-2 font-display text-3xl font-bold">{data.total_students.toLocaleString()}</p>
            </article>
            <article className="stitch-card p-5">
              <p className="section-label">Pending fines</p>
              <p className="mt-2 font-display text-3xl font-bold">{data.pending_fines_count.toLocaleString()}</p>
            </article>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {MEALS.map(meal => {
              const stats = data.today_stats[meal];
              return (
                <article key={meal} className="stitch-card overflow-hidden">
                  <div className="border-b p-5" style={{ borderColor: 'var(--line)' }}>
                    <h2 className="font-display text-xl font-bold capitalize">{meal}</h2>
                    <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {stats.time_window || 'Serving window not configured'}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-px" style={{ background: 'var(--line)' }}>
                    {[
                      ['Eligible', stats.total],
                      ['Served', stats.served],
                      ['Opted out', stats.skipped],
                      ['Awaiting scan', stats.pending],
                      ['Fined', stats.fined],
                      ['Excluded', stats.not_eligible],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="bg-white p-4">
                        <dt className="text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{label}</dt>
                        <dd className="mt-1 text-xl font-black">{Number(value).toLocaleString()}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
