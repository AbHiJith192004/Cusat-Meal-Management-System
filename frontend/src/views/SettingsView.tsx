import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { superAdminApi } from '../services/api';
import { formatWindow, FALLBACK_WINDOWS, MEAL_ORDER, type MealKey } from '../utils/mealWindows';

/**
 * Serving windows, editable by the Super Admin.
 *
 * These have always been system settings the office could change; there was
 * simply no screen, so in practice they could only be changed with a hand
 * written request against /super-admin/settings and nobody did. Meanwhile the
 * app reads them everywhere -- the home screen, the meal planner, the mess
 * pass and the admin overview all print them, and the pass endpoint refuses a
 * request outside the window.
 *
 * Nothing here is validated only in the browser. The server checks the same
 * rules and rejects a batch that would leave any window unparseable, because
 * `GET /api/v1/meals` parses these on every student's home screen and a stored
 * "12.00" would take meal selection down for the hostel. The checks below
 * exist to answer faster, not to be the guard.
 */

const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner',
};

type Draft = Record<string, string>;

/** "12:00–14:30 IST" (what the API stores per key) -> "12:00". */
const keyFor = (meal: MealKey, edge: 'start' | 'end') => `meal_window_${meal}_${edge}`;

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const minutes = (v: string) => {
  const m = CLOCK.exec((v || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const SettingsView: React.FC = () => {
  const [stored, setStored] = useState<Draft>({});
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await superAdminApi.getSettings();
      const byKey: Draft = {};
      rows.forEach(r => { byKey[r.key] = r.value; });
      // A window with no row yet is not an error: the server falls back to its
      // own defaults, and those are what the app is really using, so that is
      // what the field should show.
      MEAL_ORDER.forEach(meal => {
        const fallback = FALLBACK_WINDOWS[meal].replace(' IST', '').split('–');
        if (!byKey[keyFor(meal, 'start')]) byKey[keyFor(meal, 'start')] = fallback[0];
        if (!byKey[keyFor(meal, 'end')]) byKey[keyFor(meal, 'end')] = fallback[1];
      });
      setStored(byKey);
      setDraft(byKey);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load the settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const set = (key: string, value: string) => {
    setDraft(d => ({ ...d, [key]: value }));
    setSaved(false);
    setSaveError(null);
  };

  /** Only the windows that actually moved are sent. */
  const changed = useMemo(
    () => Object.keys(draft).filter(k => k.startsWith('meal_window_') && draft[k] !== stored[k]),
    [draft, stored],
  );

  /** Per-meal complaint, or null. Mirrors what the server will say. */
  const problemFor = (meal: MealKey): string | null => {
    const start = draft[keyFor(meal, 'start')] ?? '';
    const end = draft[keyFor(meal, 'end')] ?? '';
    const s = minutes(start), e = minutes(end);
    if (s === null) return `Start time must look like 12:00. Got "${start}".`;
    if (e === null) return `End time must look like 14:30. Got "${end}".`;
    if (s >= e) return 'The end must be after the start.';
    return null;
  };

  const problems = MEAL_ORDER.map(m => [m, problemFor(m)] as const).filter(([, p]) => p);
  const canSave = changed.length > 0 && problems.length === 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await superAdminApi.updateSettings(changed.map(key => ({ key, value: draft[key].trim() })));
      setStored({ ...draft });
      setSaved(true);
    } catch (err: any) {
      setSaveError(err?.message || 'Could not save. Nothing was changed.');
    } finally {
      setSaving(false);
    }
  };

  const preview = (meal: MealKey) => {
    const s = draft[keyFor(meal, 'start')], e = draft[keyFor(meal, 'end')];
    return formatWindow(`${s}–${e}`) ?? '—';
  };

  return (
    <div
      className="flex-1 p-4 pb-28 lg:px-10 lg:pt-8 lg:pb-14 animate-fade-in"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-[820px] mx-auto space-y-6">
        <section className="bg-white p-5 rounded-2xl border border-[#EFDCB4] shadow-xs">
        <div className="flex items-start gap-2.5 mb-5">
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--orange-ink)' }}>
            schedule
          </span>
          <div>
            <h2 className="font-display text-[17px] font-bold" style={{ color: 'var(--text-dark)' }}>
              When each meal is served
            </h2>
            <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-body)' }}>
              These times appear on every student&rsquo;s home screen, meal schedule and mess pass.
              A pass will not be issued outside the window, so changing a time changes who can
              collect a meal and when. Times are IST, on a 24-hour clock.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-[13px] font-semibold" style={{ color: 'var(--text-muted)' }}>
            Loading the current times…
          </p>
        ) : loadError ? (
          <div className="flex flex-col items-start gap-2">
            <p
              className="text-[13px] font-bold rounded-lg px-3 py-2"
              style={{ color: 'var(--red)', background: '#FDECEA', border: '1px solid #F6C8C3' }}
            >
              {loadError}
            </p>
            <button onClick={() => void load()} className="btn-secondary">Try again</button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {MEAL_ORDER.map(meal => {
                const problem = problemFor(meal);
                const moved = draft[keyFor(meal, 'start')] !== stored[keyFor(meal, 'start')]
                  || draft[keyFor(meal, 'end')] !== stored[keyFor(meal, 'end')];
                return (
                  <div
                    key={meal}
                    className="rounded-xl p-4"
                    style={{
                      background: 'var(--orange-soft)',
                      border: `1px solid ${problem ? '#F6C8C3' : 'var(--orange-light)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2.5 gap-2">
                      <span
                        className="font-display text-[15px] font-bold"
                        style={{ color: 'var(--text-dark)' }}
                      >
                        {MEAL_LABEL[meal]}
                      </span>
                      <span
                        className="text-[12px] font-bold"
                        style={{ color: problem ? 'var(--red)' : 'var(--text-muted)' }}
                      >
                        {problem ? 'Check this' : preview(meal)}
                        {!problem && moved ? ' · unsaved' : ''}
                      </span>
                    </div>

                    <div className="flex items-end gap-3">
                      <label className="flex-1">
                        <span
                          className="block text-[12px] font-bold mb-1"
                          style={{ color: 'var(--text-dark)' }}
                        >
                          Starts
                        </span>
                        <input
                          type="time"
                          value={draft[keyFor(meal, 'start')] ?? ''}
                          onChange={e => set(keyFor(meal, 'start'), e.target.value)}
                          className="stitch-input w-full"
                          style={{ fontSize: '0.9rem' }}
                          aria-label={`${MEAL_LABEL[meal]} start time`}
                        />
                      </label>
                      <label className="flex-1">
                        <span
                          className="block text-[12px] font-bold mb-1"
                          style={{ color: 'var(--text-dark)' }}
                        >
                          Ends
                        </span>
                        <input
                          type="time"
                          value={draft[keyFor(meal, 'end')] ?? ''}
                          onChange={e => set(keyFor(meal, 'end'), e.target.value)}
                          className="stitch-input w-full"
                          style={{ fontSize: '0.9rem' }}
                          aria-label={`${MEAL_LABEL[meal]} end time`}
                        />
                      </label>
                    </div>

                    {problem && (
                      <p className="text-[12px] font-bold mt-2" style={{ color: 'var(--red)' }}>
                        {problem}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {saveError && (
              <p
                className="text-[12.5px] font-bold rounded-lg px-3 py-2 mt-4"
                style={{ color: 'var(--red)', background: '#FDECEA', border: '1px solid #F6C8C3' }}
              >
                {saveError}
              </p>
            )}

            {saved && changed.length === 0 && (
              <p
                className="text-[12.5px] font-bold rounded-lg px-3 py-2 mt-4"
                style={{ color: 'var(--green)', background: 'var(--green-light)', border: '1px solid #A9D6B1' }}
              >
                Saved. Students see the new times when their screen next loads.
              </p>
            )}

            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => void save()}
                disabled={!canSave}
                className={canSave ? 'btn-primary' : 'btn-inert'}
                style={{ padding: '11px 20px' }}
              >
                {saving
                  ? 'Saving…'
                  : changed.length === 0
                  ? 'No changes to save'
                  : `Save ${changed.length === 1 ? 'this change' : `these ${changed.length} changes`}`}
              </button>
              {changed.length > 0 && !saving && (
                <button
                  onClick={() => { setDraft(stored); setSaveError(null); setSaved(false); }}
                  className="btn-secondary"
                >
                  Discard
                </button>
              )}
            </div>
          </>
          )}
        </section>
      </div>
    </div>
  );
};
