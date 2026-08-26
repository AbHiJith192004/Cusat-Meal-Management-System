import React, { useState } from 'react';
import { authApi, studentApi } from '../services/api';
import { ChefMascot, DosaCartoon } from './FoodIllustrations';

interface LoginModalProps {
  isOpen: boolean;
  isFullScreen?: boolean;
  onClose: () => void;
  onLoginSuccess: (role: 'student' | 'admin', name: string, regNo: string) => void;
}

/**
 * Quick-fill buttons for the seeded demo accounts.
 *
 * These only populate the form - the person still has to submit, and the
 * server still authenticates normally. They are gated to development builds
 * so seeded credentials are not shipped in a production bundle; Vite replaces
 * `import.meta.env.DEV` with a literal at build time, so the whole block is
 * removed by tree-shaking in a production build.
 */
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV;

const DEMO_ACCOUNTS = [
  { label: 'Student', reg: 'TEST001', icon: 'school' },
  { label: 'Admin', reg: 'ADMIN001', icon: 'restaurant' },
  { label: 'Warden', reg: 'SADMIN001', icon: 'shield_person' },
];

const DEMO_PASSWORD = 'password123';

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

  const fill = (r: string, p: string) => {
    setRegNo(r);
    setPassword(p);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const trimmed = regNo.trim();
      if (mode === 'reset') {
        if (password !== confirmPassword) {
          setErrorMsg('Passwords do not match.');
          setLoading(false);
          return;
        }
        const res = await authApi.resetPasswordByDob(trimmed, dob, password);
        setSuccessMsg(res.message || 'Password reset. Please sign in.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setLoading(false);
        return;
      }
      if (mode === 'activate') await authApi.activate(trimmed, dob, password);
      await authApi.login(trimmed, password);
      let role: 'admin' | 'student' = 'student';
      let name = trimmed;
      let reg = trimmed;
      try {
        const p = await studentApi.getProfile();
        if (p) {
          const r = String(p.role || '').toUpperCase();
          role = r === 'ADMIN' || r === 'SUPER_ADMIN' ? 'admin' : 'student';
          name = p.name || trimmed;
          reg = p.registration_number || trimmed;
        }
      } catch {
        role =
          trimmed.toUpperCase().includes('ADMIN') || trimmed.toUpperCase().includes('SADMIN')
            ? 'admin'
            : 'student';
      }
      onLoginSuccess(role, name, reg);
      onClose();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('not yet activated')) setErrorMsg('This account is not activated yet — use "Activate your account" below.');
      else if (msg.includes('Invalid') || msg.includes('INVALID')) setErrorMsg('Wrong ID or password. Please try again.');
      else setErrorMsg(msg || 'Sign in failed. Check your details.');
    } finally {
      setLoading(false);
    }
  };

  const heading =
    mode === 'reset' ? 'Reset your password' : mode === 'activate' ? 'Activate your account' : 'Sign in';
  const blurb =
    mode === 'reset'
      ? 'Confirm your date of birth to set a new password.'
      : mode === 'activate'
      ? 'First-time setup for your mess account.'
      : 'Meal planning and your dining pass, in one place.';

  const form = (
    <div className="w-full max-w-[400px]">
      {/* Mobile brand lockup */}
      <div className="flex flex-col items-center mb-5 lg:hidden">
        <div className="float-gentle">
          <ChefMascot size={68} />
        </div>
        <h1 className="font-display text-[22px] font-bold mt-2" style={{ color: 'var(--text-dark)' }}>
          CUSAT MessConnect
        </h1>
      </div>

      <div
        className="rounded-3xl p-6 sm:p-7 relative lg:rounded-2xl lg:p-8"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--card-border)',
          boxShadow: 'var(--card-shadow-lg)',
        }}
      >
        {!isFullScreen && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 cursor-pointer"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}

        <h2 className="font-display text-[24px] font-bold" style={{ color: 'var(--text-dark)' }}>
          {heading}
        </h2>
        <p className="text-[13px] font-semibold mt-1 mb-5" style={{ color: 'var(--text-muted)' }}>
          {blurb}
        </p>

        {/* Demo accounts - development builds only */}
        {SHOW_DEMO_ACCOUNTS && mode === 'login' && (
          <div className="mb-5">
            <p className="section-label mb-2">Quick demo</p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map(item => {
                const active = regNo === item.reg;
                return (
                  <button
                    key={item.reg}
                    type="button"
                    onClick={() => fill(item.reg, DEMO_PASSWORD)}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-[12px] font-bold cursor-pointer transition-colors lg:rounded-lg"
                    style={{
                      background: active ? 'var(--orange-soft)' : 'var(--bg-alt)',
                      color: active ? 'var(--orange-dark)' : 'var(--text-body)',
                      border: `1px solid ${active ? 'var(--orange-light)' : 'var(--line)'}`,
                      fontFamily: 'Nunito, sans-serif',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {successMsg && (
          <div
            className="mb-4 px-3.5 py-3 rounded-xl text-xs font-bold flex items-start gap-2"
            style={{ background: 'var(--green-light)', color: 'var(--green)', border: '1px solid #A9D6B1' }}
            role="status"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>check_circle</span>
            <span className="flex-1">{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div
            className="mb-4 px-3.5 py-3 rounded-xl text-xs font-bold flex items-start gap-2"
            style={{ background: '#FDECEA', color: 'var(--red)', border: '1px solid #F6C8C3' }}
            role="alert"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>error</span>
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label
              htmlFor="login-reg"
              className="block text-[12px] font-black mb-1.5"
              style={{ color: 'var(--text-body)' }}
            >
              Registration number
            </label>
            <input
              id="login-reg"
              type="text"
              required
              autoComplete="username"
              value={regNo}
              onChange={e => setRegNo(e.target.value)}
              placeholder="e.g. TEST001"
              className="stitch-input"
            />
          </div>

          {(mode === 'activate' || mode === 'reset') && (
            <div>
              <label
                htmlFor="login-dob"
                className="block text-[12px] font-black mb-1.5"
                style={{ color: 'var(--text-body)' }}
              >
                Date of birth
              </label>
              <input
                id="login-dob"
                type="date"
                required
                value={dob}
                onChange={e => setDob(e.target.value)}
                className="stitch-input"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-pw" className="text-[12px] font-black" style={{ color: 'var(--text-body)' }}>
                {mode === 'reset' ? 'New password' : 'Password'}
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setErrorMsg(null); }}
                  className="btn-link text-[12px]"
                >
                  Forgot?
                </button>
              )}
            </div>
            <input
              id="login-pw"
              type="password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="stitch-input"
            />
          </div>

          {mode === 'reset' && (
            <div>
              <label
                htmlFor="login-pw2"
                className="block text-[12px] font-black mb-1.5"
                style={{ color: 'var(--text-body)' }}
              >
                Confirm password
              </label>
              <input
                id="login-pw2"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="stitch-input"
              />
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-1.5">
            {loading ? (
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 19 }}>
                progress_activity
              </span>
            ) : mode === 'reset' ? (
              'Verify and reset'
            ) : mode === 'activate' ? (
              'Activate and sign in'
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <div className="text-center mt-5 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
          {mode === 'login' ? (
            <button
              onClick={() => { setMode('activate'); setErrorMsg(null); }}
              className="btn-link text-[12.5px]"
            >
              First time here? Activate your account
            </button>
          ) : (
            <button
              onClick={() => { setMode('login'); setErrorMsg(null); }}
              className="btn-link text-[12.5px]"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ── Modal presentation (opened over the app) ──────────────────────────
  if (!isFullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-5"
        style={{ background: 'rgba(45,26,14,0.35)', backdropFilter: 'blur(6px)' }}
      >
        {form}
      </div>
    );
  }

  // ── Full-screen sign-in page ──────────────────────────────────────────
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Editorial panel — desktop only. Mobile has no room for it. */}
      <aside
        className="hidden lg:flex flex-col justify-between p-12"
        style={{ background: 'var(--bg)', borderRight: '1px solid var(--line)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'var(--orange-soft)', border: '1px solid var(--orange-light)' }}
          >
            🍴
          </div>
          <span className="font-display text-[16px] font-bold" style={{ color: 'var(--text-dark)' }}>
            CUSAT MessConnect
          </span>
        </div>

        <div className="max-w-[420px]">
          <DosaCartoon size={168} />
          <h2
            className="font-display text-[34px] font-bold mt-6 leading-tight"
            style={{ color: 'var(--text-dark)' }}
          >
            The hostel mess,
            <br />
            without the paperwork.
          </h2>
          <ul className="mt-6 flex flex-col gap-3">
            {[
              ['event_available', 'Opt out of meals before the 9 PM cutoff'],
              ['confirmation_number', 'A signed QR pass instead of a paper register'],
              ['receipt_long', 'Monthly bills and fines reconciled automatically'],
            ].map(([icon, text]) => (
              <li key={icon} className="flex items-start gap-3">
                <span
                  className="material-symbols-outlined shrink-0"
                  style={{ fontSize: 19, color: 'var(--orange)' }}
                >
                  {icon}
                </span>
                <span className="text-[14px] font-semibold" style={{ color: 'var(--text-body)' }}>
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          Cochin University of Science and Technology · Hostel Mess
        </p>
      </aside>

      {/* Form column */}
      <div
        className="min-h-screen flex items-center justify-center p-5 lg:p-12"
        style={{ background: 'var(--bg-alt)' }}
      >
        {form}
      </div>
    </div>
  );
};
