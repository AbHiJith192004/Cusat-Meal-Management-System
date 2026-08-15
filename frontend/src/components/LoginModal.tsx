import React, { useState } from 'react';
import { authApi, studentApi } from '../services/api';

interface LoginModalProps {
  isOpen: boolean;
  isFullScreen?: boolean;
  onClose: () => void;
  onLoginSuccess: (role: 'student' | 'admin', name: string, regNo: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  isFullScreen = false,
  onClose,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'activate' | 'reset'>('login');
  const [regNo, setRegNo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const trimmedRegNo = regNo.trim();

      if (mode === 'reset') {
        if (password !== confirmPassword) {
          setErrorMsg('New passwords do not match. Please re-enter.');
          setLoading(false);
          return;
        }
        const res = await authApi.resetPasswordByDob(trimmedRegNo, dob, password);
        setSuccessMsg(res.message || 'Password reset successfully! Please sign in.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setLoading(false);
        return;
      }

      if (mode === 'activate') {
        await authApi.activate(trimmedRegNo, dob, password);
      }

      await authApi.login(trimmedRegNo, password);

      let userRole: 'admin' | 'student' = 'student';
      let userName = trimmedRegNo;
      let finalRegNo = trimmedRegNo;

      try {
        const userProfile = await studentApi.getProfile();
        if (userProfile) {
          const r = String(userProfile.role || '').toUpperCase();
          if (r === 'ADMIN' || r === 'SUPER_ADMIN') {
            userRole = 'admin';
          } else {
            userRole = 'student';
          }
          userName = userProfile.name || trimmedRegNo;
          finalRegNo = userProfile.registration_number || trimmedRegNo;
        }
      } catch (e) {
        const isFallbackAdmin = trimmedRegNo.toUpperCase().includes('ADMIN') || trimmedRegNo.toUpperCase().includes('SADMIN');
        userRole = isFallbackAdmin ? 'admin' : 'student';
      }

      onLoginSuccess(userRole, userName, finalRegNo);
      onClose();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('not yet activated')) {
        setErrorMsg('Account not yet activated. Click "First time? Activate your student account" below.');
      } else if (msg.includes('verification failed') || msg.includes('does not match')) {
        setErrorMsg('Date of Birth verification failed. Please check your DOB details.');
      } else if (msg.includes('Invalid') || msg.includes('INVALID') || msg.includes('Invalid credentials')) {
        setErrorMsg('Wrong Registration No, Date of Birth, or Password. Please try again.');
      } else if (msg.includes('waking up') || msg.includes('cold start') || msg.includes('unreachable')) {
        setErrorMsg('Backend server is waking up from idle (Render cold start). Please wait 5 seconds and click Sign In again.');
      } else if (msg.includes('INTERNAL_ERROR') || msg.includes('HTTP Error 500')) {
        setErrorMsg('Server database connection is initializing. Please click Sign In once more.');
      } else if (msg.includes('rate') || msg.includes('RATE')) {
        setErrorMsg('Too many attempts. Please wait a moment and try again.');
      } else if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
        setErrorMsg('Account not found. Please check your Registration No.');
      } else if (msg.includes('suspended') || msg.includes('SUSPENDED')) {
        setErrorMsg('Account suspended. Please contact the mess office.');
      } else {
        setErrorMsg(msg || 'Authentication failed. Please check your details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const containerClasses = isFullScreen
    ? 'min-h-screen w-full flex items-center justify-center p-4 bg-[#f9f9ff] animate-fade-in'
    : 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in';

  return (
    <div className={containerClasses}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-5 border border-[#c3c6d7] relative">
        {!isFullScreen && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[#737686] hover:text-[#151c27]"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}

        <div className="text-center space-y-1">
          <div className="w-14 h-14 rounded-2xl bg-[#2563eb]/10 text-[#004ac6] flex items-center justify-center mx-auto mb-2 border border-[#2563eb]/20 shadow-xs">
            <span className="material-symbols-outlined text-[32px]">
              {mode === 'reset' ? 'lock_reset' : 'restaurant'}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-[#151c27]">
            {mode === 'reset'
              ? 'Reset Password'
              : mode === 'activate'
              ? 'Activate Your Account'
              : 'Welcome to MessConnect'}
          </h2>
          <p className="text-xs text-[#434655]">
            {mode === 'reset'
              ? 'Verify your Date of Birth to create a new password'
              : mode === 'activate'
              ? 'First-time setup — enter your details to get started'
              : 'Sign in with your Registration No and Password to continue'}
          </p>
        </div>

        {successMsg && (
          <div className="p-3 bg-[#e6f4ea] text-[#006c49] border border-[#006c49]/30 rounded-xl text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-[#ffdad6] text-[#93000a] rounded-xl text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1">Registration Number</label>
            <input
              type="text"
              required
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="Enter your Registration No"
              className="w-full p-3 bg-[#f0f3ff] border border-[#c3c6d7] rounded-xl text-sm font-medium focus:border-[#2563eb] outline-none text-[#151c27]"
            />
          </div>

          {(mode === 'activate' || mode === 'reset') && (
            <div>
              <label className="block text-xs font-semibold text-[#434655] mb-1">
                Date of Birth (DOB for Verification)
              </label>
              <input
                type="date"
                required
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full p-3 bg-[#f0f3ff] border border-[#c3c6d7] rounded-xl text-sm font-medium outline-none text-[#151c27]"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-[#434655]">
                {mode === 'reset' ? 'New Password' : 'Password'}
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs text-[#2563eb] font-semibold hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'reset' ? 'Enter new password (min 6 chars)' : 'Enter your password'}
              className="w-full p-3 bg-[#f0f3ff] border border-[#c3c6d7] rounded-xl text-sm font-medium focus:border-[#2563eb] outline-none text-[#151c27]"
            />
          </div>

          {mode === 'reset' && (
            <div>
              <label className="block text-xs font-semibold text-[#434655] mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full p-3 bg-[#f0f3ff] border border-[#c3c6d7] rounded-xl text-sm font-medium focus:border-[#2563eb] outline-none text-[#151c27]"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#2563eb] text-white font-semibold text-sm rounded-xl hover:bg-[#004ac6] transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">refresh</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">
                  {mode === 'reset' ? 'key' : 'login'}
                </span>
                <span>
                  {mode === 'reset'
                    ? 'Verify DOB & Reset Password'
                    : mode === 'activate'
                    ? 'Activate & Sign In'
                    : 'Sign In'}
                </span>
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-[#f0f3ff] flex flex-col gap-1.5">
          {mode === 'login' ? (
            <button
              onClick={() => {
                setMode('activate');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-xs text-[#2563eb] font-semibold hover:underline cursor-pointer"
            >
              First time? Activate your student account
            </button>
          ) : (
            <button
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-xs text-[#2563eb] font-semibold hover:underline cursor-pointer"
            >
              Already have password? Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
