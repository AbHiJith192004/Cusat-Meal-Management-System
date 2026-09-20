import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { attendanceApi, mealApi } from '../services/api';
import {
  currentMeal as pickCurrentMeal,
  formatWindow,
  FALLBACK_WINDOWS,
  type MealKey,
} from '../utils/mealWindows';
import { ChefMascot } from '../components/FoodIllustrations';
import { AdminScannerView } from './AdminScannerView';

interface StudentQrViewProps {
  studentName: string;
  regNo: string;
  /** True when the mess office has granted this student scanner access. */
  canScan?: boolean;
}

type MealType = 'Breakfast' | 'Lunch' | 'Dinner';

const KEY: Record<MealType, MealKey> = {
  Breakfast: 'breakfast', Lunch: 'lunch', Dinner: 'dinner',
};
const LABEL: Record<MealKey, MealType> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner',
};

const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner'];

export const StudentQrView: React.FC<StudentQrViewProps> = ({ studentName, regNo, canScan = false }) => {
  const [activeSubView, setActiveSubView] = useState<'scanner' | 'pass'>('pass');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [mealType, setMealType] = useState<MealType>(() => LABEL[pickCurrentMeal()]);
  // The office's real serving windows. This screen used to print its own
  // ("12:30 PM – 2:00 PM" for a lunch the mess serves 12:00–14:30), so a
  // student read one set of times on the home screen and another on the pass
  // they were holding in the queue. One extra GET on open buys the truth.
  const [windows, setWindows] = useState<Partial<Record<MealKey, string>>>();
  // Once the student picks a meal themselves, the windows arriving must not
  // move it under their thumb.
  const pickedByHand = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [isAlreadyRecorded, setIsAlreadyRecorded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQrToken = async (type: MealType) => {
    setIsRefreshing(true);
    setIsAlreadyRecorded(false);
    setError(null);
    setQrToken(null);
    try {
      const res = await attendanceApi.getQrToken(type);
      setQrToken(res.qr_token);
      setSecondsLeft(res.validity_seconds || 60);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already') || msg.includes('recorded')) {
        setIsAlreadyRecorded(true);
      } else {
        setQrToken(null);
        setError(
          msg.includes('outside') || msg.includes('window')
            ? 'This meal is not being served right now. Come back during the serving window.'
            : msg.includes('skipped')
            ? 'You opted out of this meal, so no pass can be issued.'
            : 'Could not get a pass from the server. Check your connection and try again.'
        );
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    mealApi.getMeals().then(days => {
      const today = days?.[0];
      if (cancelled || !today) return;
      const live = {
        breakfast: today.breakfast?.time_window,
        lunch: today.lunch?.time_window,
        dinner: today.dinner?.time_window,
      };
      setWindows(live);
      if (!pickedByHand.current) setMealType(LABEL[pickCurrentMeal(live)]);
    }).catch(() => {
      // Keep the fallback windows; the pass itself does not depend on this.
    });
    return () => { cancelled = true; };
  }, []);

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

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <main className="page-container space-y-4">
      {/* Committee officers get the scanner on this screen too, so they never
          have to hunt for a second destination while a queue is waiting. The
          grant comes from the server, not from local storage. */}
      {canScan && (
        <div className="p-4 bg-[#16a34a]/10 border border-[#16a34a]/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[26px] text-[#16a34a]">stars</span>
            <div>
              <h4 className="font-extrabold text-[#2D1A0E] text-sm flex items-center gap-1.5">
                Mess Committee Officer Mode
              </h4>
              <p className="text-[#15803d] font-semibold mt-0.5">
                The scanner is enabled for you, so you can take attendance for fellow students. Your
                own pass still has to be scanned like everyone else&rsquo;s.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0" role="tablist" aria-label="Committee view">
            <button
              role="tab"
              aria-selected={activeSubView === 'scanner'}
              onClick={() => setActiveSubView('scanner')}
              className={`px-3.5 py-1.5 rounded-xl font-black text-xs cursor-pointer transition-all flex items-center gap-1 ${
                activeSubView === 'scanner' ? 'bg-[#16a34a] text-white shadow-xs' : 'bg-white text-[#2D1A0E] border border-[#E3CB9B]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
              <span>Scanner</span>
            </button>
            <button
              role="tab"
              aria-selected={activeSubView === 'pass'}
              onClick={() => setActiveSubView('pass')}
              className={`px-3.5 py-1.5 rounded-xl font-black text-xs cursor-pointer transition-all flex items-center gap-1 ${
                activeSubView === 'pass' ? 'bg-[#F47A35] text-[#2D1A0E] shadow-xs' : 'bg-white text-[#2D1A0E] border border-[#E3CB9B]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
              <span>My Pass</span>
            </button>
          </div>
        </div>
      )}

      {canScan && activeSubView === 'scanner' ? (
        <AdminScannerView />
      ) : (
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
                color: 'var(--orange-ink)',
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
                  onClick={() => { pickedByHand.current = true; setMealType(m); }}
                  className="flex-1 py-2 rounded-full text-[13px] font-bold cursor-pointer text-center transition-colors lg:rounded-lg"
                  style={{
                    background: active ? 'var(--orange)' : 'var(--card)',
                    // Dark ink on the orange fill: white is 2.73:1 here, below AA.
                    color: active ? 'var(--on-orange)' : 'var(--text-body)',
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
              ) : error ? (
                <div className="text-center py-8 flex flex-col items-center gap-2">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 36, color: 'var(--red)' }}
                  >
                    error
                  </span>
                  <p className="font-display text-[15px] font-bold" style={{ color: 'var(--text-dark)' }}>
                    No pass available
                  </p>
                  <p className="text-xs font-semibold max-w-[240px]" style={{ color: 'var(--text-muted)' }}>
                    {error}
                  </p>
                  <button
                    onClick={() => fetchQrToken(mealType)}
                    className="btn-secondary mt-1"
                    style={{ fontSize: '0.75rem', padding: '6px 14px' }}
                  >
                    Try again
                  </button>
                </div>
              ) : qrToken ? (
                <QRCodeSVG
                  value={qrToken}
                  size={260}
                  marginSize={4}
                  title={`Mess pass QR code for ${mealType}`}
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
                  style={{
                    background: error
                      ? 'var(--red)'
                      : isAlreadyRecorded
                      ? 'var(--text-light)'
                      : 'var(--green)',
                  }}
                />
                {error ? 'Unavailable' : isAlreadyRecorded ? 'Redeemed' : 'Active'} · Valid {today}
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
              {formatWindow(windows?.[KEY[mealType]])
                ?? formatWindow(FALLBACK_WINDOWS[KEY[mealType]])}
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
      )}
    </main>
  );
};
