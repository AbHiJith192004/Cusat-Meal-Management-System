import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { superAdminApi } from '../services/api';
import { formatWindow, FALLBACK_WEEKDAY, FALLBACK_WEEKEND, MEAL_ORDER, type MealKey } from '../utils/mealWindows';

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

/**
 * The rules that are not times of day.
 *
 * Every key here is one the application actually reads at runtime -- checked,
 * not assumed, because a field wired to nothing is worse than no field.
 */
interface RuleField {
  key: string;
  label: string;
  help: string;
  kind: 'time' | 'int' | 'money';
  min?: number;
  max?: number;
  /** Rendered before the input, e.g. the rupee sign. */
  prefix?: string;
  suffix?: string;
}

const RULE_FIELDS: RuleField[] = [
  {
    key: 'selection_cutoff_time',
    label: 'Opt-out cutoff',
    help: 'After this time a student can no longer change the day below, because the kitchen has already bought for it.',
    kind: 'time',
  },
  {
    key: 'selection_cutoff_advance_days',
    label: 'Days ahead the cutoff applies',
    help: '1 means the cutoff for tomorrow is tonight. 0 would close a day only once it has already begun.',
    kind: 'int',
    min: 0,
    max: 7,
    suffix: 'days',
  },
  {
    key: 'max_monthly_mess_cuts',
    label: 'Mess cuts allowed per month',
    help: 'A day only counts as a mess cut when all three meals are opted out. 0 suspends mess cuts entirely.',
    kind: 'int',
    min: 0,
    max: 31,
    suffix: 'per month',
  },
  {
    key: 'qr_validity_seconds',
    label: 'How long a meal pass stays valid',
    help: 'The pass expires after this and cannot be reused. Raise it if the queue is slow; keep it short, because nobody checks a face at the door and a longer pass is a longer window to forward a screenshot to a friend.',
    kind: 'int',
    min: 15,
    max: 120,
    suffix: 'seconds',
  },
  {
    key: 'fine_amount',
    label: 'Missed-meal fine',
    help: 'Charged by the nightly reconciliation when a student opted in and did not come. Applies from the next run, not retrospectively.',
    kind: 'money',
    prefix: '\u20b9',
  },
];

/** Mirrors the backend's DEFAULT_SETTINGS for these keys. */
const RULE_DEFAULTS: Array<[string, string]> = [
  ['selection_cutoff_time', '21:00'],
  ['selection_cutoff_advance_days', '1'],
  ['max_monthly_mess_cuts', '10'],
  ['qr_validity_seconds', '60'],
  ['fine_amount', '30.00'],
];

type Draft = Record<string, string>;

/**
 * Weekdays and weekends keep separate windows, held in separate settings keys
 * that differ only by a `_weekend` suffix. The backend's window_keys() decides
 * which pair applies to a given date; this mirrors the naming.
 */
type Schedule = 'weekday' | 'weekend';

const SCHEDULES: Array<{ id: Schedule; title: string; blurb: string }> = [
  { id: 'weekday', title: 'Monday to Friday', blurb: 'The ordinary working week.' },
  { id: 'weekend', title: 'Saturday and Sunday', blurb: 'The mess starts later at weekends.' },
];

const keyFor = (meal: MealKey, edge: 'start' | 'end', when: Schedule = 'weekday') =>
  `meal_window_${meal}_${edge}${when === 'weekend' ? '_weekend' : ''}`;

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
      SCHEDULES.forEach(({ id }) => {
        const defaults = id === 'weekend' ? FALLBACK_WEEKEND : FALLBACK_WEEKDAY;
        MEAL_ORDER.forEach(meal => {
          const [from, to] = defaults[meal].replace(' IST', '').split('–');
          if (!byKey[keyFor(meal, 'start', id)]) byKey[keyFor(meal, 'start', id)] = from;
          if (!byKey[keyFor(meal, 'end', id)]) byKey[keyFor(meal, 'end', id)] = to;
        });
      });
      // Same reasoning for the rules: these mirror the server's own
      // DEFAULT_SETTINGS, which is what it uses when the row is missing.
      RULE_DEFAULTS.forEach(([key, value]) => {
        if (byKey[key] === undefined) byKey[key] = value;
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

  /** Only the settings that actually moved are sent. */
  const EDITABLE = useMemo(
    () => [
      ...SCHEDULES.flatMap(({ id }) =>
        MEAL_ORDER.flatMap(m => [keyFor(m, 'start', id), keyFor(m, 'end', id)])),
      ...RULE_FIELDS.map(f => f.key),
    ],
    [],
  );
  const changed = useMemo(
    () => EDITABLE.filter(k => draft[k] !== undefined && draft[k] !== stored[k]),
    [EDITABLE, draft, stored],
  );

  /** Per-meal complaint for one schedule, or null. Mirrors the server. */
  const problemFor = (meal: MealKey, when: Schedule = 'weekday'): string | null => {
    const start = draft[keyFor(meal, 'start', when)] ?? '';
    const end = draft[keyFor(meal, 'end', when)] ?? '';
    const s = minutes(start), e = minutes(end);
    if (s === null) return `Start time must look like 12:00. Got "${start}".`;
    if (e === null) return `End time must look like 14:30. Got "${end}".`;
    if (s >= e) return 'The end must be after the start.';
    return null;
  };

  /** Same rules the server enforces, answered without a round trip. */
  const ruleProblem = (field: RuleField): string | null => {
    const raw = (draft[field.key] ?? '').trim();
    if (field.kind === 'time') {
      return minutes(raw) === null ? 'Must be a time like 21:00.' : null;
    }
    if (raw === '') return 'Cannot be empty.';
    if (field.kind === 'int') {
      if (!/^\d+$/.test(raw)) return 'Must be a whole number.';
      const n = Number(raw);
      if (field.min !== undefined && n < field.min) return `Cannot be below ${field.min}.`;
      if (field.max !== undefined && n > field.max) return `Cannot be above ${field.max}.`;
      return null;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 'Must be an amount like 30.00.';
    return null;
  };

  const problems = [
    ...SCHEDULES.flatMap(({ id }) => MEAL_ORDER.map(m => problemFor(m, id))),
    ...RULE_FIELDS.map(f => ruleProblem(f)),
  ].filter(Boolean);
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

  const preview = (meal: MealKey, when: Schedule = 'weekday') => {
    const s = draft[keyFor(meal, 'start', when)], e = draft[keyFor(meal, 'end', when)];
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
            {SCHEDULES.map(({ id, title, blurb }) => (
              <div key={id} className="mb-5 last:mb-0">
                <div className="flex items-baseline gap-2 mb-2">
                  <h3 className="font-display text-[15px] font-bold" style={{ color: 'var(--text-dark)' }}>
                    {title}
                  </h3>
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {blurb}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {MEAL_ORDER.map(meal => {
                    const problem = problemFor(meal, id);
                    const moved = draft[keyFor(meal, 'start', id)] !== stored[keyFor(meal, 'start', id)]
                      || draft[keyFor(meal, 'end', id)] !== stored[keyFor(meal, 'end', id)];
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
                            {problem ? 'Check this' : preview(meal, id)}
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
                              value={draft[keyFor(meal, 'start', id)] ?? ''}
                              onChange={e => set(keyFor(meal, 'start', id), e.target.value)}
                              className="stitch-input w-full"
                              style={{ fontSize: '0.9rem' }}
                              aria-label={`${MEAL_LABEL[meal]} start time, ${title}`}
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
                              value={draft[keyFor(meal, 'end', id)] ?? ''}
                              onChange={e => set(keyFor(meal, 'end', id), e.target.value)}
                              className="stitch-input w-full"
                              style={{ fontSize: '0.9rem' }}
                              aria-label={`${MEAL_LABEL[meal]} end time, ${title}`}
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
              </div>
            ))}

            {/* ── Rules ─────────────────────────────────────────────── */}
            <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--card-border)' }}>
              <div className="flex items-start gap-2.5 mb-4">
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--orange-ink)' }}>
                  rule
                </span>
                <div>
                  <h2 className="font-display text-[17px] font-bold" style={{ color: 'var(--text-dark)' }}>
                    Opt-outs, mess cuts and fines
                  </h2>
                  <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-body)' }}>
                    These decide when a student can still change their mind, how many days they may
                    skip, and what a missed meal costs. Changes apply from the next calculation;
                    bills already published are not recalculated.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {RULE_FIELDS.map(field => {
                  const problem = ruleProblem(field);
                  const moved = draft[field.key] !== stored[field.key];
                  return (
                    <div
                      key={field.key}
                      className="rounded-xl p-4"
                      style={{
                        background: 'var(--orange-soft)',
                        border: `1px solid ${problem ? '#F6C8C3' : 'var(--orange-light)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label
                          htmlFor={`setting-${field.key}`}
                          className="font-display text-[15px] font-bold"
                          style={{ color: 'var(--text-dark)' }}
                        >
                          {field.label}
                        </label>
                        {moved && !problem && (
                          <span className="text-[12px] font-bold" style={{ color: 'var(--text-muted)' }}>
                            unsaved
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] mb-2.5" style={{ color: 'var(--text-body)' }}>
                        {field.help}
                      </p>

                      <div className="flex items-center gap-2">
                        {field.prefix && (
                          <span className="text-[15px] font-bold" style={{ color: 'var(--text-dark)' }}>
                            {field.prefix}
                          </span>
                        )}
                        <input
                          id={`setting-${field.key}`}
                          type={field.kind === 'time' ? 'time' : 'text'}
                          inputMode={field.kind === 'time' ? undefined : 'decimal'}
                          value={draft[field.key] ?? ''}
                          onChange={e => set(field.key, e.target.value)}
                          className="stitch-input"
                          style={{ fontSize: '0.9rem', maxWidth: field.kind === 'time' ? 160 : 130 }}
                        />
                        {field.suffix && (
                          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                            {field.suffix}
                          </span>
                        )}
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
