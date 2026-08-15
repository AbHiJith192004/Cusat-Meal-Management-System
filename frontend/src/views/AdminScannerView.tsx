import React, { useState, useEffect, useRef } from 'react';
import { ScanLog } from '../types';
import { attendanceApi } from '../services/api';
import { Html5Qrcode } from 'html5-qrcode';

interface AdminScannerViewProps {
  scanLogs: ScanLog[];
  onAddScanLog: (log: ScanLog) => void;
}

export const AdminScannerView: React.FC<AdminScannerViewProps> = ({ scanLogs, onAddScanLog }) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [activeFeedback, setActiveFeedback] = useState<{
    type: 'success' | 'duplicate' | 'skipped';
    title: string;
    details: string;
  } | null>(null);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const qrContainerId = 'reader-container';
  const isScanningRef = useRef(false);
  const lastScannedQr = useRef<string | null>(null);
  const lastScannedTime = useRef<number>(0);
  const recentlyScannedRegNos = useRef<Map<string, number>>(new Map());

  const handleScanToken = async (qrToken: string) => {
    const now = Date.now();
    // Prevent duplicate scans of exact same token within 5 seconds
    if (lastScannedQr.current === qrToken && now - lastScannedTime.current < 5000) {
      return;
    }

    lastScannedQr.current = qrToken;
    lastScannedTime.current = now;

    try {
      const verifyRes = await attendanceApi.verifyQr(qrToken);
      const regNo = verifyRes.registration_number;

      // Check if this student was successfully scanned in the last 10 seconds
      const lastStudentScan = recentlyScannedRegNos.current.get(regNo);
      if (lastStudentScan && now - lastStudentScan < 10000) {
        // Silently skip duplicate scan of same student
        return;
      }

      await attendanceApi.confirmQr(verifyRes.verification_id);
      recentlyScannedRegNos.current.set(regNo, now);

      const newLog: ScanLog = {
        id: `SCAN-${Date.now()}`,
        studentName: verifyRes.student_name,
        regNo: verifyRes.registration_number,
        meal: verifyRes.meal_type || 'Meal',
        status: 'Success',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timeAgo: 'Just now',
      };

      onAddScanLog(newLog);
      setActiveFeedback({
        type: 'success',
        title: 'Attendance Recorded!',
        details: `${verifyRes.student_name} (${verifyRes.registration_number})`,
      });
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('already') || msg.includes('recorded')) {
        setActiveFeedback({
          type: 'skipped',
          title: 'Already Checked In',
          details: 'This student has already checked in for this meal.',
        });
      } else {
        setActiveFeedback({
          type: 'duplicate',
          title: 'Verification Failed',
          details: msg || 'Already scanned or expired token.',
        });
      }
    }

    setTimeout(() => setActiveFeedback(null), 3500);
  };

  const startCamera = async () => {
    if (isScanningRef.current) return;
    try {
      if (!html5QrcodeRef.current) {
        html5QrcodeRef.current = new Html5Qrcode(qrContainerId);
      }
      
      const html5Qrcode = html5QrcodeRef.current;
      
      await html5Qrcode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleScanToken(decodedText);
        },
        () => {} // Ignore scan errors (like when no QR is in frame)
      );
      setCameraActive(true);
      isScanningRef.current = true;
    } catch (err: any) {
      console.error('Camera Start Error:', err);
    }
  };

  const stopCamera = async () => {
    if (html5QrcodeRef.current && isScanningRef.current) {
      try {
        await html5QrcodeRef.current.stop();
        // html5QrcodeRef.current.clear();
        setCameraActive(false);
        isScanningRef.current = false;
      } catch (err) {
        console.error('Failed to stop camera', err);
      }
    }
  };

  useEffect(() => {
    // Auto-start camera on mount
    startCamera();

    return () => {
      // Clean up camera on unmount
      if (html5QrcodeRef.current && isScanningRef.current) {
        html5QrcodeRef.current.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 flex flex-col relative bg-[#151c27] h-full min-h-[600px] overflow-hidden">
      {/* Scanner Viewport */}
      <div className="relative flex-1 bg-[#151c27] overflow-hidden flex flex-col">
        {/* WebCam Feed Element - Made to fill viewport completely */}
        <div 
          id={qrContainerId} 
          className="absolute inset-0 w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
        ></div>

        {/* Scanner Overlay Box */}
        {cameraActive && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64 border-2 border-[#2563eb] rounded-lg overflow-hidden scanner-frame pointer-events-auto">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#004ac6] rounded-tl-lg"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#004ac6] rounded-tr-lg"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#004ac6] rounded-bl-lg"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#004ac6] rounded-br-lg"></div>
              <div className="absolute w-full h-1 bg-[#2563eb] animate-scan shadow-[0_0_8px_2px_rgba(37,99,235,0.5)]"></div>
            </div>
          </div>
        )}

        {/* Top Overlay Controls */}
        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
          <div className="bg-[#ffffff]/90 backdrop-blur-sm px-3 py-2 rounded-full shadow-md pointer-events-auto flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-[#006c49] animate-pulse' : 'bg-[#ba1a1a]'}`}></span>
            <span className="text-xs font-semibold text-[#151c27]">
              {cameraActive ? 'Camera Live (Scanning)' : 'Camera Off'}
            </span>
          </div>

          <div className="flex gap-2 pointer-events-auto">
            <button
              onClick={() => (cameraActive ? stopCamera() : startCamera())}
              className={`p-2.5 rounded-full backdrop-blur-sm shadow-md text-xs font-bold transition-colors cursor-pointer flex items-center justify-center ${
                cameraActive ? 'bg-[#ba1a1a] text-white hover:bg-[#93000a]' : 'bg-[#2563eb] text-white hover:bg-[#004ac6]'
              }`}
              title={cameraActive ? "Stop Camera" : "Start Camera"}
            >
              <span className="material-symbols-outlined text-[20px]">
                {cameraActive ? 'videocam_off' : 'photo_camera'}
              </span>
            </button>
          </div>
        </div>

        {/* Feedback Overlay Alerts */}
        {activeFeedback && (
          <div className="absolute top-20 left-4 right-4 z-30 animate-bounce">
            <div
              className={`rounded-xl p-4 shadow-lg flex items-center gap-3 border ${
                activeFeedback.type === 'success'
                  ? 'bg-[#6cf8bb] text-[#00714d] border-[#00714d]/30'
                  : 'bg-[#ffdad6] text-[#93000a] border-[#ba1a1a]/30'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {activeFeedback.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <div>
                <p className="font-bold text-sm">{activeFeedback.title}</p>
                <p className="text-xs opacity-90">{activeFeedback.details}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Scans Section */}
      <div className="bg-[#ffffff] rounded-t-3xl -mt-6 z-30 relative shadow-[0_-4px_15px_rgba(0,0,0,0.05)] flex-none pb-20 pt-2 px-4 max-h-[320px] overflow-y-auto">
        <div className="w-12 h-1 bg-[#c3c6d7] rounded-full mx-auto my-2"></div>
        <div className="py-2 flex justify-between items-center sticky top-0 bg-white z-10 border-b border-[#f0f3ff]">
          <h2 className="text-[18px] font-semibold text-[#151c27]">Recent Scans</h2>
          <span className="text-[#004ac6] text-xs font-semibold">{scanLogs.length} Records</span>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          {scanLogs.length === 0 ? (
            <div className="text-center py-6 text-[#737686] text-sm">No scans yet today.</div>
          ) : (
            scanLogs.map((log) => (
              <div
                key={log.id}
                className="bg-[#f9f9ff] p-3 rounded-lg border border-[#c3c6d7]/50 shadow-2xs flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#6cf8bb] text-[#00714d] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">person</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[#151c27]">{log.studentName}</p>
                    <p className="text-xs text-[#434655]">Reg: {log.regNo}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="px-2.5 py-0.5 rounded-full font-semibold text-[10px] bg-[#6cf8bb]/50 text-[#00714d]">
                    {log.status}
                  </span>
                  <p className="text-[11px] text-[#737686] mt-0.5">{log.timeAgo}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
