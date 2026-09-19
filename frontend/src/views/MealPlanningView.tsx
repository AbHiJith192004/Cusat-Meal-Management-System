import React, { useState, useEffect } from 'react';
import { mealApi } from '../services/api';
import {
  BreakfastCartoon,
  LunchCartoon,
  DinnerCartoon,
  MEAL_ACCENT,
} from '../components/FoodIllustrations';

type MealKey = 'breakfast' | 'lunch' | 'dinner';

const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};
const MEAL_FILL: Record<MealKey, string> = {
  breakfast: 'var(--meal-breakfast)',
  lunch: 'var(--meal-lunch)',
  dinner: 'var(--meal-dinner)',
};
const MEAL_ILL: Record<MealKey, React.FC<{ size?: number }>> = {
  breakfast: BreakfastCartoon,
  lunch: LunchCartoon,
  dinner: DinnerCartoon,
};

const MEALS: MealKey[] = ['breakfast', 'lunch', 'dinner'];

export const MealPlanningView: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [mealPlans, setMealPlans] = useState<any[]>([]);
  // WHICH control is waiting on the server, not WHETHER one is. A single
  // shared boolean meant that saving one meal put every other meal into the
  // locked state as well: all three toggles vanished, were replaced by the
  // grey "Locked" chip, and came back when the request finished. Toggling
  // breakfast made lunch and dinner flicker for no reason.
  const [savingMeal, setSavingMeal] = useState<MealKey | null>(null);
  const [savingFullDay, setSavingFullDay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    mealApi
      .getMeals()
      .then(d => {
        setMealPlans(d);
        if (d?.length) setSelectedDate(d[0].meal_date);
      })
      .catch(e => setErrorMsg(e.message))
      .finally(() => setLoading(false));
  }, []);

  const activePlan =
    mealPlans.find(p => p.meal_date === selectedDate) ||
    mealPlans[0] || {
      meal_date: selectedDate,
      breakfast: { status: 'CONFIRMED' },
      lunch: { status: 'CONFIRMED' },
      dinner: { status: 'CONFIRMED' },
    };

  const todayStr = new Date().toISOString().split('T')[0];
  // isLocked means the choice genuinely cannot be changed -- the cutoff has
  // passed, or the day has not loaded. A request being in flight is not that,
  // and must not be conflated with it.
  const isLocked = loading || !activePlan.cutoff_at
    || Date.now() >= new Date(activePlan.cutoff_at).getTime();
  // A full-day save rewrites all three rows and then reloads them, so while it
  // runs the individual toggles really do have to hold still. A single meal's
  // save does not touch the other two, so they stay live.
  const wholeDayBusy = savingFullDay;

  const handleToggle = async (meal: MealKey) => {
    if (isLocked || wholeDayBusy || savingMeal === meal) return;
    setSavingMeal(meal);
    const cur = activePlan[meal]?.status || 'CONFIRMED';
    const next = cur === 'CONFIRMED' ? 'SKIPPED' : 'CONFIRMED';
    try {
      setErrorMsg(null);
      await mealApi.updateMealSelection(selectedDate, meal.toUpperCase(), next);
      setMealPlans(prev =>
        prev.map(p =>
          p.meal_date === selectedDate ? { ...p, [meal]: { ...p[meal], status: next } } : p
        )
      );
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not save. The cutoff may have passed.');
    } finally { setSavingMeal(null); }
  };

  const handleFullDay = async () => {
    if (isLocked || wholeDayBusy || savingMeal) return;
    setSavingFullDay(true);
    const status = MEALS.every(m => activePlan[m]?.status === 'SKIPPED') ? 'CONFIRMED' : 'SKIPPED';
    try {
      await mealApi.updateFullDay(selectedDate, status);
      setMealPlans(await mealApi.getMeals());
      setErrorMsg(null);
    } catch (e: any) { setErrorMsg(e.message); }
    finally { setSavingFullDay(false); }
  };

  const dateChips =
    mealPlans.length > 0
      ? mealPlans.slice(0, 7).map(p => p.meal_date)
      : Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() + i);
          return d.toISOString().split('T')[0];
        });

  const confirmedCount = MEALS.filter(
    m => (activePlan[m]?.status || 'CONFIRMED') === 'CONFIRMED'
  ).length;

  if (!loading && errorMsg && mealPlans.length === 0) {
    return (
      <main className="page-container">
        <div role="alert" className="rounded-xl border border-[#F6C8C3] bg-[#FDECEA] p-5 text-sm font-bold" style={{ color: 'var(--red)' }}>
          {errorMsg} Meal choices are hidden because the current server state could not be loaded.
        </div>
        <button className="btn-secondary mt-4" type="button" onClick={() => window.location.reload()}>Retry</button>
      </main>
    );
  }

  const isFullDayCut = MEALS.every(m => (activePlan[m]?.status || 'CONFIRMED') === 'SKIPPED');
  const noService = MEALS.some(m => activePlan[m]?.status === 'NO_SERVICE');

  return (
    <main className="page-container">
      {/* ── Monthly Mess Cut Policy Banner ──────────────────────────── */}
      <div
        className="p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 transition-all"
        style={{ background: 'var(--card)', borderColor: 'var(--line)', boxShadow: 'var(--card-shadow)' }}
      >
        <div className="flex items-start sm:items-center gap-3">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#FDF7EA] border border-[#E3CB9B] text-[#F47A35]">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>event_busy</span>
          </span>
          <div>
            <span className="font-extrabold text-xs sm:text-sm block" style={{ color: 'var(--text-dark)' }}>
              Monthly Mess Cut Policy
            </span>
            <span className="text-[11px] sm:text-xs font-semibold block mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Note: A student can take up to a maximum of <strong>10 mess cuts per month</strong>.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-xl border bg-[#FDF7EA] border-[#E3CB9B]">
          <span className="text-[10px] font-black uppercase text-[#9B7B52]">Policy:</span>
          <span className="text-xs font-black text-[#F47A35] font-mono">Max 10 Cuts / Month</span>
        </div>
      </div>

      {errorMsg && (
        <div
          className="mb-4 px-3.5 py-3 rounded-xl text-xs font-bold flex items-start gap-2"
          style={{ background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)' }}
          role="alert"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>error</span>
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      {/* ── Date selector ──────────────────────────────────────────── */}
      <div className="flex gap-2.5 pb-4 overflow-x-auto hide-scrollbar snap-x lg:flex-wrap lg:overflow-visible lg:pb-5">
        {dateChips.map(date => {
          const isActive = date === selectedDate;
          const d = new Date(date);
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
          const dayNum = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`date-chip snap-center ${isActive ? 'date-chip-active' : ''}`}
              aria-pressed={isActive}
            >
              <span
                className="date-chip-label text-[13px] font-black"
                style={{ fontFamily: 'Nunito, sans-serif' }}
              >
                {dayNum}, {dayName}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Full-Day Mess Cut Master Toggle Card ───────────────────── */}
      <div
        className="p-4 rounded-2xl border mb-4 flex items-center justify-between gap-3 sm:gap-4 transition-all shadow-xs"
        style={{
          background: isFullDayCut ? '#FFF0F0' : 'var(--card)',
          borderColor: isFullDayCut ? '#F87171' : 'var(--line)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
              isFullDayCut ? 'bg-[#FEE2E2] text-[#DC2626]' : 'bg-[#FDF7EA] text-[#F47A35] border border-[#E3CB9B]'
            }`}
          >
            {isFullDayCut ? '🚫' : '🍽️'}
          </span>
          <div className="min-w-0">
            <h4
              className="font-display text-[15px] font-extrabold flex flex-wrap items-center gap-2"
              style={{ color: 'var(--text-dark)' }}
            >
              <span>Full-Day Mess Cut</span>
              {isFullDayCut && (
                <span className="px-2 py-0.5 bg-[#DC2626] text-white text-[10px] font-black rounded-full uppercase tracking-wider">
                  ALL MEALS SKIPPED
                </span>
              )}
            </h4>
            <p className="text-xs font-semibold truncate sm:whitespace-normal" style={{ color: 'var(--text-muted)' }}>
              {noService
                ? 'The mess is not serving on this day, so there is nothing to opt out of.'
                : isFullDayCut
                ? 'Opted out of Breakfast, Lunch, and Dinner for this entire day.'
                : 'Toggle ON to take a full-day mess cut (opts out of Breakfast, Lunch, and Dinner at once).'}
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {savingFullDay ? (
            <span className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--text-muted)' }} role="status">
              <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
              Saving…
            </span>
          ) : isLocked || noService ? (
            <span className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined text-[16px]">lock</span>
              Locked
            </span>
          ) : (
            <label className="stitch-toggle" title={isFullDayCut ? 'Cancel Full-Day Mess Cut' : 'Take Full-Day Mess Cut'}>
              <input
                type="checkbox"
                checked={isFullDayCut}
                disabled={Boolean(savingMeal)}
                onChange={handleFullDay}
                aria-label="Full-Day Mess Cut Toggle"
              />
              <div className="stitch-toggle-track" />
              <div className="stitch-toggle-thumb" />
            </label>
          )}
        </div>
      </div>

      {/* ── Day summary (desktop) ──────────────────────────────────── */}
      <div className="hidden lg:flex items-center justify-between mb-4">
        <p className="section-label">
          {new Date(selectedDate).toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <p className="text-[13px] font-bold" style={{ color: 'var(--text-muted)' }}>
          {isLocked ? (
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock</span>
              Locked — the 9 PM cutoff has passed
            </span>
          ) : (
            `${confirmedCount} of 3 meals confirmed`
          )}
        </p>
      </div>

      {/* ── Meal cards ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {loading
          ? MEALS.map(m => (
              <div
                key={m}
                className="h-[188px] rounded-2xl animate-pulse"
                style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
              />
            ))
          : MEALS.map(meal => {
              const Ill = MEAL_ILL[meal];
              const confirmed = (activePlan[meal]?.status || 'CONFIRMED') === 'CONFIRMED';
              const menuText = activePlan[meal]?.items?.join(', ') || 'Menu details have not been published.';

              return (
                <section
                  key={meal}
                  className="stitch-meal-card flex flex-col"
                  style={{ background: MEAL_FILL[meal], opacity: confirmed ? 1 : 0.62 }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="meal-dot" style={{ background: MEAL_ACCENT[meal] }} />
                        <h3
                          className="font-display text-[21px] font-bold"
                          style={{ color: 'var(--text-dark)' }}
                        >
                          {MEAL_LABELS[meal]}
                        </h3>
                      </div>
                      <p
                        className="text-xs font-bold mt-1"
                        style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {activePlan[meal]?.time_window || 'Serving window unavailable'}
                      </p>
                    </div>
                    <div className="shrink-0 float-gentle-alt">
                      <Ill size={78} />
                    </div>
                  </div>

                  <p
                    className="text-[13px] font-semibold mt-2.5 flex-1"
                    style={{ color: 'var(--text-body)' }}
                  >
                    {menuText}
                  </p>

                  <div
                    className="flex items-center justify-between gap-2 mt-3.5 pt-3"
                    style={{ borderTop: '1px solid rgba(120,80,30,0.12)' }}
                  >
                    <span
                      className="text-[13px] font-black"
                      style={{
                        color: confirmed ? 'var(--text-dark)' : 'var(--text-muted)',
                        fontFamily: 'Nunito, sans-serif',
                      }}
                    >
                      {confirmed ? "I'm eating" : 'Skipping'}
                    </span>

                    {savingMeal === meal ? (
                      <span
                        className="text-[11px] font-bold flex items-center gap-1"
                        style={{ color: 'var(--text-muted)' }}
                        role="status"
                      >
                        <span className="material-symbols-outlined animate-spin" style={{ fontSize: 15 }}>
                          progress_activity
                        </span>
                        Saving…
                      </span>
                    ) : isLocked ? (
                      <span
                        className="text-[11px] font-bold flex items-center gap-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>lock</span>
                        Locked
                      </span>
                    ) : (
                      <label className="stitch-toggle" title={confirmed ? 'Opt out' : 'Opt in'}>
                        <input
                          type="checkbox"
                          checked={confirmed}
                          disabled={wholeDayBusy || activePlan[meal]?.status === "NO_SERVICE"}
                          onChange={() => handleToggle(meal)}
                          aria-label={`${MEAL_LABELS[meal]} — ${confirmed ? 'eating' : 'skipping'}`}
                        />
                        <div className="stitch-toggle-track" />
                        <div className="stitch-toggle-thumb" />
                      </label>
                    )}
                  </div>
                </section>
              );
            })}
      </div>

      {/* Cutoff note — mobile only; desktop shows it in the summary row */}
      {!isLocked && (
        <p
          className="lg:hidden text-[11px] font-semibold text-center mt-4"
          style={{ color: 'var(--text-muted)' }}
        >
          Opt-outs close at 9:00 PM the night before.
        </p>
      )}
    </main>
  );
};
