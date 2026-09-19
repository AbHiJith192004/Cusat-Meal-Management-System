import React, { useState, useEffect, useRef } from 'react';
import { studentApi } from '../services/api';
import { ChefMascot, ART_CREDIT } from '../components/FoodIllustrations';
import { Modal } from '../components/Modal';

interface ProfileViewProps {
  studentName: string;
  regNo: string;
  avatar: string;
  userRole?: 'student' | 'admin' | 'super_admin';
  onUpdateName: (name: string) => void;
  onUpdateAvatar: (url: string) => void;
  onLogout: () => void;
}

interface ProfileData {
  name: string;
  registration_number: string;
  role: string;
  account_status: string;
  profile?: { mess_id?: string; student_type?: string } | null;
  capabilities?: { attendance_scanner?: boolean };
}

const STUDENT_TYPE_LABEL: Record<string, string> = {
  HOSTELLER: 'Hosteller — all meals included',
  DAY_SCHOLAR: 'Day scholar — mess meals as opted in',
  OUTMESS: 'Out-mess — not billed for mess meals',
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  ACTIVE: { bg: 'var(--green-light)', fg: 'var(--green)' },
  PENDING: { bg: '#FFF1E6', fg: 'var(--orange-dark)' },
  SUSPENDED: { bg: '#FDECEA', fg: 'var(--red)' },
  INACTIVE: { bg: '#FDECEA', fg: 'var(--red)' },
};

/**
 * Every row here is driven by what /me and /me/dashboard actually return.
 * Where the server has not answered yet the row says so rather than showing a
 * plausible number - a profile that invents an attendance count is worse than
 * one that admits it does not know.
 */
export const ProfileView: React.FC<ProfileViewProps> = ({
  studentName,
  regNo,
  avatar,
  userRole = 'student',
  onUpdateAvatar,
  onLogout,
}) => {
  const [notifications, setNotifications] = useState(
    () => localStorage.getItem('messconnect_cutoff_reminders') !== 'off',
  );
  const [showLogout, setShowLogout] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(avatar);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<{ done: number; skipped: number; upcoming: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  useEffect(() => {
    const saved = localStorage.getItem('messconnect_avatar');
    if (saved) {
      setCurrentAvatar(saved);
      onUpdateAvatar(saved);
    }

    let active = true;
    Promise.all([
      studentApi.getProfile(),
      isAdmin ? Promise.resolve(null) : studentApi.getDashboard(),
    ])
      .then(([identity, dashboard]) => {
        if (!active) return;
        setProfile(identity);
        if (dashboard?.overall_stats) {
          setStats({
            done: dashboard.overall_stats.meals_done ?? 0,
            skipped: dashboard.overall_stats.meals_skipped ?? 0,
            upcoming: dashboard.overall_stats.meals_booked ?? 0,
          });
        }
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load the profile.');
      });
    return () => { active = false; };
  }, [isAdmin]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      setCurrentAvatar(b64);
      onUpdateAvatar(b64);
      localStorage.setItem('messconnect_avatar', b64);
    };
    reader.readAsDataURL(file);
  };

  const toggleReminders = () => {
    const next = !notifications;
    setNotifications(next);
    localStorage.setItem('messconnect_cutoff_reminders', next ? 'on' : 'off');
  };

  const displayName = profile?.name || studentName;
  const registration = profile?.registration_number || regNo;
  const serverRole = profile?.role || (isAdmin ? 'ADMIN' : 'STUDENT');
  const roleLabel =
    serverRole === 'SUPER_ADMIN' ? 'Super Warden'
    : serverRole === 'ADMIN' ? 'Mess Admin'
    : 'Hostel Student';

  const status = profile?.account_status;
  const tone = STATUS_TONE[status || ''] || { bg: 'var(--bg)', fg: 'var(--text-muted)' };
  const studentType = profile?.profile?.student_type;

  const rows: Array<{
    icon: string;
    label: string;
    sub: string;
    value?: string;
    valueTone?: { bg: string; fg: string };
    toggle?: boolean;
    chevron?: boolean;
  }> = [
    {
      icon: 'verified_user',
      label: 'Mess membership',
      sub: profile?.profile?.mess_id
        ? `Mess ID ${profile.profile.mess_id}`
        : isAdmin ? 'Mess office account' : 'Issued by the mess office',
      value: status ? status.charAt(0) + status.slice(1).toLowerCase() : 'Loading…',
      valueTone: status ? tone : undefined,
    },
  ];

  if (!isAdmin) {
    rows.push({
      icon: 'calendar_month',
      label: 'Dining plan',
      sub: studentType
        ? (STUDENT_TYPE_LABEL[studentType] || studentType)
        : 'Loading from the mess roll…',
    });
  }

  if (profile?.capabilities?.attendance_scanner && !isAdmin) {
    rows.push({
      icon: 'qr_code_scanner',
      label: 'Meal scanner access',
      sub: 'You can scan other students in at the dining hall',
      value: 'Committee',
      valueTone: { bg: 'var(--green-light)', fg: 'var(--green)' },
    });
  }

  rows.push(
    {
      icon: 'lock_clock',
      label: '9 PM cutoff reminders',
      sub: 'Nudge before opt-outs lock for the next day',
      toggle: true,
    },
    {
      icon: 'help_outline',
      label: 'Mess rules and support',
      sub: 'Cutoff times, mess-cut policy and office contacts',
      chevron: true,
    },
  );

  const hasPhoto = Boolean(currentAvatar && currentAvatar.startsWith('data:'));

  return (
    <main className="page-container">
      <input type="file" ref={fileRef} onChange={handleFile} accept="image/*" style={{ display: 'none' }} />

      <div className="lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-6 lg:items-start">
        {/* ── Identity ───────────────────────────────────────────── */}
        <section
          className="rounded-3xl p-5 mb-4 lg:mb-0 lg:rounded-xl lg:p-6"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            boxShadow: 'var(--card-shadow)',
          }}
        >
          <div className="flex items-center gap-4 lg:flex-col lg:text-center">
            <div className="relative shrink-0">
              {hasPhoto ? (
                <img
                  src={currentAvatar}
                  alt=""
                  className="w-[72px] h-[72px] lg:w-24 lg:h-24 rounded-full object-cover"
                  style={{ border: '2px solid var(--orange-light)' }}
                />
              ) : (
                <div
                  className="w-[72px] h-[72px] lg:w-24 lg:h-24 rounded-full flex items-center justify-center overflow-hidden"
                  style={{ background: 'var(--bg)', border: '2px solid var(--orange-light)' }}
                >
                  <ChefMascot size={54} />
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                style={{ background: 'var(--orange)', border: '2px solid var(--card)' }}
                title="Choose a photo for this device"
                aria-label="Choose a photo for this device"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>
                  photo_camera
                </span>
              </button>
            </div>

            <div className="flex-1 min-w-0 lg:mt-3">
              <h2
                className="font-display text-[19px] font-bold truncate"
                style={{ color: 'var(--text-dark)' }}
              >
                {displayName}
              </h2>

              <p className="text-[12px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {registration}
              </p>

              <span
                className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full mt-2"
                style={{
                  background: 'var(--orange-soft)',
                  color: 'var(--orange-ink)',
                  border: '1px solid var(--orange-light)',
                  fontFamily: 'Nunito, sans-serif',
                }}
              >
                {roleLabel}
              </span>
            </div>
          </div>

          {/* Meal stats — real figures only */}
          {!isAdmin && (
            <div
              className="mt-5 grid grid-cols-3 text-center rounded-2xl overflow-hidden lg:rounded-lg"
              style={{ border: '1px solid var(--line)' }}
            >
              {[
                { label: 'Attended', value: stats?.done },
                { label: 'Mess cuts', value: stats?.skipped },
                { label: 'Upcoming', value: stats?.upcoming },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className="py-3"
                  style={{
                    borderLeft: i > 0 ? '1px solid var(--line)' : 'none',
                    background: 'var(--bg)',
                  }}
                >
                  <p
                    className="font-display text-[19px] font-bold"
                    style={{ color: 'var(--text-dark)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {s.value === undefined ? '—' : s.value.toLocaleString()}
                  </p>
                  <p className="text-[10.5px] font-bold" style={{ color: 'var(--text-muted)' }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl p-3 text-[12px] font-bold"
              style={{ background: '#FDECEA', border: '1px solid #F6C8C3', color: 'var(--red)' }}
            >
              {error}
            </p>
          )}
        </section>

        {/* ── Settings ───────────────────────────────────────────── */}
        <div>
          <p className="hidden lg:block section-label mb-3">Preferences</p>

          <section
            className="rounded-2xl overflow-hidden mb-4 lg:rounded-xl"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-border)',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            {rows.map((row, i) => (
              <div
                key={row.label}
                className="flex items-center gap-3.5 px-4 py-3.5 lg:px-5"
                style={{
                  borderTop: i > 0 ? '1px solid var(--line-soft)' : 'none',
                  cursor: row.chevron ? 'pointer' : 'default',
                }}
                onClick={row.chevron ? () => setShowSupport(true) : undefined}
              >
                <span
                  className="material-symbols-outlined shrink-0"
                  style={{ color: 'var(--orange)', fontSize: 20 }}
                >
                  {row.icon}
                </span>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13.5px] font-bold"
                    style={{ color: 'var(--text-dark)', fontFamily: 'Nunito, sans-serif' }}
                  >
                    {row.label}
                  </p>
                  <p className="text-[11.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {row.sub}
                  </p>
                </div>

                {row.value && (
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    style={{
                      background: row.valueTone?.bg ?? 'var(--bg)',
                      color: row.valueTone?.fg ?? 'var(--text-muted)',
                    }}
                  >
                    {row.value}
                  </span>
                )}

                {row.toggle && (
                  <label className="stitch-toggle" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={notifications}
                      onChange={toggleReminders}
                      aria-label="9 PM cutoff reminders"
                    />
                    <div className="stitch-toggle-track" />
                    <div className="stitch-toggle-thumb" />
                  </label>
                )}

                {row.chevron && (
                  <span
                    className="material-symbols-outlined shrink-0"
                    style={{ color: 'var(--text-light)', fontSize: 18 }}
                  >
                    chevron_right
                  </span>
                )}
              </div>
            ))}
          </section>

          <p className="text-[11.5px] font-semibold mb-4" style={{ color: 'var(--text-muted)' }}>
            Your name, registration number and dining plan come from the mess roll. Contact the mess
            office to have them corrected.
          </p>

          <button
            onClick={() => setShowLogout(true)}
            className="w-full py-3 rounded-2xl text-[13px] font-black cursor-pointer lg:w-auto lg:px-5 lg:py-2.5 lg:rounded-lg"
            style={{
              background: 'var(--card)',
              border: '1px solid #F6C8C3',
              color: 'var(--red)',
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Required by the icon set's licence */}
      {/* --text-light is decoration-only now; 11px credit text needs --text-muted. */}
      <p
        className="text-[11px] font-semibold text-center mt-8 lg:text-left"
        style={{ color: 'var(--text-muted)' }}
      >
        {ART_CREDIT}
      </p>

      {/* ── Mess rules and support ───────────────────────────────── */}
      <Modal open={showSupport} onClose={() => setShowSupport(false)} scrim={false}>
        {showSupport && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-5"
          style={{ background: 'rgba(45,26,14,0.4)', backdropFilter: 'blur(4px)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-title"
        >
          <div
            className="rounded-2xl p-6 w-full max-w-[380px]"
            style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
          >
            <h3 id="support-title" className="font-display text-[19px] font-bold" style={{ color: 'var(--text-dark)' }}>
              Mess rules and support
            </h3>
            <ul className="mt-3 space-y-2 text-[13px] font-semibold" style={{ color: 'var(--text-body)' }}>
              <li>Opt-outs for the next day close at 9 PM.</li>
              <li>A student may take up to 10 mess cuts per month.</li>
              <li>Bills are published monthly; pay and submit the bank UTR from My Bill.</li>
            </ul>
            <p className="mt-4 text-[12.5px] font-bold" style={{ color: 'var(--text-muted)' }}>
              CUSAT Mess Office
            </p>
            <button onClick={() => setShowSupport(false)} className="btn-secondary w-full mt-4">
              Close
            </button>
          </div>
        </div>
        )}
      </Modal>

      {/* ── Sign-out confirmation ────────────────────────────────── */}
      <Modal open={showLogout} onClose={() => setShowLogout(false)} scrim={false}>
        {showLogout && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-5"
          style={{ background: 'rgba(45,26,14,0.4)', backdropFilter: 'blur(4px)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-out-title"
        >
          <div
            className="rounded-2xl p-6 w-full max-w-[340px]"
            style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
          >
            <h3 id="sign-out-title" className="font-display text-[19px] font-bold" style={{ color: 'var(--text-dark)' }}>
              Sign out?
            </h3>
            <p className="text-[13px] font-semibold mt-1 mb-5" style={{ color: 'var(--text-muted)' }}>
              You will need your registration number and password to sign back in.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowLogout(false); onLogout(); }}
                className="btn-primary flex-1"
                style={{ background: 'var(--red)' }}
              >
                Sign out
              </button>
              <button onClick={() => setShowLogout(false)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
        )}
      </Modal>
    </main>
  );
};
