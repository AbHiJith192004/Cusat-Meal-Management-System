import React, {useCallback, useEffect, useState} from 'react';
import {adminApi, menuApi} from '../services/api';

const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;
type Meal = typeof MEALS[number];

/** One accent per meal, the way the menu cards have always been coloured. */
const MEAL_STYLE: Record<Meal, {icon: string; accent: string}> = {
  BREAKFAST: {icon: 'bakery_dining', accent: '#F47A35'},
  LUNCH:     {icon: 'lunch_dining',  accent: '#16a34a'},
  DINNER:    {icon: 'dinner_dining', accent: '#7c3aed'},
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

/** "07:00–09:30 IST" as the server sends it -> "7:00 AM – 9:30 AM". */
const prettyWindow = (w?: string) => {
  const m = (w || '').match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const fmt = (h: number, mm: string) => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${mm} ${suffix}`;
  };
  return `${fmt(Number(m[1]), m[2])} – ${fmt(Number(m[3]), m[4])}`;
};

export const WeeklyMenuView: React.FC = () => {
  const [monday, setMonday] = useState(() => weekStart(new Date()));
  // Which weekday is open. Defaults to today when the current week is shown.
  const [dayIndex, setDayIndex] = useState(() => (new Date().getDay() + 6) % 7);
  const [rows, setRows] = useState<any[]>([]);
  const [windows, setWindows] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, {items: string; notes: string}>>({});
  const [saving, setSaving] = useState(false);

  const days = Array.from({length: 7}, (_, i) => addDays(monday, i));
  const day = days[dayIndex];
  const todayIso = iso(new Date());
  // A menu is a plan. Once the day has gone, rewriting it only makes the
  // published record disagree with what students actually ate, so the server
  // refuses it (MENU_DATE_IN_PAST) and the editor is not offered either.
  // Today stays editable -- correcting this morning's menu before lunch is
  // ordinary work.
  const dayHasPassed = iso(day) < todayIso;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // The serving hours live in the mess settings, so they are read rather
      // than printed from constants that would go stale the moment the times
      // are changed in Operations.
      const [menu, dash] = await Promise.allSettled([
        menuApi.list(iso(monday), iso(addDays(monday, 6))),
        adminApi.getDashboard(),
      ]);
      if (menu.status === 'rejected') throw menu.reason;
      setRows(Array.isArray(menu.value) ? menu.value : []);
      if (dash.status === 'fulfilled') {
        const stats = (dash.value as any)?.today_stats || {};
        setWindows({
          BREAKFAST: stats.breakfast?.time_window,
          LUNCH: stats.lunch?.time_window,
          DINNER: stats.dinner?.time_window,
        });
      }
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
    <div className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in" style={{background: 'var(--bg)'}}>
      <div className="max-w-[1280px] mx-auto space-y-6">

        {/* Page header — week being edited, and the two page actions */}
        <div className="flex items-center justify-between gap-3 pb-3" style={{borderBottom: '1px solid var(--card-border)'}}>
          <p className="text-[12px] sm:text-sm font-semibold flex items-center gap-1.5 min-w-0" style={{color: 'var(--text-muted)'}}>
            <span className="material-symbols-outlined shrink-0" style={{fontSize: 16}}>calendar_today</span>
            <span className="truncate">
              Week of {monday.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'})}
            </span>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setMonday(addDays(monday, -7)); setEditing(false); }}
              className="flex items-center gap-1 px-3 py-2 font-bold text-xs rounded-xl cursor-pointer"
              style={{background: 'var(--card)', color: 'var(--text-body)', border: '1px solid var(--card-border)'}}
            >
              <span className="material-symbols-outlined" style={{fontSize: 17}}>chevron_left</span>
              <span className="hidden sm:inline">Previous</span>
            </button>
            <button
              onClick={() => { setMonday(addDays(monday, 7)); setEditing(false); }}
              className="flex items-center gap-1 px-3 py-2 font-bold text-xs rounded-xl cursor-pointer"
              style={{background: 'var(--card)', color: 'var(--text-body)', border: '1px solid var(--card-border)'}}
            >
              <span className="hidden sm:inline">Next</span>
              <span className="material-symbols-outlined" style={{fontSize: 17}}>chevron_right</span>
            </button>
            <button
              onClick={() => load()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 font-bold text-xs rounded-xl cursor-pointer"
              style={{background: 'var(--card)', color: 'var(--text-body)', border: '1px solid var(--card-border)'}}
              title="Refresh"
            >
              <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`} style={{fontSize: 17}}>refresh</span>
            </button>
          </div>
        </div>

        <section className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-bold text-[#2D1A0E] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#F47A35]">restaurant_menu</span>
                Weekly Mess Menu Management
              </h2>
              <p className="text-xs font-medium text-[#9B7B52]">
                Inspect and edit official food items for Monday through Sunday
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/30 text-xs font-bold rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#16a34a] animate-pulse"></span>
                {publishedCount} of 21 meals published
              </span>
            </div>
          </div>

          {/* Day Selector Tabs */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 border-b border-[#EFDCB4]">
            {days.map((d, idx) => (
              <button
                key={iso(d)}
                onClick={() => { setDayIndex(idx); setEditing(false); }}
                className={`px-3.5 sm:px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
                  dayIndex === idx
                    ? 'bg-[#F47A35] text-[#2D1A0E]'
                    : 'bg-white text-[#6B4A28] hover:bg-[#F7EEDA] border border-[#EFDCB4]'
                }`}
                title={d.toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}
              >
                {/* Phones only have room for the short form */}
                <span className="sm:hidden">{DAYS[idx].slice(0, 3)}</span>
                <span className="hidden sm:inline">{DAYS[idx]}</span>
                {iso(d) === todayIso && <span style={{marginLeft: 5, fontSize: 9}}>●</span>}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="px-3.5 py-3 rounded-xl text-xs font-bold"
               style={{background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)'}}>{error}</p>
          )}
          {message && (
            <p role="status" className="px-3.5 py-3 rounded-xl text-xs font-bold"
               style={{background: 'var(--green-light)', border: '1px solid #A6DCBB', color: 'var(--green)'}}>{message}</p>
          )}

          {/* Selected Day Menu Detail Card */}
          <div className="bg-white rounded-2xl border border-[#EFDCB4] p-4 sm:p-6 space-y-5 sm:space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#EFDCB4] pb-4 gap-3">
              <div>
                <h3 className="text-2xl font-extrabold text-[#2D1A0E]">{DAYS[dayIndex]} Menu Schedule</h3>
                <p className="text-xs font-medium text-[#9B7B52] mt-0.5">
                  {day.toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'})}
                  {iso(day) === todayIso ? ' · today' : dayHasPassed ? ' · already served' : ''}
                </p>
              </div>

              {editing ? (
                <div className="flex gap-2">
                  <button
                    onClick={saveDay}
                    disabled={saving}
                    className="px-4 py-2 bg-[#F47A35] hover:bg-[#F68C51] disabled:opacity-60 text-[#2D1A0E] font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <span className={`material-symbols-outlined text-[16px] ${saving ? 'animate-spin' : ''}`}>
                      {saving ? 'sync' : 'publish'}
                    </span>
                    {saving ? 'Publishing…' : 'Publish menu'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="px-4 py-2 bg-white hover:bg-[#F7EEDA] text-[#6B4A28] border border-[#EFDCB4] font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : dayHasPassed ? (
                <span
                  className="px-4 py-2 rounded-xl flex items-center gap-1.5 text-xs font-bold"
                  style={{background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--text-muted)'}}
                  title="This day has already been served. A menu can only be set for today or a future day."
                >
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  Already served
                </span>
              ) : (
                <button
                  onClick={startEditing}
                  className="px-4 py-2 bg-[#F47A35] hover:bg-[#F68C51] text-[#2D1A0E] font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  Edit {DAYS[dayIndex]} Menu
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {MEALS.map(meal => {
                const style = MEAL_STYLE[meal];
                const existing = cellFor(day, meal);
                const window = prettyWindow(windows[meal]);
                const title = meal.charAt(0) + meal.slice(1).toLowerCase();
                return (
                  <div
                    key={meal}
                    className="p-5 rounded-2xl space-y-3"
                    style={{border: `1px solid ${style.accent}33`, background: `${style.accent}0D`}}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="p-2 text-white rounded-xl" style={{background: style.accent}}>
                          <span className="material-symbols-outlined text-[20px]">{style.icon}</span>
                        </span>
                        <div>
                          <h4 className="font-extrabold text-base text-[#2D1A0E]">{title}</h4>
                          <p className="text-[11px] font-semibold" style={{color: style.accent}}>
                            {window || 'Serving window not set'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2" style={{borderTop: `1px solid ${style.accent}1A`}}>
                      {editing ? (
                        <div className="space-y-2">
                          <textarea
                            className="stitch-input"
                            rows={3}
                            placeholder="Idli, Sambar, Chutney"
                            aria-label={`${title} items`}
                            value={draft[meal]?.items || ''}
                            onChange={e => setDraft({...draft, [meal]: {...draft[meal], items: e.target.value}})}
                          />
                          <input
                            className="stitch-input"
                            placeholder="Note (optional)"
                            aria-label={`${title} note`}
                            value={draft[meal]?.notes || ''}
                            onChange={e => setDraft({...draft, [meal]: {...draft[meal], notes: e.target.value}})}
                          />
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-[#5C3D1E] leading-relaxed">
                            {existing && Array.isArray(existing.items) && existing.items.length > 0
                              ? existing.items.join(', ')
                              : <span className="text-[#9B7B52]">Not published for this day.</span>}
                          </p>
                          {existing?.notes && (
                            <p className="mt-1.5 text-xs font-medium text-[#9B7B52]">{existing.notes}</p>
                          )}
                          {existing?.updated_at && (
                            <p className="mt-2 text-[10.5px] font-semibold text-[#9B7B52]">
                              Updated {new Date(existing.updated_at).toLocaleString('en-IN')}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
