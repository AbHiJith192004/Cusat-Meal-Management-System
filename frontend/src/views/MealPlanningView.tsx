import React, { useState, useEffect } from 'react';
import { mealApi, authApi } from '../services/api';

export const MealPlanningView: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [mealPlans, setMealPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedMeals, setExpandedMeals] = useState<Record<string, boolean>>({
    breakfast: true,
    lunch: false,
    dinner: false,
  });

  const fetchMeals = async () => {
    setLoading(true);
    try {
      const data = await mealApi.getMeals();
      setMealPlans(data);
      if (data && data.length > 0) {
        setSelectedDate(data[0].meal_date);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch meal schedule.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeals();
  }, []);

  const activePlan = mealPlans.find((plan) => plan.meal_date === selectedDate) || mealPlans[0] || {
    meal_date: selectedDate,
    breakfast: { status: 'CONFIRMED' },
    lunch: { status: 'CONFIRMED' },
    dinner: { status: 'CONFIRMED' },
  };

  const isBreakfastConfirmed = (activePlan?.breakfast?.status || 'CONFIRMED') === 'CONFIRMED';
  const isLunchConfirmed = (activePlan?.lunch?.status || 'CONFIRMED') === 'CONFIRMED';
  const isDinnerConfirmed = (activePlan?.dinner?.status || 'CONFIRMED') === 'CONFIRMED';
  const isFullDayConfirmed = isBreakfastConfirmed && isLunchConfirmed && isDinnerConfirmed;
  const isFullDaySkipped = !isBreakfastConfirmed && !isLunchConfirmed && !isDinnerConfirmed;

  const handleToggleFullDayMessCut = async () => {
    const nextStatus = isFullDaySkipped ? 'CONFIRMED' : 'SKIPPED';

    try {
      setErrorMsg(null);
      await Promise.all([
        mealApi.updateMealSelection(selectedDate, 'BREAKFAST', nextStatus),
        mealApi.updateMealSelection(selectedDate, 'LUNCH', nextStatus),
        mealApi.updateMealSelection(selectedDate, 'DINNER', nextStatus),
      ]);

      setMealPlans((prev) =>
        prev.map((plan) =>
          plan.meal_date === selectedDate
            ? {
                ...plan,
                breakfast: { ...plan.breakfast, status: nextStatus },
                lunch: { ...plan.lunch, status: nextStatus },
                dinner: { ...plan.dinner, status: nextStatus },
              }
            : plan
        )
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update full day mess cut.');
    }
  };

  const handleToggleMeal = async (mealType: 'breakfast' | 'lunch' | 'dinner') => {
    const currentStatus = activePlan[mealType]?.status || 'CONFIRMED';
    const nextStatus = currentStatus === 'CONFIRMED' ? 'SKIPPED' : 'CONFIRMED';

    // If currently full day skipped, toggling 1 meal to CONFIRMED leaves 2 meals SKIPPED (invalid)
    // In that case, switch to single meal opt-out of the OTHER skipped meals or confirm all.
    if (isFullDaySkipped && nextStatus === 'CONFIRMED') {
      try {
        setErrorMsg(null);
        // Confirm all 3 meals (Opt-In All)
        await Promise.all([
          mealApi.updateMealSelection(selectedDate, 'BREAKFAST', 'CONFIRMED'),
          mealApi.updateMealSelection(selectedDate, 'LUNCH', 'CONFIRMED'),
          mealApi.updateMealSelection(selectedDate, 'DINNER', 'CONFIRMED'),
        ]);
        setMealPlans((prev) =>
          prev.map((plan) =>
            plan.meal_date === selectedDate
              ? {
                  ...plan,
                  breakfast: { ...plan.breakfast, status: 'CONFIRMED' },
                  lunch: { ...plan.lunch, status: 'CONFIRMED' },
                  dinner: { ...plan.dinner, status: 'CONFIRMED' },
                }
              : plan
          )
        );
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to update meal selection.');
      }
      return;
    }

    if (nextStatus === 'SKIPPED') {
      const otherMealsSkipped = ['breakfast', 'lunch', 'dinner'].filter(
        (m) => m !== mealType && activePlan[m]?.status === 'SKIPPED'
      );
      if (otherMealsSkipped.length === 1) {
        setErrorMsg('Invalid selection. You can either opt out of 1 single meal (no fine, pays full day) OR opt out of the entire day (3 meals) for a Full Day Mess Cut.');
        return;
      }
    }

    try {
      setErrorMsg(null);
      await mealApi.updateMealSelection(selectedDate, mealType.toUpperCase(), nextStatus);
      // Optimistic update
      setMealPlans((prev) =>
        prev.map((plan) =>
          plan.meal_date === selectedDate
            ? {
                ...plan,
                [mealType]: { ...plan[mealType], status: nextStatus },
              }
            : plan
        )
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update selection (Cutoff, Mess Cut limit, or Holiday locked).');
    }
  };

  const toggleExpand = (mealKey: string) => {
    setExpandedMeals((prev) => ({
      ...prev,
      [mealKey]: !prev[mealKey],
    }));
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const isLockedDate = selectedDate <= todayStr;

  return (
    <main className="w-full max-w-[768px] mx-auto px-4 pt-6 pb-28 md:pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[24px] md:text-[30px] font-bold text-[#151c27]">Meal Planning</h1>
        <span className="text-xs font-semibold bg-[#2563eb]/10 text-[#2563eb] px-3 py-1 rounded-full border border-[#2563eb]/20">
          Cutoff: 9:00 PM (Previous Day)
        </span>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-[#ffdad6] text-[#93000a] rounded-xl text-sm font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined">warning</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Date Scroller */}
      <div className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar mb-6 snap-x">
        {mealPlans.map((plan) => {
          const isSelected = plan.meal_date === selectedDate;
          const dateObj = new Date(plan.meal_date);
          const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
          const dayNum = dateObj.getDate();

          return (
            <button
              key={plan.meal_date}
              onClick={() => setSelectedDate(plan.meal_date)}
              className={`flex flex-col items-center justify-center min-w-[64px] h-[80px] rounded-lg transition-all snap-center shrink-0 cursor-pointer ${
                isSelected
                  ? 'bg-[#004ac6] text-white shadow-sm font-semibold'
                  : 'bg-[#ffffff] border border-[#c3c6d7] text-[#151c27] hover:bg-[#f0f3ff]'
              }`}
            >
              <span className={`text-[12px] uppercase font-semibold mb-1 ${isSelected ? 'text-white' : 'text-[#434655]'}`}>
                {dayName}
              </span>
              <span className="text-[20px] font-bold">{dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* Full Day Toggle Banner at Top */}
      <div className="bg-[#2563eb]/10 border border-[#2563eb]/30 rounded-[16px] p-4 mb-5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#2563eb] text-white flex items-center justify-center shadow-xs">
            <span className="material-symbols-outlined text-[24px]">{isLockedDate ? 'lock' : 'event_available'}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#151c27]">
                {isLockedDate ? 'Selection Finalized' : 'Opt-Out & Mess Cut Rules'}
              </h3>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isFullDayConfirmed 
                  ? 'bg-[#006c49]/15 text-[#006c49]' 
                  : isFullDaySkipped 
                  ? 'bg-[#ba1a1a]/15 text-[#ba1a1a]' 
                  : 'bg-[#2563eb]/15 text-[#2563eb]'
              }`}>
                {isFullDayConfirmed ? 'Eating All Day' : isFullDaySkipped ? 'Full Day Mess Cut' : 'Single Meal Opt-Out'}
              </span>
            </div>
            <p className="text-xs text-[#434655] mt-0.5">
              {isLockedDate
                ? "Today's meal selections were finalized yesterday at 9:00 PM cutoff."
                : 'Opt out of 1 meal (no fine, pays full day) OR opt out of the entire day (Mess Cut, max 10/month).'}
            </p>
          </div>
        </div>

        {!isLockedDate ? (
          <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3" title="Toggle Full Day Mess Cut (All 3 Meals)">
            <input
              type="checkbox"
              checked={isFullDaySkipped}
              onChange={handleToggleFullDayMessCut}
              className="sr-only peer"
            />
            <div className="w-12 h-7 bg-[#c3c6d7] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#c3c6d7] after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#ba1a1a]"></div>
          </label>
        ) : (
          <span className="px-3 py-1 bg-[#737686]/10 text-[#434655] border border-[#c3c6d7] text-xs font-semibold rounded-full flex items-center gap-1 shrink-0 ml-3">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            Locked
          </span>
        )}
      </div>

      {/* Meal Cards List */}
      <div className="flex flex-col gap-4">
        {(['breakfast', 'lunch', 'dinner'] as const).map((mealKey) => {
          const mealInfo = activePlan[mealKey] || { status: 'CONFIRMED' };
          const isConfirmed = mealInfo.status === 'CONFIRMED';

          return (
            <div
              key={mealKey}
              className={`bg-[#ffffff] rounded-[16px] border border-[#c3c6d7] shadow-xs p-4 transition-opacity ${
                !isConfirmed ? 'opacity-80' : ''
              }`}
            >
              <div
                className="flex items-center justify-between mb-2 cursor-pointer select-none"
                onClick={() => toggleExpand(mealKey)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#dce2f3] flex items-center justify-center text-[#004ac6]">
                    <span className="material-symbols-outlined">
                      {mealKey === 'breakfast' ? 'free_breakfast' : mealKey === 'lunch' ? 'lunch_dining' : 'dinner_dining'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-[20px] font-semibold text-[#151c27] capitalize">{mealKey}</h3>
                    <p className="text-[14px] text-[#434655]">
                      {mealKey === 'breakfast' ? '07:00 - 09:30 AM' : mealKey === 'lunch' ? '12:00 - 02:30 PM' : '07:00 - 09:30 PM'}
                    </p>
                  </div>
                </div>
                <span className={`material-symbols-outlined text-[#434655] transition-transform duration-200 ${expandedMeals[mealKey] ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </div>

              {/* Toggle Control / Lock Indicator */}
              <div className="flex items-center justify-between pt-2 border-t border-[#c3c6d7] mt-2">
                <span className={`text-[14px] ${isConfirmed ? 'font-semibold text-[#004ac6]' : 'text-[#434655]'}`}>
                  {isConfirmed ? 'Meal Confirmed' : 'Meal Skipped'}
                </span>
                
                {!isLockedDate ? (
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isConfirmed}
                      onChange={() => handleToggleMeal(mealKey)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#dce2f3] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#c3c6d7] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2563eb]"></div>
                  </label>
                ) : (
                  <span className="text-xs text-[#737686] font-semibold flex items-center gap-1 bg-[#f0f3ff] px-2.5 py-1 rounded-md border border-[#c3c6d7]">
                    <span className="material-symbols-outlined text-[14px]">lock</span>
                    Locked
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
};
