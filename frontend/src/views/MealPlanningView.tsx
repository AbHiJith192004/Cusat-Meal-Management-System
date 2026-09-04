import React, { useState, useEffect } from 'react';
import { mealApi } from '../services/api';
import {
  BreakfastCartoon,
  LunchCartoon,
  DinnerCartoon,
  MEAL_ACCENT,
} from '../components/FoodIllustrations';

type MealKey = 'breakfast' | 'lunch' | 'dinner';

const MENU_ITEMS: Record<MealKey, string> = {
  breakfast: 'Chapati / Malabar Porotta, Egg Roast, Coconut Chutney, Tea/Coffee',
  lunch: 'Kerala Rice Meals with Fish Curry / Chicken Curry, Vegetable Stir-fry, Buttermilk',
  dinner: 'Chapati / Malabar Porotta, Chicken Curry / Paneer Masala, Mixed Veg Salad',
};
const MEAL_TIMES: Record<MealKey, string> = {
  breakfast: '7:30 AM – 9:00 AM',
  lunch: '12:30 PM – 2:00 PM',
  dinner: '7:30 PM – 9:00 PM',
};
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
  const isLocked = selectedDate <= todayStr;

  const handleToggle = async (meal: MealKey) => {
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
    }
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

  return (
    <main className="page-container">
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
              const menuText = activePlan[meal]?.items?.join(', ') || MENU_ITEMS[meal];

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
                        {MEAL_TIMES[meal]}
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

                    {isLocked ? (
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
