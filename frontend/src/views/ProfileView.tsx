import { useEffect, useState } from 'react';
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

interface ProfileData {
  name: string;
  registration_number: string;
  role: string;
  account_status: string;
}

export const ProfileView = ({ studentName, regNo, userRole = 'student', onLogout }: ProfileViewProps) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<{ done: number; skipped: number; upcoming: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      studentApi.getProfile(),
      userRole === 'student' ? studentApi.getDashboard() : Promise.resolve(null),
    ]).then(([identity, dashboard]) => {
      if (!active) return;
      setProfile(identity);
      if (dashboard?.overall_stats) {
        setStats({
          done: dashboard.overall_stats.meals_done ?? 0,
          skipped: dashboard.overall_stats.meals_skipped ?? 0,
          upcoming: dashboard.overall_stats.meals_booked ?? 0,
        });
      }
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Could not load the profile.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userRole]);

  const displayName = profile?.name || studentName;
  const registration = profile?.registration_number || regNo;
  const role = profile?.role || userRole.toUpperCase();

  return (
    <main className="page-container">
      <section className="mx-auto max-w-2xl rounded-2xl p-6" style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'var(--bg)', border: '2px solid var(--orange-light)' }}>
            <ChefMascot size={58} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold truncate">{displayName}</h1>
            <p className="text-sm font-bold" style={{ color: 'var(--text-muted)' }}>{registration}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--orange-dark)' }}>{role.replace('_', ' ')}</p>
          </div>
        </div>

        {loading && <p role="status" className="mt-6 text-sm font-bold">Loading account details...</p>}
        {error && <p role="alert" className="mt-6 rounded-xl border border-[#F6C8C3] bg-[#FDECEA] p-4 text-sm font-bold" style={{ color: 'var(--red)' }}>{error}</p>}

        {profile && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl p-4" style={{ background: 'var(--bg)' }}>
              <dt className="section-label">Account status</dt>
              <dd className="mt-1 font-bold">{profile.account_status}</dd>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'var(--bg)' }}>
              <dt className="section-label">Role</dt>
              <dd className="mt-1 font-bold">{profile.role.replace('_', ' ')}</dd>
            </div>
          </dl>
        )}

        {userRole === 'student' && stats && (
          <dl className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl" style={{ border: '1px solid var(--line)' }}>
            {[
              ['Attended', stats.done],
              ['Opted out', stats.skipped],
              ['Upcoming', stats.upcoming],
            ].map(([label, value]) => (
              <div key={String(label)} className="p-3 text-center" style={{ background: 'var(--bg)' }}>
                <dd className="font-display text-xl font-bold">{Number(value).toLocaleString()}</dd>
                <dt className="text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</dt>
              </div>
            ))}
          </dl>
        )}

        <p className="mt-5 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          Account identity and role are managed by authorized mess staff.
        </p>
        <button type="button" className="mt-5 rounded-lg border border-[#F6C8C3] px-5 py-2.5 text-sm font-black" style={{ color: 'var(--red)' }} onClick={() => setShowLogout(true)}>
          Sign out
        </button>
      </section>

      <p className="mt-8 text-center text-[11px] font-semibold" style={{ color: 'var(--text-light)' }}>{ART_CREDIT}</p>

      {showLogout && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-5" style={{ background: 'rgba(45,26,14,0.4)', backdropFilter: 'blur(4px)' }} role="dialog" aria-modal="true" aria-labelledby="sign-out-title">
          <div className="w-full max-w-[340px] rounded-2xl p-6" style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}>
            <h2 id="sign-out-title" className="font-display text-xl font-bold">Sign out?</h2>
            <p className="mt-1 mb-5 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>You will need your registration number and password to sign back in.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" style={{ background: 'var(--red)' }} onClick={onLogout}>Sign out</button>
              <button type="button" className="btn-secondary flex-1" onClick={() => setShowLogout(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
