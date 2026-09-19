import React, {useCallback, useEffect, useState} from 'react';
import {adminApi, menuApi} from '../services/api';

const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;
type Meal = typeof MEALS[number];

/** Colour per meal, matching the Overview cards. */
const MEAL_STYLE: Record<Meal, {icon: string; tint: string; ink: string; card: string}> = {
  BREAKFAST: {icon: 'bakery_dining', tint: '#B7470D', ink: '#B7470D', card: '#FFF6EE'},
  LUNCH:     {icon: 'lunch_dining',  tint: '#3F9E52', ink: '#3F9E52', card: '#EFF9F1'},
  DINNER:    {icon: 'dinner_dining', tint: '#6B4FA8', ink: '#6B4FA8', card: '#F3EFFB'},
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const iso = (d: Date) => {
  // Local calendar date. toISOString() shifts backwards for IST and would
  // publish Monday's menu onto Sunday for anyone editing before 05:30.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Monday of the week containing `from`. */
const weekStart = (from: Date) => {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

const addDays = (d: Date, n: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

export const WeeklyMenuView: React.FC = () => {
  const [monday, setMonday] = useState(() => weekStart(new Date()));
  // Which weekday is open. Defaults to today when the current week is shown.
  const [dayIndex, setDayIndex] = useState(() => (new Date().getDay() + 6) % 7);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, {items: string; notes: string}>>({});
  const [saving, setSaving] = useState(false);

  const days = Array.from({length: 7}, (_, i) => addDays(monday, i));
  const day = days[dayIndex];
  const todayIso = iso(new Date());

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await menuApi.list(iso(monday), iso(addDays(monday, 6)));
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setRows([]);
      setError(e?.message || 'Could not load the menu for this week.');
    } finally { setLoading(false); }
  }, [monday]);
  useEffect(() => { load(); }, [load]);

  const cellFor = (d: Date, meal: Meal) =>
    rows.find(r => r.menu_date === iso(d) && r.meal_type === meal);

  const startEditing = () => {
    const next: Record<string, {items: string; notes: string}> = {};
    for (const meal of MEALS) {
      const existing = cellFor(day, meal);
      next[meal] = {
        items: Array.isArray(existing?.items) ? existing.items.join(', ') : '',
        notes: existing?.notes || '',
      };
    }
    setDraft(next); setEditing(true); setMessage(''); setError('');
  };

  const saveDay = async () => {
    // Only the meals that were actually given items are published, so
    // opening the editor and saving does not wipe a meal left blank.
    const toSave = MEALS.filter(m => (draft[m]?.items || '').trim().length > 0);
    if (toSave.length === 0) {
      setError('Add items to at least one meal, separated by commas.');
      return;
    }
    setSaving(true); setError('');
    try {
      for (const meal of toSave) {
        const items = draft[meal].items.split(',').map(x => x.trim()).filter(Boolean);
        await adminApi.publishMenu(iso(day), meal, items, draft[meal].notes.trim() || undefined);
      }
      setEditing(false);
      setMessage(`${DAYS[dayIndex]}'s menu published.`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not publish that menu.');
    } finally { setSaving(false); }
  };

  const publishedCount = rows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold" style={{color: 'var(--text-body)'}}>
          <span className="material-symbols-outlined" style={{fontSize: 18}}>calendar_month</span>
          {day.toLocaleDateString('en-IN', {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'})}
        </p>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => load()} disabled={loading}>
            <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>refresh</span>
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold" style={{color: 'var(--orange)'}}>
            <span className="material-symbols-outlined">restaurant</span>
            Weekly Mess Menu Management
          </h2>
          <p className="text-sm" style={{color: 'var(--text-muted)'}}>
            Inspect and edit official food items for Monday through Sunday
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
              style={{background: '#E8F6EC', color: '#3F9E52'}}>
          <span style={{fontSize: 18, lineHeight: 0}}>•</span>
          {publishedCount} of 21 meals published
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary text-xs" onClick={() => setMonday(addDays(monday, -7))}>‹ Previous</button>
        {days.map((d, i) => (
          <button key={iso(d)} onClick={() => { setDayIndex(i); setEditing(false); }}
                  className={i === dayIndex ? 'btn-primary text-xs' : 'btn-secondary text-xs'}
                  title={d.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}>
            {DAYS[i]}
            {iso(d) === todayIso && <span style={{marginLeft: 4, fontSize: 9}}>●</span>}
          </button>
        ))}
        <button className="btn-secondary text-xs" onClick={() => setMonday(addDays(monday, 7))}>Next ›</button>
      </div>

      {error && <p role="alert" className="text-sm" style={{color: 'var(--red)'}}>{error}</p>}
      {message && <p className="text-sm" style={{color: '#3F9E52'}}>{message}</p>}

      <section className="stitch-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"
             style={{borderColor: 'var(--line)'}}>
          <div>
            <h3 className="font-display text-2xl font-bold" style={{color: 'var(--text-dark)'}}>
              {DAYS[dayIndex]} Menu Schedule
            </h3>
            <p className="text-sm" style={{color: 'var(--text-muted)'}}>
              {day.toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'})}
              {iso(day) === todayIso ? ' · today' : ''}
            </p>
          </div>
          {editing ? (
            <div className="flex gap-2">
              <button className="btn-primary" onClick={saveDay} disabled={saving}>
                {saving ? 'Publishing…' : 'Publish menu'}
              </button>
              <button className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            </div>
          ) : (
            <button className="btn-primary" onClick={startEditing}>
              <span className="material-symbols-outlined" style={{fontSize: 18}}>edit</span>
              Edit {DAYS[dayIndex]} Menu
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {MEALS.map(meal => {
            const style = MEAL_STYLE[meal];
            const existing = cellFor(day, meal);
            return (
              <div key={meal} className="rounded-2xl p-4"
                   style={{background: style.card, border: '1px solid var(--card-border)'}}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{background: style.tint, color: '#fff'}}>
                    <span className="material-symbols-outlined">{style.icon}</span>
                  </span>
                  <div>
                    <p className="font-display text-lg font-bold" style={{color: 'var(--text-dark)'}}>
                      {meal.charAt(0) + meal.slice(1).toLowerCase()}
                    </p>
                    {existing?.updated_at && !editing && (
                      <p className="text-[11px]" style={{color: 'var(--text-muted)'}}>
                        Updated {new Date(existing.updated_at).toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>
                </div>

                {editing ? (
                  <div className="mt-3 space-y-2">
                    <textarea className="stitch-input" rows={3} placeholder="Idli, Sambar, Chutney"
                              value={draft[meal]?.items || ''}
                              onChange={e => setDraft({...draft, [meal]: {...draft[meal], items: e.target.value}})} />
                    <input className="stitch-input" placeholder="Note (optional)"
                           value={draft[meal]?.notes || ''}
                           onChange={e => setDraft({...draft, [meal]: {...draft[meal], notes: e.target.value}})} />
                  </div>
                ) : (
                  <>
                    <p className="mt-3 text-sm" style={{color: 'var(--text-dark)'}}>
                      {existing && Array.isArray(existing.items) && existing.items.length > 0
                        ? existing.items.join(', ')
                        : <span style={{color: 'var(--text-muted)'}}>Not published for this day.</span>}
                    </p>
                    {existing?.notes && (
                      <p className="mt-1 text-xs" style={{color: 'var(--text-muted)'}}>{existing.notes}</p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
