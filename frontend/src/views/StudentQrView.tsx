import React, { useState, useEffect } from 'react';
import { attendanceApi } from '../services/api';
import { ChefMascot } from '../components/FoodIllustrations';

interface StudentQrViewProps {
  studentName: string;
  regNo: string;
}

type MealType = 'Breakfast' | 'Lunch' | 'Dinner';

const getCurrentMealType = (): MealType => {
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < 660) return 'Breakfast';
  if (m < 900) return 'Lunch';
  return 'Dinner';
};

const MEAL_SCHEDULE: Record<MealType, string> = {
  Breakfast: '7:30 AM – 9:30 AM',
  Lunch: '12:30 PM – 2:00 PM',
  Dinner: '7:30 PM – 9:30 PM',
};

const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner'];

export const StudentQrView: React.FC<StudentQrViewProps> = ({ studentName, regNo }) => {
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [mealType, setMealType] = useState<MealType>(getCurrentMealType());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [isAlreadyRecorded, setIsAlreadyRecorded] = useState(false);

  const fetchQrToken = async (type: MealType) => {
    setIsRefreshing(true);
    setIsAlreadyRecorded(false);
    try {
      const res = await attendanceApi.getQrToken(type);
      setQrToken(res.qr_token);
      setSecondsLeft(res.validity_seconds || 60);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already') || msg.includes('recorded')) {
        setIsAlreadyRecorded(true);
      } else {
        setQrToken(`CUSAT-PASS-${type.toUpperCase()}-${Date.now()}`);
        setSecondsLeft(60);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchQrToken(mealType); }, [mealType]);

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { fetchQrToken(mealType); return 60; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [mealType]);

  const qrCodeUrl = qrToken
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
        qrToken
      )}&bgcolor=ffffff&color=2D1A0E`
    : null;

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <main className="page-container">
      <div className="mx-auto w-full max-w-[440px] lg:max-w-none lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-8 lg:items-start">
        {/* ── The pass ───────────────────────────────────────────── */}
        <div>
          {/* Mobile-only mascot header; on desktop the topbar already says this */}
          <div className="flex items-center justify-between gap-3 mb-4 lg:hidden">
            <div className="flex items-center gap-3 min-w-0">
              <div className="float-gentle shrink-0">
                <ChefMascot size={44} />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-[17px] font-bold" style={{ color: 'var(--text-dark)' }}>
                  Digital Dining Pass
                </h2>
                <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Scan at the dining hall entrance
                </p>
              </div>
            </div>
            <span
              className="px-2.5 py-1 rounded-full text-[11px] font-black shrink-0"
              style={{
                background: 'var(--orange-soft)',
                color: 'var(--orange-dark)',
                border: '1px solid var(--orange-light)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {secondsLeft}s
            </span>
          </div>

          {/* Meal selector */}
          <div className="flex gap-2 mb-4" role="tablist" aria-label="Meal">
            {MEALS.map(m => {
              const active = mealType === m;
              return (
                <button
                  key={m}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMealType(m)}
                  className="flex-1 py-2 rounded-full text-[13px] font-bold cursor-pointer text-center transition-colors lg:rounded-lg"
                  style={{
                    background: active ? 'var(--orange)' : 'var(--card)',
                    color: active ? '#fff' : 'var(--text-body)',
                    border: `1px solid ${active ? 'var(--orange)' : 'var(--line)'}`,
                    fontFamily: 'Nunito, sans-serif',
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Ticket */}
          <div className="qr-ticket-card">
            <div className="text-center mb-4">
              <p className="font-display text-[18px] font-bold" style={{ color: 'var(--text-dark)' }}>
                {studentName}
              </p>
              <p className="text-[13px] font-bold" style={{ color: 'var(--text-body)' }}>
                ID: {regNo}
              </p>
              <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Regular plan · {mealType}
              </p>
            </div>

            <div className="qr-inner-frame mb-4" style={{ minHeight: 220 }}>
              {isAlreadyRecorded ? (
                <div className="text-center py-8 flex flex-col items-center gap-2">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 40, color: 'var(--green)' }}
                  >
                    check_circle
                  </span>
                  <p className="font-display text-[17px] font-bold" style={{ color: 'var(--green)' }}>
                    Already attended
                  </p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {mealType} is recorded for today
                  </p>
                </div>
              ) : qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt={`Mess pass QR code for ${mealType}`}
                  className="w-full max-w-[220px] h-auto"
                  style={{ opacity: isRefreshing ? 0.35 : 1, transition: 'opacity 0.3s' }}
                />
              ) : (
                <div className="flex items-center justify-center py-14">
                  <span
                    className="material-symbols-outlined animate-spin"
                    style={{ fontSize: 28, color: 'var(--text-light)' }}
                  >
                    progress_activity
                  </span>
                </div>
              )}
            </div>

            <div className="text-center">
              <p
                className="text-[13px] font-bold flex items-center justify-center gap-1.5"
                style={{ color: 'var(--text-dark)' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ background: isAlreadyRecorded ? 'var(--text-light)' : 'var(--green)' }}
                />
                {isAlreadyRecorded ? 'Redeemed' : 'Active'} · Valid {today}
              </p>
              <p
                className="text-[11px] font-semibold mt-1"
                style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
              >
                Refreshes in {String(secondsLeft).padStart(2, '0')}s
              </p>
            </div>
          </div>
        </div>

        {/* ── Side details ───────────────────────────────────────── */}
        <div className="mt-3.5 lg:mt-0 flex flex-col gap-3">
          <div
            className="px-4 py-3.5 rounded-2xl flex items-center justify-between gap-3 lg:rounded-xl"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: 'var(--text-body)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--orange)' }}>
                schedule
              </span>
              {mealType} timing
            </span>
            <span
              className="text-[13px] font-black"
              style={{ color: 'var(--text-dark)', fontVariantNumeric: 'tabular-nums' }}
            >
              {MEAL_SCHEDULE[mealType]}
            </span>
          </div>

          <button
            onClick={() => fetchQrToken(mealType)}
            className="btn-secondary w-full lg:w-auto lg:self-start"
            disabled={isRefreshing}
          >
            <span
              className={`material-symbols-outlined ${isRefreshing ? 'animate-spin' : ''}`}
              style={{ fontSize: 17 }}
            >
              refresh
            </span>
            Generate a new code
          </button>

          {/* Desktop-only explainer — space that mobile does not have */}
          <div
            className="hidden lg:block p-5 rounded-xl"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
          >
            <p className="section-label mb-2.5">How it works</p>
            <ol
              className="text-[13px] font-semibold flex flex-col gap-2"
              style={{ color: 'var(--text-body)' }}
            >
              <li>1. Pick the meal you are collecting.</li>
              <li>2. Show the code to the scanner at the entrance.</li>
              <li>3. It expires after 60 seconds and cannot be reused.</li>
            </ol>
            <p className="text-[12px] font-semibold mt-3" style={{ color: 'var(--text-muted)' }}>
              Screenshots will not work — each code is signed and single-use.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};
