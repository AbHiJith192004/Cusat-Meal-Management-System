import React, { useState } from 'react';
import { adminApi } from '../services/api';

/**
 * Declaring and cancelling a mess closure, for one day at a time.
 *
 * The server has had holidays since the beginning -- declaring one cascades
 * every selection for that day to NO_SERVICE, blocks the scanner, suppresses
 * the missed-meal fine, and drops the day out of the month's billing
 * denominator so nobody pays for food that was never cooked. None of it was
 * reachable: there was no screen, and no endpoint that listed a closure, so
 * the id needed to cancel one could only be found in the database by hand.
 *
 * This lives on the Weekly Menu screen because that is where an admin is
 * already standing on a particular date deciding what is being served. "This
 * day is off" is the same decision with nothing on the plate.
 */

export type ClosureScope = 'BREAKFAST' | 'LUNCH' | 'DINNER' | null;

export interface Closure {
  id: string;
  holiday_date: string;
  meal_type: ClosureScope;
  reason: string;
  declared_by: string;
  created_at: string | null;
}

const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER'] as const;

const titleCase = (meal: string) => meal.charAt(0) + meal.slice(1).toLowerCase();

/** "the whole day" / "Lunch", for sentences the admin has to read quickly. */
export const scopeLabel = (meal: ClosureScope) =>
  meal === null ? 'the whole day' : titleCase(meal);

interface Props {
  /** The day the Weekly Menu screen is showing. */
  dateIso: string;
  dayLabel: string;
  /** Closures already declared for this date, whole-day row included. */
  closures: Closure[];
  /** True once the day has been served; closing it then rewrites the bill. */
  dayHasPassed: boolean;
  onChanged: () => void | Promise<void>;
}

export const MessClosurePanel: React.FC<Props> = ({
  dateIso, dayLabel, closures, dayHasPassed, onChanged,
}) => {
  const [scope, setScope] = useState<ClosureScope>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const wholeDay = closures.find(c => c.meal_type === null);
  const closedMeals = new Set(closures.map(c => c.meal_type).filter(Boolean) as string[]);
  // A whole-day closure already covers every sitting, so once one exists the
  // only thing left to offer is cancelling it.
  const available: ClosureScope[] = wholeDay
    ? []
    : [null, ...MEALS.filter(m => !closedMeals.has(m))];

  const declare = async () => {
    const text = reason.trim();
    if (text.length < 3) {
      setError('Give a reason of at least 3 characters. Students are shown it.');
      return;
    }
    setBusy(true); setError('');
    try {
      await adminApi.declareHoliday(dateIso, scope, text);
      setReason('');
      setScope(null);
      await onChanged();
    } catch (e: any) {
      setError(e?.message || 'Could not close the mess for that day.');
    } finally { setBusy(false); }
  };

  const cancel = async (closure: Closure) => {
    if (!window.confirm(
      `Reopen ${scopeLabel(closure.meal_type)} on ${dayLabel}?\n\n` +
      'Every selection this closure changed goes back to what the student had '
      + 'chosen before it, and the day counts towards the bill again.'
    )) return;
    setBusy(true); setError('');
    try {
      await adminApi.cancelHoliday(closure.id);
      await onChanged();
    } catch (e: any) {
      setError(e?.message || 'Could not reopen the mess for that day.');
    } finally { setBusy(false); }
  };

  return (
    <div
      className="rounded-2xl border p-4 sm:p-5 space-y-4"
      style={wholeDay
        ? { background: '#FDECEA', borderColor: '#F6C8C3' }
        : { background: 'var(--card)', borderColor: 'var(--card-border)' }}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={wholeDay
            ? { background: '#FEE2E2', color: 'var(--red)' }
            : { background: '#FDF7EA', color: '#F47A35', border: '1px solid #E3CB9B' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {wholeDay ? 'no_meals' : 'event_busy'}
          </span>
        </span>
        <div className="min-w-0">
          <h4 className="font-extrabold text-sm" style={{ color: 'var(--text-dark)' }}>
            {wholeDay ? 'The mess is closed all day' : 'Mess closure'}
          </h4>
          <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {wholeDay
              ? 'Nothing is served, no pass scans, no missed-meal fines, and the day is left out of this month’s bill.'
              : 'Shut the kitchen for a day or a single sitting. Students see the reason, and the day stops counting towards the bill.'}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="px-3.5 py-3 rounded-xl text-xs font-bold"
           style={{ background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)' }}>
          {error}
        </p>
      )}

      {closures.length > 0 && (
        <ul className="space-y-2">
          {closures.map(closure => (
            <li
              key={closure.id}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl"
              style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
            >
              <div className="min-w-0">
                <p className="text-xs font-extrabold" style={{ color: 'var(--text-dark)' }}>
                  {closure.meal_type === null ? 'Closed all day' : `${titleCase(closure.meal_type)} closed`}
                  <span className="font-semibold" style={{ color: 'var(--text-body)' }}> &mdash; {closure.reason}</span>
                </p>
                <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Declared by {closure.declared_by}
                  {closure.created_at ? ` on ${new Date(closure.created_at).toLocaleDateString('en-IN')}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => cancel(closure)}
                disabled={busy}
                className="shrink-0 px-3 py-1.5 font-bold text-[11px] rounded-lg cursor-pointer disabled:opacity-60"
                style={{ background: 'var(--card)', color: 'var(--text-body)', border: '1px solid var(--card-border)' }}
              >
                Reopen
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 && (
        <div className="space-y-2.5 pt-1">
          {dayHasPassed && (
            <p className="text-[11px] font-bold px-3 py-2 rounded-lg"
               style={{ background: '#FDF7EA', border: '1px solid #E3CB9B', color: '#8A5A20' }}>
              This day has already been served. Closing it now rewrites what the
              month bills for it, so only do this if the kitchen really was shut.
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <select
              className="stitch-input sm:w-44"
              aria-label="What to close"
              value={scope ?? 'ALL'}
              onChange={e => setScope(e.target.value === 'ALL' ? null : e.target.value as ClosureScope)}
            >
              {available.map(option => (
                <option key={option ?? 'ALL'} value={option ?? 'ALL'}>
                  {option === null ? 'Whole day' : titleCase(option)}
                </option>
              ))}
            </select>
            <input
              className="stitch-input flex-1"
              placeholder="Reason, e.g. Onam holiday, kitchen maintenance"
              aria-label="Reason for closing the mess"
              maxLength={500}
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            <button
              type="button"
              onClick={declare}
              disabled={busy}
              className="px-4 py-2 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
              style={{ background: 'var(--red)', color: '#fff' }}
            >
              <span className={`material-symbols-outlined text-[16px] ${busy ? 'animate-spin' : ''}`}>
                {busy ? 'sync' : 'no_meals'}
              </span>
              {busy ? 'Saving…' : 'Close the mess'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
