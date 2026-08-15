import React, { useState, useEffect } from 'react';
import { attendanceApi } from '../services/api';

const getCurrentMealType = (): 'Breakfast' | 'Lunch' | 'Dinner' => {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();

  // Breakfast: 05:00 (300m) to 09:30 (570m)
  if (minutes < 570) return 'Breakfast';
  // Lunch: 09:30 (570m) to 14:30 (870m)
  if (minutes < 870) return 'Lunch';
  // Dinner: 14:30 (870m) to 21:30 (1290m)
  if (minutes < 1290) return 'Dinner';
  // Late night -> Next Breakfast
  return 'Breakfast';
};

const isMealWindowActive = (type: 'Breakfast' | 'Lunch' | 'Dinner'): { active: boolean; message: string } => {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (type === 'Breakfast') {
    if (minutes < 420) return { active: false, message: 'Breakfast service begins at 07:00 AM.' };
    if (minutes > 570) return { active: false, message: 'Breakfast service ended at 09:30 AM.' };
    return { active: true, message: 'Breakfast service is LIVE now!' };
  }

  if (type === 'Lunch') {
    if (minutes < 720) return { active: false, message: 'Lunch service begins at 12:00 PM.' };
    if (minutes > 870) return { active: false, message: 'Lunch service ended at 02:30 PM.' };
    return { active: true, message: 'Lunch service is LIVE now!' };
  }

  if (type === 'Dinner') {
    if (minutes < 1140) return { active: false, message: 'Dinner service begins at 07:00 PM.' };
    if (minutes > 1290) return { active: false, message: 'Dinner service ended at 09:30 PM.' };
    return { active: true, message: 'Dinner service is LIVE now!' };
  }

  return { active: true, message: 'Meal service is LIVE!' };
};

const MEAL_SCHEDULE = {
  Breakfast: '07:00 AM - 09:30 AM',
  Lunch: '12:00 PM - 02:30 PM',
  Dinner: '07:00 PM - 09:30 PM',
};

export const StudentQrView: React.FC = () => {
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [mealType, setMealType] = useState<'Dinner' | 'Lunch' | 'Breakfast'>(getCurrentMealType());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [isAlreadyRecorded, setIsAlreadyRecorded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const windowCheck = isMealWindowActive(mealType);

  const fetchQrToken = async (type: 'Breakfast' | 'Lunch' | 'Dinner') => {
    setIsRefreshing(true);
    setErrorMsg(null);
    setIsAlreadyRecorded(false);

    const check = isMealWindowActive(type);
    if (!check.active) {
      setErrorMsg(check.message);
      setQrToken(null);
      setIsRefreshing(false);
      return;
    }

    try {
      const res = await attendanceApi.getQrToken(type);
      setQrToken(res.qr_token);
      setSecondsLeft(res.validity_seconds || 60);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already') || msg.includes('recorded')) {
        setIsAlreadyRecorded(true);
        setErrorMsg(null);
      } else if (msg.includes('outside') || msg.includes('window')) {
        setErrorMsg(`Meal service is inactive. Hours: ${MEAL_SCHEDULE[type]}`);
      } else if (msg.includes('skipped')) {
        setErrorMsg('You opted out of this meal. Change your selection in the Calendar tab.');
      } else {
        setErrorMsg(msg || 'Unable to generate your meal pass. Please try again.');
      }
      setQrToken(null);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQrToken(mealType);
  }, [mealType]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchQrToken(mealType);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [mealType]);

  const handleManualRefresh = () => {
    fetchQrToken(mealType);
  };

  const formattedSeconds = secondsLeft.toString().padStart(2, '0');
  const qrCodeUrl = qrToken
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrToken)}`
    : null;

  return (
    <main className="flex-grow flex flex-col items-center justify-center px-4 py-6 max-w-[768px] mx-auto w-full pb-32 md:pb-12 animate-fade-in">
      {/* Header Info */}
      <div className="text-center mb-6 flex flex-col items-center">
        <div className="bg-[#6cf8bb] text-[#00714d] px-3.5 py-1 rounded-full mb-3 flex items-center gap-1.5 shadow-xs">
          <span className="material-symbols-outlined text-[16px] leading-none">restaurant</span>
          <span className="text-[12px] font-semibold tracking-wide">Meal Entry Pass</span>
        </div>

        {/* Meal Selector */}
        <div className="flex items-center gap-2 mb-1">
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value as any)}
            className="text-[24px] font-bold text-[#151c27] bg-transparent border-none outline-none text-center cursor-pointer hover:text-[#004ac6]"
          >
            <option value="Dinner">Dinner Pass</option>
            <option value="Lunch">Lunch Pass</option>
            <option value="Breakfast">Breakfast Pass</option>
          </select>
        </div>

        <p className="text-[13px] text-[#434655] flex items-center justify-center gap-1 font-medium">
          <span className="material-symbols-outlined text-[16px] text-[#004ac6]">schedule</span>
          <span>{mealType} Hours: <strong>{MEAL_SCHEDULE[mealType]}</strong></span>
        </p>
      </div>

      {/* QR Code Card */}
      <div className="bg-[#ffffff] rounded-[16px] shadow-[0px_10px_15px_rgba(0,0,0,0.05)] border border-[#c3c6d7] p-6 flex flex-col items-center w-full max-w-sm relative overflow-hidden transition-all duration-300 hover:shadow-[0px_15px_25px_rgba(0,0,0,0.08)]">
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-[#2563eb] opacity-10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-[#6cf8bb] opacity-10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Image Container with Scanning Effect */}
        <div className="bg-white p-4 rounded-xl shadow-xs border border-[#dce2f3] mb-6 relative z-10 w-64 h-64 flex items-center justify-center group overflow-hidden">
          {isAlreadyRecorded ? (
            <div className="text-center p-4 text-[#00714d] flex flex-col items-center justify-center">
              <span className="material-symbols-outlined text-[54px] mb-2 text-[#006c49]">task_alt</span>
              <p className="text-base font-bold text-[#151c27]">Checked In!</p>
              <p className="text-xs text-[#00714d] font-semibold mt-1">Attendance recorded for {mealType}.</p>
              <p className="text-[11px] text-[#434655] mt-1">Enjoy your meal!</p>
            </div>
          ) : qrCodeUrl ? (
            <img
              src={qrCodeUrl}
              alt="Meal QR Code"
              className={`w-full h-full object-contain transition-opacity duration-300 ${
                isRefreshing ? 'opacity-30 scale-95' : 'opacity-100 scale-100'
              }`}
            />
          ) : (
            <div className="text-center p-4 flex flex-col items-center justify-center">
              <span className="material-symbols-outlined text-[48px] mb-2 text-[#737686]">hourglass_empty</span>
              <p className="text-sm font-bold text-[#151c27]">Meal Not Active</p>
              <p className="text-xs text-[#434655] font-medium mt-1 leading-snug">
                {errorMsg || `${mealType} hours: ${MEAL_SCHEDULE[mealType]}`}
              </p>
            </div>
          )}

          {/* Animated Scan Line */}
          {qrCodeUrl && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
              <div className="w-full h-1 bg-[#2563eb]/60 shadow-[0_0_12px_rgba(37,99,235,0.8)] absolute top-0 animate-scanline"></div>
            </div>
          )}

          {/* Corner Brackets */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#004ac6] rounded-tl-xs m-2"></div>
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#004ac6] rounded-tr-xs m-2"></div>
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#004ac6] rounded-bl-xs m-2"></div>
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#004ac6] rounded-br-xs m-2"></div>
        </div>

        {/* Countdown Timer */}
        <div className="flex flex-col items-center z-10 w-full">
          <div className="flex items-center gap-2 mb-4 bg-[#e7eefe] py-2 px-4 rounded-full border border-[#dce2f3]">
            <span className="material-symbols-outlined text-[#004ac6] animate-pulse">timer</span>
            <span className="text-[20px] font-semibold text-[#004ac6] tabular-nums tracking-wider">
              00:{formattedSeconds}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[#434655] max-w-[250px] mx-auto mb-4">
            <span className="material-symbols-outlined text-[18px] text-[#006c49]">security</span>
            <p className="text-[13px] text-center leading-tight">
              Secure code that refreshes automatically every 60 seconds
            </p>
          </div>

          <button
            onClick={handleManualRefresh}
            className="px-4 py-2 bg-[#f0f3ff] hover:bg-[#e2e8f8] text-[#004ac6] font-semibold text-xs rounded-full border border-[#c3c6d7] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span className={`material-symbols-outlined text-[16px] ${isRefreshing ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Get New Code</span>
          </button>
        </div>
      </div>
    </main>
  );
};
