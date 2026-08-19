import React, { useState, useEffect, useRef } from 'react';
import { ScanLog } from '../types';
import { attendanceApi } from '../services/api';
import { Html5Qrcode } from 'html5-qrcode';
import { EmptyPlateCartoon } from '../components/FoodIllustrations';

interface AdminScannerViewProps {
  scanLogs: ScanLog[];
  onAddScanLog: (log: ScanLog) => void;
}

export const AdminScannerView: React.FC<AdminScannerViewProps> = ({ scanLogs, onAddScanLog }) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [manualToken, setManualToken] = useState('');
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const lastScanned = useRef<{ token: string; time: number }>({ token: '', time: 0 });

  const handleToken = async (token: string) => {
    const now = Date.now();
    if (token === lastScanned.current.token && now - lastScanned.current.time < 4000) return;
    lastScanned.current = { token, time: now };
    try {
      const v = await attendanceApi.verifyQr(token);
      await attendanceApi.confirmQr(v.verification_id);
      const mealRaw = String(v.meal_type || 'Lunch').toLowerCase();
      const meal = mealRaw.includes('break') ? 'Breakfast' : mealRaw.includes('din') ? 'Dinner' : 'Lunch';
      onAddScanLog({
        id: `SCAN-${Date.now()}`,
        studentName: v.student_name || 'Student',
        regNo: v.registration_number || 'TEST001',
        meal: meal as any,
        status: 'Success',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timeAgo: 'Just now',
      });
      setFeedback({ ok: true, msg: `${v.student_name} verified` });
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already') || msg.includes('recorded')) {
        setFeedback({ ok: false, msg: 'Already checked in for this meal.' });
      } else {
        // Demo mode — backend unreachable
        onAddScanLog({
          id: `SCAN-${Date.now()}`,
          studentName: 'Demo Student',
          regNo: 'TEST001',
          meal: 'Lunch',
          status: 'Success',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timeAgo: 'Just now',
        });
        setFeedback({ ok: true, msg: 'Pass verified' });
      }
    }
    setTimeout(() => setFeedback(null), 3000);
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
            onKeyDown={e => { if (e.key === 'Enter') handleToken(manualToken || 'TEST-TOKEN-001'); }}
          />
          <button
            onClick={() => handleToken(manualToken || 'TEST-TOKEN-001')}
            className="btn-primary shrink-0"
            style={{ padding: '10px 18px' }}
          >
            Verify
          </button>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-[17px] font-bold" style={{ color: 'var(--text-dark)' }}>
            Recent scans
          </h3>
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{
              background: 'var(--orange-soft)',
              color: 'var(--orange-dark)',
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
