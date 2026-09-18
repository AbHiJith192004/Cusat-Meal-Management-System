import React, {useCallback, useEffect, useState} from 'react';
import {adminApi, menuApi} from '../services/api';

const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;
type Meal = typeof MEALS[number];

const iso = (d: Date) => {
  // Local calendar date, not UTC. toISOString() shifts backwards for IST and
  // would publish Monday's menu onto Sunday for anyone editing before 05:30.
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

interface Draft { items: string; notes: string }

export const WeeklyMenuView: React.FC = () => {
  const [monday, setMonday] = useState(() => weekStart(new Date()));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Which cell is open for editing, as "YYYY-MM-DD|MEAL".
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({items: '', notes: ''});
  const [saving, setSaving] = useState(false);

  const days = Array.from({length: 7}, (_, i) => addDays(monday, i));
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

  const cellFor = (day: Date, meal: Meal) =>
    rows.find(r => r.menu_date === iso(day) && r.meal_type === meal);

  const openEditor = (day: Date, meal: Meal) => {
    const existing = cellFor(day, meal);
    setEditing(`${iso(day)}|${meal}`);
    setDraft({
      items: Array.isArray(existing?.items) ? existing.items.join(', ') : '',
      notes: existing?.notes || '',
    });
    setMessage(''); setError('');
  };

  const save = async (day: Date, meal: Meal) => {
    const items = draft.items.split(',').map(x => x.trim()).filter(Boolean);
    if (items.length === 0) {
      setError('Add at least one item, separated by commas.');
      return;
    }
    setSaving(true); setError('');
    try {
      await adminApi.publishMenu(iso(day), meal, items, draft.notes.trim() || undefined);
      setEditing(null);
      setMessage(`${meal.charAt(0) + meal.slice(1).toLowerCase()} published for ${day.toLocaleDateString('en-IN', {weekday: 'long', day: 'numeric', month: 'short'})}.`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not publish that menu.');
    } finally { setSaving(false); }
  };

  const publishedCount = rows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary" onClick={() => setMonday(addDays(monday, -7))}>Previous week</button>
        <button className="btn-secondary" onClick={() => setMonday(weekStart(new Date()))}>This week</button>
        <button className="btn-secondary" onClick={() => setMonday(addDays(monday, 7))}>Next week</button>
        <span className="text-sm font-semibold" style={{color: 'var(--text-dark)'}}>
          {monday.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}
          {' – '}
          {addDays(monday, 6).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'})}
        </span>
        <span className="text-xs" style={{color: 'var(--text-body)'}}>
          {loading ? 'Loading…' : `${publishedCount} of 21 meals published`}
        </span>
      </div>

      {error && <p role="alert" className="text-sm" style={{color: 'var(--red)'}}>{error}</p>}
      {message && <p className="text-sm" style={{color: 'var(--green, #006c49)'}}>{message}</p>}

      <div className="space-y-3">
        {days.map(day => {
          const isToday = iso(day) === todayIso;
          return (
            <div key={iso(day)} className="rounded-2xl p-3 sm:p-4"
                 style={{background: 'var(--card)', border: isToday ? '2px solid var(--primary, #B7470D)' : '1px solid var(--card-border)'}}>
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="font-bold" style={{color: 'var(--text-dark)'}}>
                  {day.toLocaleDateString('en-IN', {weekday: 'long'})}
                </h3>
                <span className="text-xs" style={{color: 'var(--text-body)'}}>
                  {day.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}
                </span>
                {isToday && <span className="text-[10px] font-bold uppercase tracking-wider" style={{color: 'var(--primary, #B7470D)'}}>Today</span>}
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                {MEALS.map(meal => {
                  const key = `${iso(day)}|${meal}`;
                  const existing = cellFor(day, meal);
                  const open = editing === key;
                  return (
                    <div key={meal} className="rounded-xl p-3" style={{background: 'var(--bg)'}}>
                      <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{color: 'var(--text-body)'}}>
                        {meal.charAt(0) + meal.slice(1).toLowerCase()}
                      </p>

                      {open ? (
                        <div className="space-y-2">
                          <textarea className="stitch-input" rows={3} autoFocus
                                    placeholder="Idli, Sambar, Chutney"
                                    value={draft.items}
                                    onChange={e => setDraft({...draft, items: e.target.value})} />
                          <input className="stitch-input" placeholder="Note (optional)"
                                 value={draft.notes}
                                 onChange={e => setDraft({...draft, notes: e.target.value})} />
                          <div className="flex gap-2">
                            <button className="btn-primary text-xs" disabled={saving}
                                    onClick={() => save(day, meal)}>
                              {saving ? 'Saving…' : 'Publish'}
                            </button>
                            <button className="btn-secondary text-xs" disabled={saving}
                                    onClick={() => setEditing(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button className="text-left w-full" onClick={() => openEditor(day, meal)}>
                          {existing ? (
                            <>
                              <span className="text-sm block" style={{color: 'var(--text-dark)'}}>
                                {(Array.isArray(existing.items) ? existing.items : []).join(', ')}
                              </span>
                              {existing.notes && (
                                <span className="text-xs block mt-1" style={{color: 'var(--text-body)'}}>
                                  {existing.notes}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-sm" style={{color: 'var(--text-body)'}}>
                              Not published — tap to add
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
