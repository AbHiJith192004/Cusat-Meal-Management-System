import React, { useState, useEffect, useRef } from 'react';
import { studentApi } from '../services/api';
import { ChefMascot, ART_CREDIT } from '../components/FoodIllustrations';

interface ProfileViewProps {
  studentName: string;
  regNo: string;
  avatar: string;
  userRole?: 'student' | 'admin' | 'super_admin';
  onUpdateName: (name: string) => void;
  onUpdateAvatar: (url: string) => void;
  onLogout: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  studentName,
  regNo,
  avatar,
  userRole = 'student',
  onUpdateName,
  onUpdateAvatar,
  onLogout,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(studentName);
  const [notifications, setNotifications] = useState(true);
  const [showLogout, setShowLogout] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(avatar);
  const [stats, setStats] = useState<{ done: number; skipped: number; upcoming: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('messconnect_avatar');
    if (saved) {
      setCurrentAvatar(saved);
      onUpdateAvatar(saved);
    }
    studentApi
      .getDashboard()
      .then(d => {
        if (d?.overall_stats)
          setStats({
            done: d.overall_stats.meals_done || 0,
            skipped: d.overall_stats.meals_skipped || 0,
            upcoming: d.overall_stats.meals_booked || 0,
          });
      })
      .catch(() => {});
  }, []);

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

  const isAdmin = userRole === 'admin' || regNo.toUpperCase().includes('ADMIN');
  const roleLabel =
    userRole === 'super_admin' ? 'Super Warden' : isAdmin ? 'Mess Admin' : 'Hostel Student';

  const rows = [
    {
      icon: 'verified_user',
      label: 'Mess membership',
      sub: 'Active hostel resident',
      value: 'Active',
    },
    {
      icon: 'calendar_month',
      label: 'Dining plan',
      sub: 'Regular — all meals included',
    },
    {
      icon: 'lock_clock',
      label: '9 PM cutoff reminders',
      sub: 'Nudge before opt-outs lock for the next day',
      toggle: true,
    },
    {
      icon: 'help_outline',
      label: 'Mess rules and support',
      sub: 'Dietary preferences and office contacts',
      chevron: true,
    },
  ];

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
                title="Upload a photo"
                aria-label="Upload a photo"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>
                  photo_camera
                </span>
              </button>
            </div>

            <div className="flex-1 min-w-0 lg:mt-3">
              {isEditing ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    className="stitch-input"
                    style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                    aria-label="Your name"
                  />
                  <button
                    onClick={() => { onUpdateName(nameInput.trim()); setIsEditing(false); }}
                    className="btn-primary shrink-0"
                    style={{ padding: '7px 14px', fontSize: '0.75rem' }}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 lg:justify-center">
                  <h2
                    className="font-display text-[19px] font-bold truncate"
                    style={{ color: 'var(--text-dark)' }}
                  >
                    {studentName}
                  </h2>
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0 }}
                    aria-label="Edit name"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                  </button>
                </div>
              )}

              <p className="text-[12px] font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {regNo}
              </p>

              <span
                className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full mt-2"
                style={{
                  background: 'var(--orange-soft)',
                  color: 'var(--orange-dark)',
                  border: '1px solid var(--orange-light)',
                  fontFamily: 'Nunito, sans-serif',
                }}
              >
                {roleLabel}
              </span>
            </div>
          </div>

          {/* Meal stats */}
          {!isAdmin && (
            <div
              className="mt-5 grid grid-cols-3 text-center rounded-2xl overflow-hidden lg:rounded-lg"
              style={{ border: '1px solid var(--line)' }}
            >
              {[
                { label: 'Attended', value: stats?.done ?? 28 },
                { label: 'Mess cuts', value: stats?.skipped ?? 2 },
                { label: 'Upcoming', value: stats?.upcoming ?? 35 },
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
                    {s.value}
                  </p>
                  <p className="text-[10.5px] font-bold" style={{ color: 'var(--text-muted)' }}>
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
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
                onClick={
                  row.chevron
                    ? () =>
                        alert(
                          'CUSAT Mess Office\nPhone: +91 484 257 7290\nEmail: mess@cusat.ac.in'
                        )
                    : undefined
                }
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
                    style={{ background: 'var(--green-light)', color: 'var(--green)' }}
                  >
                    {row.value}
                  </span>
                )}

                {row.toggle && (
                  <label className="stitch-toggle" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={notifications}
                      onChange={() => setNotifications(!notifications)}
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
      <p
        className="text-[11px] font-semibold text-center mt-8 lg:text-left"
        style={{ color: 'var(--text-light)' }}
      >
        {ART_CREDIT}
      </p>

      {/* ── Sign-out confirmation ────────────────────────────────── */}
      {showLogout && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-5"
          style={{ background: 'rgba(45,26,14,0.4)', backdropFilter: 'blur(4px)' }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="rounded-2xl p-6 w-full max-w-[340px]"
            style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
          >
            <h3 className="font-display text-[19px] font-bold" style={{ color: 'var(--text-dark)' }}>
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
    </main>
  );
};
