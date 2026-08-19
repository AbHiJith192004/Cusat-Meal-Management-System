import React, { useState, useEffect } from 'react';
import { mealRateApi } from '../services/api';

interface MealRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  month: number;
}

export const MealRateModal: React.FC<MealRateModalProps> = ({
  isOpen,
  onClose,
  year,
  month,
}) => {
  const [breakfast, setBreakfast] = useState(30);
  const [lunch, setLunch] = useState(50);
  const [dinner, setDinner] = useState(40);
  const [notes, setNotes] = useState('Regular Day');

  const [overrideDate, setOverrideDate] = useState('');
  const [overrideBreakfast, setOverrideBreakfast] = useState(35);
  const [overrideLunch, setOverrideLunch] = useState(65);
  const [overrideDinner, setOverrideDinner] = useState(50);
  const [overrideNotes, setOverrideNotes] = useState('Special Feast Day');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [ratesList, setRatesList] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchRates();
      const firstDay = `${year}-${month.toString().padStart(2, '0')}-01`;
      setOverrideDate(firstDay);
    }
  }, [isOpen, year, month]);

  const fetchRates = async () => {
    try {
      const data = await mealRateApi.getMealRates(year, month);
      setRatesList(data || []);
    } catch (e) {}
  };

  if (!isOpen) return null;

  const totalDaily = breakfast + lunch + dinner;
  const totalOverrideDaily = overrideBreakfast + overrideLunch + overrideDinner;

  const handleBulkApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await mealRateApi.bulkSetMealRates({
        year,
        month,
        breakfast_rate: Number(breakfast),
        lunch_rate: Number(lunch),
        dinner_rate: Number(dinner),
        notes,
      });

      setMessage({ type: 'success', text: res.message || `Bulk applied ₹${totalDaily}/day across all days.` });
      fetchRates();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to apply bulk rates.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSingleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideDate) return alert('Select a date for custom pricing.');

    setLoading(true);
    setMessage(null);

    try {
      const res = await mealRateApi.setMealRate({
        rate_date: overrideDate,
        breakfast_rate: Number(overrideBreakfast),
        lunch_rate: Number(overrideLunch),
        dinner_rate: Number(overrideDinner),
        notes: overrideNotes,
      });

      setMessage({ type: 'success', text: res.message || `Custom rate ₹${totalOverrideDaily}/day set for ${overrideDate}.` });
      fetchRates();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update custom date pricing.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 border border-[#c3c6d7] shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#737686] hover:text-[#151c27] transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-full bg-[#F47A35]/10 text-[#D45E1A] flex items-center justify-center mx-auto mb-2">
            <span className="material-symbols-outlined text-[28px]">payments</span>
          </div>
          <h2 className="text-2xl font-bold text-[#151c27]">Meal Rates & Pricing Manager</h2>
          <p className="text-xs text-[#434655]">
            Configure daily meal charges for Excel billing reports
          </p>
        </div>

        {message && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-[#6cf8bb] text-[#00714d]'
                : 'bg-[#ffdad6] text-[#93000a]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {message.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form 1: Bulk Apply Month Rate */}
          <form onSubmit={handleBulkApply} className="bg-[#f0f3ff] p-4 rounded-xl space-y-3 border border-[#c3c6d7]/60">
            <h3 className="text-sm font-bold text-[#151c27] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-[#D45E1A]">calendar_month</span>
              1. Apply Bulk Rate (Entire Month)
            </h3>
            <p className="text-[11px] text-[#434655]">Set standard daily prices for all days in selected month.</p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[#434655] mb-1">Breakfast (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={breakfast}
                  onChange={(e) => setBreakfast(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-[#c3c6d7] rounded-lg font-medium outline-none text-[#151c27]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#434655] mb-1">Lunch (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={lunch}
                  onChange={(e) => setLunch(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-[#c3c6d7] rounded-lg font-medium outline-none text-[#151c27]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#434655] mb-1">Dinner (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={dinner}
                  onChange={(e) => setDinner(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-[#c3c6d7] rounded-lg font-medium outline-none text-[#151c27]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#434655] mb-1">Label / Note</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Regular Day"
                className="w-full p-2 bg-white border border-[#c3c6d7] rounded-lg text-xs font-medium outline-none text-[#151c27]"
              />
            </div>

            <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-[#c3c6d7]/60">
              <span className="text-xs text-[#434655]">Total Daily Rate:</span>
              <span className="text-base font-bold text-[#006c49]">₹{totalDaily.toFixed(2)}/day</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#F47A35] text-white font-semibold text-xs rounded-xl hover:bg-[#D45E1A] transition-colors cursor-pointer shadow-xs"
            >
              Apply ₹{totalDaily}/day to All Days
            </button>
          </form>

          {/* Form 2: Date-Specific Override (Feast Days) */}
          <form onSubmit={handleSingleOverride} className="bg-[#fef3c7]/50 p-4 rounded-xl space-y-3 border border-[#f59e0b]/40">
            <h3 className="text-sm font-bold text-[#92400e] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-[#d97706]">edit_calendar</span>
              2. Custom Date Override (Feast / Special)
            </h3>
            <p className="text-[11px] text-[#434655]">Override rates for a specific holiday or special meal day.</p>

            <div>
              <label className="block text-[11px] font-semibold text-[#434655] mb-1">Select Special Date *</label>
              <input
                type="date"
                required
                value={overrideDate}
                onChange={(e) => setOverrideDate(e.target.value)}
                className="w-full p-2 bg-white border border-[#c3c6d7] rounded-lg text-xs font-medium outline-none text-[#151c27]"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[#434655] mb-1">Breakfast (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={overrideBreakfast}
                  onChange={(e) => setOverrideBreakfast(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-[#c3c6d7] rounded-lg font-medium outline-none text-[#151c27]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#434655] mb-1">Lunch (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={overrideLunch}
                  onChange={(e) => setOverrideLunch(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-[#c3c6d7] rounded-lg font-medium outline-none text-[#151c27]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#434655] mb-1">Dinner (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={overrideDinner}
                  onChange={(e) => setOverrideDinner(Number(e.target.value))}
                  className="w-full p-2 bg-white border border-[#c3c6d7] rounded-lg font-medium outline-none text-[#151c27]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#434655] mb-1">Event Note / Label</label>
              <input
                type="text"
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                placeholder="e.g. Onam Special Feast"
                className="w-full p-2 bg-white border border-[#c3c6d7] rounded-lg text-xs font-medium outline-none text-[#151c27]"
              />
            </div>

            <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-[#c3c6d7]/60">
              <span className="text-xs text-[#434655]">Custom Date Total:</span>
              <span className="text-base font-bold text-[#b45309]">₹{totalOverrideDaily.toFixed(2)}/day</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#d97706] text-white font-semibold text-xs rounded-xl hover:bg-[#b45309] transition-colors cursor-pointer shadow-xs"
            >
              Save Custom Rate for Date
            </button>
          </form>
        </div>

        {/* Current Configured Daily Rates Summary List */}
        <div className="border-t border-[#c3c6d7] pt-4 space-y-2">
          <h4 className="text-xs font-bold text-[#151c27]">Active Month Pricing Overview ({ratesList.length} days)</h4>
          <div className="max-h-32 overflow-y-auto divide-y divide-[#c3c6d7]/50 text-xs border border-[#c3c6d7] rounded-lg">
            {ratesList.map((r) => (
              <div key={r.rate_date} className="p-2 flex justify-between items-center hover:bg-[#f0f3ff]">
                <span className="font-semibold text-[#151c27]">{r.rate_date}</span>
                <span className="text-[#434655]">
                  B: ₹{r.breakfast_rate} | L: ₹{r.lunch_rate} | D: ₹{r.dinner_rate}
                </span>
                <span className="font-bold text-[#006c49]">Total: ₹{r.daily_total.toFixed(2)}</span>
                <span className="text-[11px] text-[#737686] italic">{r.notes || 'Regular'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
