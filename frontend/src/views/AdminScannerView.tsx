import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ScanLog } from '../types';
import { adminApi, attendanceApi } from '../services/api';
import { Html5Qrcode } from 'html5-qrcode';
import { EmptyPlateCartoon } from '../components/FoodIllustrations';

type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER';
const MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER'];
const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Breakfast', LUNCH: 'Lunch', DINNER: 'Dinner',
};

/** Local date, not toISOString(): in IST that returns yesterday before 5:30am. */
const todayLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Which meal to pre-select. Only a starting point -- the admin sees the three
 * buttons and picks, so a wrong guess is visible before anything is written.
 */
const currentMeal = (): MealType => {
  const h = new Date().getHours();
  if (h < 11) return 'BREAKFAST';
  if (h < 16) return 'LUNCH';
  return 'DINNER';
};

interface AdminScannerViewProps {
  /**
   * Whether to offer the by-name form. Committee students have scanner access
   * but are not administrators, and the server refuses their manual writes --
   * so they are shown the camera and nothing they cannot use.
   */
  canMarkManually?: boolean;
}

export const AdminScannerView: React.FC<AdminScannerViewProps> = ({ canMarkManually = false }) => {
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [roll, setRoll] = useState<Array<{id: string; name: string; registration_number: string}>>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [chosen, setChosen] = useState<{id: string; name: string; registration_number: string} | null>(null);
  const [manualMeal, setManualMeal] = useState<MealType>(currentMeal);
  const [manualReason, setManualReason] = useState('');
  const [markingBusy, setMarkingBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const lastScanned = useRef<{ token: string; time: number }>({ token: '', time: 0 });

  useEffect(() => {
    attendanceApi.getRecent().then(rows => setScanLogs(rows.map((x:any) => ({
      id:x.id, studentName:x.student_name, regNo:x.registration_number,
      meal:(String(x.meal_type).toUpperCase()==='BREAKFAST'?'Breakfast':String(x.meal_type).toUpperCase()==='DINNER'?'Dinner':'Lunch') as ScanLog['meal'],
      status:'Success', timestamp:new Date(x.recorded_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
      timeAgo:''
    })))).catch(() => setFeedback({ok:false,msg:'Could not load recent check-ins.'}));
  }, []);

  const handleToken = async (token: string) => {
    const now = Date.now();
    if (token === lastScanned.current.token && now - lastScanned.current.time < 4000) return;
    lastScanned.current = { token, time: now };
    try {
      const v = await attendanceApi.verifyQr(token);
      await attendanceApi.confirmQr(v.verification_id);
      const mealRaw = String(v.meal_type || 'Lunch').toLowerCase();
      const meal = mealRaw.includes('break') ? 'Breakfast' : mealRaw.includes('din') ? 'Dinner' : 'Lunch';
      setScanLogs(prev => [{
        id: `SCAN-${Date.now()}`,
        studentName: v.student_name || 'Student',
        regNo: v.registration_number || 'TEST001',
        meal: meal as any,
        status: 'Success',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timeAgo: 'Just now',
      }, ...prev]);
      setFeedback({ ok: true, msg: `${v.student_name} verified` });
    } catch (err: any) {
      const msg = err.message || '';
      // Every failure is reported as a failure. This used to fall through to a
      // fabricated "Demo Student" scan and tell the admin "Pass verified",
      // which meant an expired token or a dropped connection looked identical
      // to a real check-in while no attendance row was actually written.
      if (msg.includes('already') || msg.includes('recorded')) {
        setFeedback({ ok: false, msg: 'Already checked in for this meal.' });
      } else if (msg.includes('expired') || msg.includes('EXPIRED')) {
        setFeedback({ ok: false, msg: 'Pass expired. Ask for a fresh code.' });
      } else if (msg.includes('invalid') || msg.includes('INVALID')) {
        setFeedback({ ok: false, msg: 'Pass not valid. Do not serve.' });
      } else {
        setFeedback({ ok: false, msg: 'Could not verify — check the connection and rescan.' });
      }
    }
    setTimeout(() => setFeedback(null), 4000);
  };

  const startCamera = async () => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    try {
      if (!html5QrcodeRef.current) html5QrcodeRef.current = new Html5Qrcode('scanner-qr-div');
      await html5QrcodeRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        txt => handleToken(txt),
        () => {}
      );
      setCameraActive(true);
    } catch {
      // No camera, or permission denied — manual token entry still works.
      isScanningRef.current = false;
      setCameraActive(false);
    }
  };

  // html5-qrcode throws a bare string *synchronously* when it is not running,
  // so this needs a try/catch and not a rejected-promise handler.
  const stopCamera = async () => {
    if (!html5QrcodeRef.current || !isScanningRef.current) return;
    isScanningRef.current = false;
    setCameraActive(false);
    try {
      await html5QrcodeRef.current.stop();
    } catch {
      /* already stopped */
    }
  };

  useEffect(() => {
    startCamera();
    return () => { void stopCamera(); };
  }, []);

  // The active roll, fetched once and only for administrators. 141 students
  // is a single small response, so the picker filters in the browser rather
  // than issuing a request per keystroke.
  useEffect(() => {
    if (!canMarkManually) return;
    adminApi.getStudentOptions()
      .then(setRoll)
      .catch(() => setManualError('Could not load the student list. Reload to try again.'));
  }, [canMarkManually]);

  const matches = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return roll.filter(r =>
      r.name.toLowerCase().includes(q) || r.registration_number.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [roll, studentQuery]);

  const markManually = async () => {
    if (!chosen || manualReason.trim().length < 3 || markingBusy) return;
    setMarkingBusy(true);
    setManualError(null);
    try {
      await adminApi.recordManualAttendance({
        student_id: chosen.id,
        meal_date: todayLocal(),
        meal_type: manualMeal,
        reason: manualReason.trim(),
      });
      setScanLogs(prev => [{
        id: `MANUAL-${Date.now()}`,
        studentName: chosen.name,
        regNo: chosen.registration_number,
        meal: MEAL_LABEL[manualMeal] as ScanLog['meal'],
        status: 'Success',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timeAgo: 'Just now',
      }, ...prev]);
      setFeedback({ ok: true, msg: `${chosen.name} marked present by hand` });
      setTimeout(() => setFeedback(null), 4000);
      setChosen(null);
      setStudentQuery('');
      setManualReason('');
      setManualOpen(false);
    } catch (err: any) {
      // Shown in the form, not the camera toast: the toast clears itself after
      // four seconds and the admin needs to read why the write was refused.
      const msg = err?.message || '';
      if (msg.includes('already') || msg.includes('recorded')) {
        setManualError(`${chosen.name} is already marked for ${MEAL_LABEL[manualMeal].toLowerCase()} today.`);
      } else if (msg.includes('published') || msg.includes('FROZEN')) {
        setManualError('This month is published. Reopen the bill before changing attendance.');
      } else {
        setManualError(msg || 'Could not record it. Check the connection and try again.');
      }
    } finally {
      setMarkingBusy(false);
    }
  };

  return (
    <div className="scanner-page">
      {/* ── Camera ─────────────────────────────────────────────────── */}
      <div className="scanner-viewport">
        <div
          id="scanner-qr-div"
          className="absolute inset-0 w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
        />

        <div className="scanner-outer-border" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div style={{ width: 220, height: 220, position: 'relative' }}>
            <div className="scanner-corner" style={{ top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderRadius: '8px 0 0 0' }} />
            <div className="scanner-corner" style={{ top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderRadius: '0 8px 0 0' }} />
            <div className="scanner-corner" style={{ bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderRadius: '0 0 0 8px' }} />
            <div className="scanner-corner" style={{ bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderRadius: '0 0 8px 0' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.06)', borderRadius: 8 }} />
          </div>
        </div>

        {/* Camera state */}
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => (cameraActive ? stopCamera() : startCamera())}
            className="px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer flex items-center gap-1.5"
            style={{
              background: 'rgba(255,255,255,0.94)',
              color: 'var(--text-dark)',
              fontFamily: 'Nunito, sans-serif',
              border: 'none',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: cameraActive ? 'var(--green)' : 'var(--red)' }}
            />
            {cameraActive ? 'Live' : 'Paused'}
          </button>
        </div>

        {/* Result toast */}
        {feedback && (
          <div
            className="absolute top-4 left-4 right-24 z-30 px-4 py-2.5 rounded-xl flex items-center gap-2 animate-fade-in"
            style={{
              background: feedback.ok ? 'rgba(231,244,233,0.97)' : 'rgba(253,236,234,0.97)',
              border: `1px solid ${feedback.ok ? '#A9D6B1' : '#F6C8C3'}`,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 19, color: feedback.ok ? 'var(--green)' : 'var(--red)' }}
            >
              {feedback.ok ? 'check_circle' : 'error'}
            </span>
            <span
              className="text-[13px] font-bold"
              style={{ color: feedback.ok ? 'var(--green)' : 'var(--red)', fontFamily: 'Nunito, sans-serif' }}
            >
              {feedback.msg}
            </span>
          </div>
        )}
      </div>

      {/* ── Log panel ──────────────────────────────────────────────── */}
      <div className="scanner-panel flex flex-col">
        {/* Sheet handle — mobile affordance only */}
        <div
          className="only-mobile mx-auto mb-4 rounded-full"
          style={{ width: 40, height: 4, background: 'var(--card-border)' }}
        />

        <div className="flex gap-2 mb-5">
          <input
            type="text"
            value={manualToken}
            onChange={e => setManualToken(e.target.value)}
            placeholder="Paste a token manually"
            className="stitch-input flex-1"
            style={{ fontSize: '0.8rem' }}
            onKeyDown={e => { if (e.key === 'Enter' && manualToken.trim()) void handleToken(manualToken.trim()); }}
          />
          <button
            onClick={() => void handleToken(manualToken.trim())}
            disabled={!manualToken.trim()}
            className="btn-primary shrink-0"
            style={{ padding: '10px 18px' }}
          >
            Verify
          </button>
        </div>

        {/* ── Mark by name — administrators only ─────────────────────── */}
        {canMarkManually && (
          <div
            className="mb-5 rounded-xl"
            style={{ background: 'var(--orange-soft)', border: '1px solid var(--orange-light)' }}
          >
            <button
              onClick={() => { setManualOpen(o => !o); setManualError(null); }}
              aria-expanded={manualOpen}
              className="w-full flex items-center gap-2 px-4 py-3 cursor-pointer text-left"
              style={{ background: 'none', border: 'none' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 19, color: 'var(--orange-ink)' }}>
                person_add
              </span>
              <span
                className="text-[13.5px] font-bold flex-1"
                style={{ color: 'var(--orange-ink)', fontFamily: 'Nunito, sans-serif' }}
              >
                Mark a student present by name
              </span>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20, color: 'var(--orange-ink)',
                         transform: manualOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
              >
                expand_more
              </span>
            </button>

            {manualOpen && (
              <div className="px-4 pb-4 flex flex-col gap-3">
                <p className="text-[12px] font-semibold" style={{ color: 'var(--text-body)' }}>
                  For a student whose pass will not scan. This writes the same attendance a scan
                  would, for <strong>today</strong>, and is recorded against your name.
                </p>

                {/* Student picker */}
                <div>
                  <label
                    htmlFor="manual-student"
                    className="block text-[12px] font-bold mb-1"
                    style={{ color: 'var(--text-dark)' }}
                  >
                    Student
                  </label>
                  {chosen ? (
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                      style={{ background: 'var(--card)', border: '1px solid var(--orange-light)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text-dark)' }}>
                          {chosen.name}
                        </p>
                        <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                          {chosen.registration_number}
                        </p>
                      </div>
                      <button
                        onClick={() => { setChosen(null); setStudentQuery(''); }}
                        className="text-[12px] font-bold cursor-pointer shrink-0"
                        style={{ color: 'var(--orange-ink)', background: 'none', border: 'none' }}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        id="manual-student"
                        type="text"
                        value={studentQuery}
                        onChange={e => setStudentQuery(e.target.value)}
                        placeholder={roll.length ? 'Type a name or registration number' : 'Loading the roll…'}
                        disabled={!roll.length}
                        className="stitch-input w-full"
                        style={{ fontSize: '0.85rem' }}
                        autoComplete="off"
                      />
                      {studentQuery.trim() && (
                        <div
                          className="mt-1 rounded-xl overflow-hidden"
                          style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
                        >
                          {matches.length === 0 ? (
                            <p className="text-[12px] font-semibold px-3 py-2.5" style={{ color: 'var(--text-muted)' }}>
                              No active student matches that.
                            </p>
                          ) : matches.map(m => (
                            <button
                              key={m.id}
                              onClick={() => { setChosen(m); setManualError(null); }}
                              className="w-full text-left px-3 py-2 cursor-pointer"
                              style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--line-soft)' }}
                            >
                              <span className="block text-[13px] font-bold" style={{ color: 'var(--text-dark)' }}>
                                {m.name}
                              </span>
                              <span className="block text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                                {m.registration_number}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Meal */}
                <div>
                  <span className="block text-[12px] font-bold mb-1" style={{ color: 'var(--text-dark)' }}>
                    Meal
                  </span>
                  <div className="flex gap-1.5">
                    {MEALS.map(m => (
                      <button
                        key={m}
                        onClick={() => setManualMeal(m)}
                        aria-pressed={manualMeal === m}
                        className="flex-1 rounded-lg py-2 text-[12.5px] font-bold cursor-pointer"
                        style={manualMeal === m
                          ? { background: 'var(--orange)', color: 'var(--on-orange)', border: '1px solid var(--orange)' }
                          : { background: 'var(--card)', color: 'var(--text-body)', border: '1px solid var(--line)' }}
                      >
                        {MEAL_LABEL[m]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label
                    htmlFor="manual-reason"
                    className="block text-[12px] font-bold mb-1"
                    style={{ color: 'var(--text-dark)' }}
                  >
                    Why is this being entered by hand?
                  </label>
                  <input
                    id="manual-reason"
                    type="text"
                    value={manualReason}
                    onChange={e => setManualReason(e.target.value)}
                    placeholder="e.g. phone battery dead, ID checked in person"
                    className="stitch-input w-full"
                    style={{ fontSize: '0.85rem' }}
                    maxLength={500}
                    onKeyDown={e => { if (e.key === 'Enter') void markManually(); }}
                  />
                </div>

                {manualError && (
                  <p
                    className="text-[12px] font-bold rounded-lg px-3 py-2"
                    style={{ color: 'var(--red)', background: '#FDECEA', border: '1px solid #F6C8C3' }}
                  >
                    {manualError}
                  </p>
                )}

                <button
                  onClick={() => void markManually()}
                  disabled={!chosen || manualReason.trim().length < 3 || markingBusy}
                  className={!chosen || manualReason.trim().length < 3 || markingBusy ? 'btn-inert' : 'btn-primary'}
                  style={{ padding: '11px 18px' }}
                >
                  {markingBusy
                    ? 'Recording…'
                    : `Mark present for ${MEAL_LABEL[manualMeal].toLowerCase()}`}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-[17px] font-bold" style={{ color: 'var(--text-dark)' }}>
            Recent scans
          </h3>
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{
              background: 'var(--orange-soft)',
              color: 'var(--orange-ink)',
              border: '1px solid var(--orange-light)',
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            {scanLogs.length} today
          </span>
        </div>

        {scanLogs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <EmptyPlateCartoon size={68} />
            <p
              className="text-[13px] font-bold text-center"
              style={{ color: 'var(--text-muted)', fontFamily: 'Nunito, sans-serif' }}
            >
              No scans yet — point the camera at a mess pass.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {scanLogs.map(log => (
              <div key={log.id} className="scan-row">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--green-light)' }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16, color: 'var(--green)' }}
                  >
                    check
                  </span>
                </span>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-bold truncate"
                    style={{ color: 'var(--text-dark)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    {log.studentName}
                  </p>
                  <p className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {log.regNo} · {log.meal}
                  </p>
                </div>

                <span
                  className="text-[11px] font-semibold shrink-0"
                  style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {log.timestamp}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
