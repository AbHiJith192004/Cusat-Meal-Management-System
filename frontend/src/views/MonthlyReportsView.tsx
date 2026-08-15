import React, { useState, useEffect } from 'react';
import { adminApi, authApi } from '../services/api';
import { MealRateModal } from '../components/MealRateModal';

export const MonthlyReportsView: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState('8'); // August
  const [selectedYear, setSelectedYear] = useState('2026');
  const [searchTableQuery, setSearchTableQuery] = useState('');
  const [studentRows, setStudentRows] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [showMealRateModal, setShowMealRateModal] = useState(false);

  useEffect(() => {
    const loadReportData = async () => {
      try {
        const students = await adminApi.getStudents('');
        if (Array.isArray(students)) {
          const rows = students.map((s: any) => ({
            id: s.registration_number || s.id,
            name: s.name,
            room: 'Hostel A',
            pct: 100,
            fines: 0,
          }));
          setStudentRows(rows);
        }

        const dash = await adminApi.getDashboard();
        setDashboardStats(dash);
      } catch (e) {}
    };
    loadReportData();
  }, []);

  const displayRows = studentRows.length > 0 ? studentRows : [];

  const filteredRows = displayRows.filter(
    (row) =>
      row.name.toLowerCase().includes(searchTableQuery.toLowerCase()) ||
      row.id.toLowerCase().includes(searchTableQuery.toLowerCase())
  );

  const handleExportExcel = async () => {
    try {
      await adminApi.downloadReportFile(Number(selectedYear), Number(selectedMonth), 'excel');
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    }
  };

  const handleExportPDF = async () => {
    try {
      await adminApi.downloadReportFile(Number(selectedYear), Number(selectedMonth), 'pdf');
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    }
  };

  const confirmedCount = (dashboardStats?.today_stats?.breakfast?.confirmed || 0) +
                         (dashboardStats?.today_stats?.lunch?.confirmed || 0) +
                         (dashboardStats?.today_stats?.dinner?.confirmed || 0);

  const pendingFines = dashboardStats?.pending_fines_count || 0;

  return (
    <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full flex flex-col gap-6 bg-[#f9f9ff] pb-24 md:pb-8">
      {/* Page Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] md:text-[30px] font-bold text-[#151c27]">Monthly Reports</h1>
          <p className="text-[14px] text-[#434655] mt-1">
            Overview of meal attendance and fine generation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-[#ffffff] border border-[#c3c6d7] text-[#151c27] text-sm font-semibold rounded-lg px-3 py-2 outline-none cursor-pointer hover:bg-[#f0f3ff]"
          >
            <option value="8">August 2026</option>
            <option value="7">July 2026</option>
            <option value="6">June 2026</option>
          </select>

          <button
            onClick={() => setShowMealRateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#fef3c7] text-[#92400e] border border-[#f59e0b]/40 rounded-lg hover:bg-[#fde68a] text-xs font-bold transition-colors cursor-pointer shadow-2xs"
          >
            <span className="material-symbols-outlined text-[18px]">payments</span>
            Meal Rates & Pricing
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-[#c3c6d7] rounded-lg text-[#151c27] bg-[#ffffff] hover:bg-[#f0f3ff] text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">table_chart</span>
            Generate Excel (.xlsx)
          </button>

          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2563eb] text-white rounded-lg hover:bg-[#004ac6] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
            Generate PDF Report
          </button>
        </div>
      </div>

      <MealRateModal
        isOpen={showMealRateModal}
        onClose={() => setShowMealRateModal(false)}
        year={Number(selectedYear)}
        month={Number(selectedMonth)}
      />

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#ffffff] rounded-xl border border-[#c3c6d7] p-4 shadow-2xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#2563eb]/5 rounded-bl-full -mr-4 -mt-4"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#2563eb]/10 rounded-lg text-[#004ac6]">
              <span className="material-symbols-outlined">restaurant</span>
            </div>
          </div>
          <div>
            <p className="text-[14px] text-[#434655] mb-1">Today Confirmed Meals</p>
            <h3 className="text-[30px] font-bold text-[#151c27]">{confirmedCount || 0}</h3>
          </div>
        </div>

        <div className="bg-[#ffffff] rounded-xl border border-[#c3c6d7] p-4 shadow-2xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#ba1a1a]/5 rounded-bl-full -mr-4 -mt-4"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#ffdad6]/50 rounded-lg text-[#ba1a1a]">
              <span className="material-symbols-outlined">event_busy</span>
            </div>
          </div>
          <div>
            <p className="text-[14px] text-[#434655] mb-1">Pending Fines Count</p>
            <h3 className="text-[30px] font-bold text-[#151c27]">{pendingFines}</h3>
          </div>
        </div>

        <div className="bg-[#ffffff] rounded-xl border border-[#c3c6d7] p-4 shadow-2xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#784b00]/5 rounded-bl-full -mr-4 -mt-4"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-[#ffeedd]/60 rounded-lg text-[#784b00]">
              <span className="material-symbols-outlined">payments</span>
            </div>
          </div>
          <div>
            <p className="text-[14px] text-[#434655] mb-1">Estimated Fine Value</p>
            <h3 className="text-[30px] font-bold text-[#151c27]">₹{pendingFines * 30}</h3>
          </div>
        </div>
      </div>

      {/* Data Table Container */}
      <div className="bg-[#ffffff] border border-[#c3c6d7] rounded-xl shadow-2xs overflow-hidden flex-1 flex flex-col">
        <div className="px-4 py-3 border-b border-[#c3c6d7] flex justify-between items-center bg-[#f9f9ff]">
          <h3 className="text-[18px] font-semibold text-[#151c27]">Database Student List</h3>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#737686] text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchTableQuery}
              onChange={(e) => setSearchTableQuery(e.target.value)}
              placeholder="Search students..."
              className="pl-8 pr-3 py-1.5 bg-[#ffffff] border border-[#c3c6d7] rounded-md text-xs text-[#151c27] focus:ring-1 focus:ring-[#2563eb] outline-none w-48 md:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f0f3ff] border-b border-[#c3c6d7]">
                <th className="px-4 py-2.5 text-[12px] font-semibold text-[#434655] uppercase">Registration No</th>
                <th className="px-4 py-2.5 text-[12px] font-semibold text-[#434655] uppercase">Name</th>
                <th className="px-4 py-2.5 text-[12px] font-semibold text-[#434655] uppercase">Hostel</th>
                <th className="px-4 py-2.5 text-[12px] font-semibold text-[#434655] uppercase text-right">Attendance %</th>
                <th className="px-4 py-2.5 text-[12px] font-semibold text-[#434655] uppercase text-right">Total Fines</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-[#c3c6d7]/50 hover:bg-[#f0f3ff]/50 transition-colors">
                  <td className="px-4 py-3 text-[#151c27] font-medium">{row.id}</td>
                  <td className="px-4 py-3 text-[#151c27]">{row.name}</td>
                  <td className="px-4 py-3 text-[#434655]">{row.room}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold text-[#006c49]">{row.pct}%</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${row.fines > 0 ? 'text-[#ba1a1a]' : 'text-[#151c27]'}`}>
                    ₹{row.fines}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
