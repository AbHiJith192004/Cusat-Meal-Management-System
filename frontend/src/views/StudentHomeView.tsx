import React, { useState, useEffect } from 'react';
import { mealApi } from '../services/api';
import {
  DosaCartoon,
  LunchCartoon,
  DinnerCartoon,
  BreakfastCartoon,
  MEAL_ACCENT,
} from '../components/FoodIllustrations';

interface StudentHomeViewProps {
  studentName: string;
  hostelName: string;
  onNavigate: (tab: any) => void;
}

type MealKey = 'breakfast' | 'lunch' | 'dinner';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  if (h < 20) return 'Good Evening';
  return 'Good Night';
}

function getCurrentMealType(): MealKey {
  const h = new Date().getHours();
  // Before 11am — including the small hours — the next meal is breakfast.
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  return 'dinner';
}

const MEAL_TIMES: Record<MealKey, string> = {
  breakfast: '7:30 AM – 9:30 AM',
  lunch: '12:30 PM – 2:00 PM',
  dinner: '7:30 PM – 9:00 PM',
};
const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};
const MEAL_FALLBACK: Record<MealKey, string> = {
  breakfast: 'Masala Dosa & Filter Coffee',
  lunch: 'Meals, Fish Curry, Poriyal, Curd',
  dinner: 'Chapati, Paneer Butter Masala, Dal, Rice',
};
const MEAL_ILLUSTRATION = {
  breakfast: BreakfastCartoon,
  lunch: LunchCartoon,
  dinner: DinnerCartoon,
} as const;

const MEAL_FILL: Record<MealKey, string> = {
  breakfast: 'var(--meal-breakfast)',
  lunch: 'var(--meal-lunch)',
  dinner: 'var(--meal-dinner)',
};

export const StudentHomeView: React.FC<StudentHomeViewProps> = ({ studentName, onNavigate }) => {
  const [meals, setMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMeal = getCurrentMealType();
  const firstName = studentName?.trim().split(' ')[0] || 'Student';

  useEffect(() => {
    mealApi
      .getMeals()
      .then(d => { if (d?.length) setMeals(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const todayPlan = meals[0];
  const itemsFor = (type: MealKey) => {
    const plan = todayPlan?.[type];
    if (plan?.items?.length) return plan.items.join(', ');
    return MEAL_FALLBACK[type];
  };

  const otherMeals = (['breakfast', 'lunch', 'dinner'] as MealKey[]).filter(m => m !== currentMeal);
  const HeroIllustration = currentMeal === 'breakfast' ? DosaCartoon : MEAL_ILLUSTRATION[currentMeal];

  return (
    <main className="page-container">
      {/* ── Greeting ─────────────────────────────────────────────── */}
      <div className="mb-5 lg:mb-7">
        <h1
          className="font-display text-[28px] lg:text-[30px] font-bold"
          style={{ color: 'var(--text-dark)' }}
        >
          {getGreeting()}, {firstName}!
        </h1>
        <p className="hidden lg:block text-sm font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>
          Here is what the mess is serving today.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5 lg:items-start">
        {/* ── Currently serving ──────────────────────────────────── */}
        <section className="stitch-card-hero lg:col-span-2">
          <p className="section-label">Currently Serving</p>

          <div className="flex items-start justify-between gap-4 mt-2">
            <div className="min-w-0 flex-1">
              <h2
                className="font-display text-[34px] lg:text-[32px] font-bold"
                style={{ color: 'var(--text-dark)' }}
              >
                {MEAL_LABELS[currentMeal]}
              </h2>

              <p
                className="text-[15px] lg:text-base font-semibold mt-1.5 mb-4 lg:mb-5"
                style={{ color: 'var(--text-body)' }}
              >
                {itemsFor(currentMeal)}
              </p>

              <p
                className="text-sm font-black whitespace-nowrap"
                style={{ color: 'var(--text-dark)', fontVariantNumeric: 'tabular-nums' }}
              >
                {MEAL_TIMES[currentMeal]}
              </p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Today&rsquo;s special
              </p>
            </div>

            <div className="shrink-0 float-gentle -mt-2 -mr-1">
              <HeroIllustration size={150} />
            </div>
          </div>

          <div
            className="flex items-center justify-end lg:justify-between gap-3 mt-4 pt-3.5"
            style={{ borderTop: '1px solid var(--line)' }}
          >
            <button onClick={() => onNavigate('calendar')} className="btn-link">
              View full menu
            </button>
            <button
              onClick={() => onNavigate('qr')}
              className="hidden lg:inline-flex btn-secondary"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
                confirmation_number
              </span>
              Mess pass
            </button>
          </div>
        </section>

        {/* ── Mess pass CTA ──────────────────────────────────────── */}
        {/* Mobile keeps the signature full-width pill; desktop turns it into a
            quiet card so the page does not shout. */}
        <button onClick={() => onNavigate('qr')} className="btn-primary w-full lg:hidden">
          Get mess pass
        </button>

        <aside className="hidden lg:block stitch-card p-5">
          <p className="section-label">Your pass</p>
          <p
            className="font-display text-[19px] font-bold mt-1.5"
            style={{ color: 'var(--text-dark)' }}
          >
            Ready to scan
          </p>
          <p className="text-[13px] font-semibold mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>
            A single-use QR valid for 60 seconds at the dining hall entrance.
          </p>
          <button onClick={() => onNavigate('qr')} className="btn-primary w-full">
            Open mess pass
          </button>

          <div className="mt-5 pt-4 flex flex-col gap-2.5" style={{ borderTop: '1px solid var(--line)' }}>
            <button
              onClick={() => onNavigate('calendar')}
              className="flex items-center gap-2.5 text-[13px] font-bold cursor-pointer text-left"
              style={{ background: 'none', border: 'none', color: 'var(--text-body)', padding: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>
                event_available
              </span>
              Opt out of a meal
            </button>
            <button
              onClick={() => onNavigate('alerts')}
              className="flex items-center gap-2.5 text-[13px] font-bold cursor-pointer text-left"
              style={{ background: 'none', border: 'none', color: 'var(--text-body)', padding: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>
                campaign
              </span>
              Mess announcements
            </button>
          </div>
        </aside>

        {/* ── Rest of the day ────────────────────────────────────── */}
        <section className="lg:col-span-3">
          <p className="hidden lg:block section-label mb-3">Also today</p>

          <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
            {loading
              ? [1, 2].map(n => (
                  <div
                    key={n}
                    className="h-[104px] rounded-2xl animate-pulse"
                    style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
                  />
                ))
              : otherMeals.map(meal => {
                  const Illustration = MEAL_ILLUSTRATION[meal];
                  return (
                    <button
                      key={meal}
                      onClick={() => onNavigate('calendar')}
                      className="stitch-meal-card flex items-center gap-4 text-left cursor-pointer w-full"
                      style={{ background: MEAL_FILL[meal] }}
                    >
                      <div className="shrink-0 float-gentle-alt">
                        <Illustration size={78} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="meal-dot" style={{ background: MEAL_ACCENT[meal] }} />
                          <h3
                            className="font-display text-[19px] font-bold"
                            style={{ color: 'var(--text-dark)' }}
                          >
                            {MEAL_LABELS[meal]}
                          </h3>
                        </div>
                        <p
                          className="text-xs font-bold mt-0.5"
                          style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
                        >
                          {MEAL_TIMES[meal]}
                        </p>
                        <p className="text-[13px] font-semibold mt-1" style={{ color: 'var(--text-body)' }}>
                          {itemsFor(meal)}
                        </p>
                      </div>

                      <span
                        className="material-symbols-outlined only-desktop shrink-0"
                        style={{ fontSize: 20, color: 'var(--text-light)' }}
                      >
                        chevron_right
                      </span>
                    </button>
                  );
                })}
          </div>
        </section>
      </div>
    </main>
  );
};
