import React, { useState, useEffect } from 'react';
import { ActiveTab, DayMealPlan } from '../types';
import { studentApi, mealApi } from '../services/api';

interface StudentHomeViewProps {
  studentName: string;
  hostelName: string;
  todayPlan?: DayMealPlan;
  tomorrowPlan?: DayMealPlan;
  onNavigate: (tab: ActiveTab) => void;
}

const friendlyStatus = (status: string | undefined): string => {
  if (!status) return 'Eating';
  switch (status.toUpperCase()) {
    case 'CONFIRMED': return 'Eating';
    case 'SKIPPED': return 'Opted Out';
    case 'ATTENDED': return 'Done ✅';
    case 'NO_SERVICE': return 'No Service';
    default: return status;
  }
};

const statusColor = (status: string | undefined): string => {
  const s = (status || 'CONFIRMED').toUpperCase();
  if (s === 'SKIPPED') return 'text-[#ba1a1a]';
  if (s === 'ATTENDED') return 'text-[#006c49]';
  return 'text-[#006c49]';
};

const statusIcon = (status: string | undefined): string => {
  const s = (status || 'CONFIRMED').toUpperCase();
  if (s === 'SKIPPED') return 'close';
  if (s === 'ATTENDED') return 'check_circle';
  return 'restaurant';
};

const statusDotColor = (status: string | undefined): string => {
  const s = (status || 'CONFIRMED').toUpperCase();
  if (s === 'SKIPPED') return 'bg-[#ba1a1a]';
  if (s === 'ATTENDED') return 'bg-[#006c49]';
  return 'bg-[#006c49]';
};

export const StudentHomeView: React.FC<StudentHomeViewProps> = ({
  studentName: defaultName,
  hostelName,
  onNavigate,
}) => {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [mealsList, setMealsList] = useState<any[]>([]);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const data = await studentApi.getDashboard();
        setDashboardData(data);

        const meals = await mealApi.getMeals();
        setMealsList(meals || []);
      } catch (e) {}
    };
    loadDashboard();
  }, []);

  const name = dashboardData?.student_name || defaultName;

  let totalBooked = 0;
  let totalDone = 0;
  let totalSkipped = 0;

  mealsList.forEach((day: any) => {
    ['breakfast', 'lunch', 'dinner'].forEach((mealKey) => {
      const status = day[mealKey]?.status;
      if (status === 'CONFIRMED') totalBooked++;
      if (status === 'ATTENDED') totalDone++;
      if (status === 'SKIPPED') totalSkipped++;
    });
  });

  const breakfastStatus = dashboardData?.meals?.breakfast?.status;
  const lunchStatus = dashboardData?.meals?.lunch?.status;
  const dinnerStatus = dashboardData?.meals?.dinner?.status;

  const finalDone = dashboardData?.overall_stats?.meals_done ?? 0;
  const finalSkipped = dashboardData?.overall_stats?.meals_skipped ?? 0;
  const finalBooked = dashboardData?.overall_stats?.meals_booked ?? 0;
  const totalTracked = finalDone + finalSkipped + finalBooked;
  const attendanceRate = totalTracked > 0 
    ? Math.round((finalDone / totalTracked) * 100) 
    : 100;

  return (
    <main className="w-full max-w-[768px] mx-auto px-4 py-6 flex flex-col gap-6 pb-32 md:pb-12 animate-fade-in">
      {/* Welcome Section */}
      <section className="flex flex-col gap-1">
        <h2 className="text-[24px] md:text-[30px] font-bold text-[#151c27] tracking-tight">
          Hello, {name}
        </h2>
        <p className="text-[14px] text-[#434655] font-medium">{hostelName}</p>
      </section>

      {/* Section 1: Today's Meals Status */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[20px] font-semibold text-[#151c27]">Today's Meals</h3>
          <span className="text-[14px] text-[#434655]">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Breakfast */}
          <div className="bg-[#ffffff] border border-[#c3c6d7] rounded-xl p-4 shadow-xs relative overflow-hidden flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-semibold text-[#151c27]">Breakfast</span>
              <span className={`material-symbols-outlined ${statusColor(breakfastStatus)}`}>{statusIcon(breakfastStatus)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusDotColor(breakfastStatus)}`}></div>
              <span className={`text-[14px] font-medium ${statusColor(breakfastStatus)}`}>
                {friendlyStatus(breakfastStatus)}
              </span>
            </div>
            <p className="text-[12px] text-[#434655] mt-1">07:00 - 09:30 AM</p>
          </div>

          {/* Lunch */}
          <div className="bg-[#2563eb]/10 border border-[#2563eb]/20 rounded-xl p-4 shadow-xs relative overflow-hidden flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-semibold text-[#151c27]">Lunch</span>
              <span className={`material-symbols-outlined ${statusColor(lunchStatus)}`}>{statusIcon(lunchStatus)}</span>
            </div>
            <div className="flex items-center gap-2 animate-subtle-pulse">
              <div className={`w-2 h-2 rounded-full ${statusDotColor(lunchStatus)}`}></div>
              <span className={`text-[14px] font-medium ${statusColor(lunchStatus)}`}>
                {friendlyStatus(lunchStatus)}
              </span>
            </div>
            <p className="text-[12px] text-[#434655] mt-1">12:00 - 02:30 PM</p>
          </div>

          {/* Dinner */}
          <div className="bg-[#ffffff] border border-[#c3c6d7] rounded-xl p-4 shadow-xs flex flex-col gap-2 opacity-80">
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-semibold text-[#151c27]">Dinner</span>
              <span className={`material-symbols-outlined ${statusColor(dinnerStatus)}`}>{statusIcon(dinnerStatus)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${statusDotColor(dinnerStatus)}`}></div>
              <span className={`text-[14px] font-medium ${statusColor(dinnerStatus)}`}>
                {friendlyStatus(dinnerStatus)}
              </span>
            </div>
            <p className="text-[12px] text-[#434655] mt-1">07:00 - 09:30 PM</p>
          </div>
        </div>
      </section>

      {/* Section 2: Tomorrow's Meals Selection */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[20px] font-semibold text-[#151c27]">Tomorrow's Meals</h3>
          <span className="bg-[#e7eefe] px-2.5 py-1 rounded-md text-[12px] text-[#434655] flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">info</span>
            Changes close at 9:00 PM
          </span>
        </div>

        <div className="bg-[#ffffff] border border-[#c3c6d7] rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="flex w-full divide-x divide-[#c3c6d7] border-b border-[#c3c6d7]">
            <div className="flex-1 p-3 flex flex-col items-center justify-center gap-1 py-4 bg-[#006c49]/5">
              <span className="text-[12px] text-[#434655]">Breakfast</span>
              <span className="material-symbols-outlined text-[#006c49] text-[20px]">restaurant</span>
              <span className="text-[12px] font-semibold text-[#006c49]">Eating</span>
            </div>
            <div className="flex-1 p-3 flex flex-col items-center justify-center gap-1 py-4 bg-[#006c49]/5">
              <span className="text-[12px] text-[#434655]">Lunch</span>
              <span className="material-symbols-outlined text-[#006c49] text-[20px]">restaurant</span>
              <span className="text-[12px] font-semibold text-[#006c49]">Eating</span>
            </div>
            <div className="flex-1 p-3 flex flex-col items-center justify-center gap-1 py-4 bg-[#006c49]/5">
              <span className="text-[12px] text-[#434655]">Dinner</span>
              <span className="material-symbols-outlined text-[#006c49] text-[20px]">restaurant</span>
              <span className="text-[12px] font-semibold text-[#006c49]">Eating</span>
            </div>
          </div>

          <div className="p-4 bg-[#ffffff]">
            <button
              onClick={() => onNavigate('calendar')}
              className="w-full bg-[#2563eb] text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#004ac6] transition-colors h-[48px] shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">edit_calendar</span>
              Change Tomorrow's Meals
            </button>
          </div>
        </div>
      </section>

      {/* Section 3: Student Overview - Meal Status Breakdown */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[20px] font-semibold text-[#151c27]">Student Meal Overview</h3>
          <span className="px-2.5 py-1 bg-[#006c49]/10 text-[#006c49] text-xs font-bold rounded-full">
            {attendanceRate}% Attendance
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#ffffff] border border-[#006c49]/30 rounded-xl p-4 shadow-xs flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-[#006c49]">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              <span className="text-[11px] font-bold uppercase tracking-wider">Meals Done</span>
            </div>
            <span className="text-[28px] font-extrabold text-[#006c49]">{finalDone}</span>
            <span className="text-[11px] text-[#434655]">Attended & Scanned</span>
          </div>

          <div className="bg-[#ffffff] border border-[#ba1a1a]/30 rounded-xl p-4 shadow-xs flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-[#ba1a1a]">
              <span className="material-symbols-outlined text-[20px]">cancel</span>
              <span className="text-[11px] font-bold uppercase tracking-wider">Mess Cuts / Skipped</span>
            </div>
            <span className="text-[28px] font-extrabold text-[#ba1a1a]">{finalSkipped}</span>
            <span className="text-[11px] text-[#434655]">Mess Cuts (Max 10/mo)</span>
          </div>

          <div className="bg-[#ffffff] border border-[#c3c6d7] rounded-xl p-4 shadow-xs flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-[#2563eb]">
              <span className="material-symbols-outlined text-[20px]">calendar_today</span>
              <span className="text-[11px] font-bold uppercase tracking-wider">Meals Booked</span>
            </div>
            <span className="text-[28px] font-extrabold text-[#151c27]">{finalBooked}</span>
            <span className="text-[11px] text-[#434655]">Confirmed Selections</span>
          </div>

          <div className="bg-[#f0f4ff] border border-[#2563eb]/20 rounded-xl p-4 shadow-xs flex flex-col items-start gap-1">
            <div className="flex items-center gap-1.5 text-[#2563eb]">
              <span className="material-symbols-outlined text-[20px]">analytics</span>
              <span className="text-[11px] font-bold uppercase tracking-wider">Activity Status</span>
            </div>
            <span className="text-[16px] font-bold text-[#151c27] mt-1">
              {finalSkipped === 0 ? 'Perfect Record' : finalSkipped > 5 ? 'High Miss Rate' : 'Regular Student'}
            </span>
            <span className="text-[11px] text-[#434655]">Status Metric</span>
          </div>
        </div>
      </section>
    </main>
  );
};
