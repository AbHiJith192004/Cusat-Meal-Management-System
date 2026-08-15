import React, { useState, useEffect, useRef } from 'react';
import { studentApi, authApi } from '../services/api';

interface ProfileViewProps {
  studentName: string;
  regNo: string;
  avatar: string;
  userRole?: 'student' | 'admin' | 'super_admin';
  onUpdateName: (name: string) => void;
  onUpdateAvatar: (avatarUrl: string) => void;
  onLogout: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  studentName,
  regNo,
  avatar,
  userRole = 'student',
  onUpdateName,
  onUpdateAvatar,
  onLogout
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(studentName);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedAvatar = localStorage.getItem('messconnect_avatar');
    if (savedAvatar) {
      setCurrentAvatar(savedAvatar);
      onUpdateAvatar(savedAvatar);
    }
  }, []);

  const handleSaveName = () => {
    if (nameInput.trim()) {
      onUpdateName(nameInput.trim());
      setIsEditing(false);
    }
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be under 5MB. Please choose a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setCurrentAvatar(base64);
      onUpdateAvatar(base64);
      localStorage.setItem('messconnect_avatar', base64);
    };
    reader.readAsDataURL(file);
  };

  const [stats, setStats] = useState<{ mealsDone: number; mealsSkipped: number; mealsBooked: number } | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await studentApi.getDashboard();
        if (data?.overall_stats) {
          setStats({
            mealsDone: data.overall_stats.meals_done || 0,
            mealsSkipped: data.overall_stats.meals_skipped || 0,
            mealsBooked: data.overall_stats.meals_booked || 0,
          });
        }
      } catch (e) {}
    };
    loadStats();
  }, []);

  return (
    <main className="w-full max-w-[768px] mx-auto px-4 py-6 flex flex-col gap-6 pb-32 md:pb-12 animate-fade-in">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* Profile Header Card */}
      <div className="bg-[#ffffff] rounded-2xl border border-[#c3c6d7] p-6 shadow-2xs flex flex-col items-center sm:flex-row sm:items-start gap-4 relative overflow-hidden">
        <div className="relative">
          <img
            src={currentAvatar}
            alt={studentName}
            className="w-20 h-20 rounded-full object-cover border-2 border-[#2563eb]"
          />
          <button
            onClick={handlePhotoClick}
            className="absolute bottom-0 right-0 w-7 h-7 bg-[#2563eb] text-white rounded-full flex items-center justify-center shadow-xs hover:bg-[#004ac6] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">photo_camera</span>
          </button>
        </div>

        <div className="flex-1 text-center sm:text-left">
          {isEditing ? (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="p-1.5 border border-[#c3c6d7] rounded text-lg font-bold text-[#151c27] outline-none"
              />
              <button
                onClick={handleSaveName}
                className="px-3 py-1.5 bg-[#2563eb] text-white text-xs font-semibold rounded hover:bg-[#004ac6]"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <h2 className="text-[22px] font-bold text-[#151c27]">{studentName}</h2>
              <button
                onClick={() => setIsEditing(true)}
                className="text-[#737686] hover:text-[#004ac6] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>
          )}

          <p className="text-sm text-[#434655]">Reg No / ID: {regNo}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
            {regNo.toUpperCase() === 'SADMIN001' || userRole === 'super_admin' ? (
              <span className="px-3 py-1 bg-[#fef3c7] text-[#92400e] border border-[#f59e0b]/40 text-xs font-bold rounded-full flex items-center gap-1 shadow-2xs">
                <span className="material-symbols-outlined text-[16px] text-[#d97706]">shield_person</span>
                <span>Super Admin</span>
              </span>
            ) : regNo.toUpperCase().includes('ADMIN') || userRole === 'admin' ? (
              <span className="px-3 py-1 bg-[#2563eb]/10 text-[#004ac6] border border-[#2563eb]/30 text-xs font-bold rounded-full flex items-center gap-1 shadow-2xs">
                <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
                <span>Mess Admin</span>
              </span>
            ) : (
              <span className="px-3 py-1 bg-[#6cf8bb]/40 text-[#00714d] border border-[#00714d]/20 text-xs font-bold rounded-full flex items-center gap-1 shadow-2xs">
                <span className="material-symbols-outlined text-[16px]">school</span>
                <span>Student</span>
              </span>
            )}

            <span className="px-2.5 py-1 bg-[#f0f3ff] text-[#434655] text-xs font-medium rounded-full border border-[#c3c6d7]/60">
              CUSAT Boys Hostel
            </span>

            {(regNo.toUpperCase().includes('LAKESIDE') || (stats as any)?.campus_location === 'LAKESIDE_CAMPUS') && (
              <span className="px-3 py-1 bg-[#2563eb]/15 text-[#004ac6] border border-[#2563eb]/30 text-xs font-bold rounded-full flex items-center gap-1 shadow-2xs">
                <span className="material-symbols-outlined text-[16px]">location_on</span>
                <span>Lakeside Campus (25% Off Mess Bill)</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Student Overview Section - Meal Details */}
      {userRole === 'student' && (
        <div className="bg-[#ffffff] rounded-2xl border border-[#c3c6d7] p-5 shadow-2xs space-y-3">
          <h3 className="text-base font-bold text-[#151c27] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#2563eb]">analytics</span>
            Student Overview & Meal Attendance
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-[#006c49]/5 border border-[#006c49]/20 rounded-xl p-3.5 flex flex-col">
              <span className="text-xs font-semibold text-[#006c49] flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Meals Done
              </span>
              <span className="text-2xl font-extrabold text-[#006c49] mt-1">{stats?.mealsDone ?? 0}</span>
              <span className="text-[11px] text-[#434655] mt-0.5">Attended & Scanned</span>
            </div>

            <div className="bg-[#ba1a1a]/5 border border-[#ba1a1a]/20 rounded-xl p-3.5 flex flex-col">
              <span className="text-xs font-semibold text-[#ba1a1a] flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">cancel</span>
                Meals Skipped
              </span>
              <span className="text-2xl font-extrabold text-[#ba1a1a] mt-1">{stats?.mealsSkipped ?? 0}</span>
              <span className="text-[11px] text-[#434655] mt-0.5">Missed / Unserved</span>
            </div>

            <div className="bg-[#2563eb]/5 border border-[#2563eb]/20 rounded-xl p-3.5 flex flex-col col-span-2 sm:col-span-1">
              <span className="text-xs font-semibold text-[#2563eb] flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                Meals Booked
              </span>
              <span className="text-2xl font-extrabold text-[#151c27] mt-1">{stats?.mealsBooked ?? 0}</span>
              <span className="text-[11px] text-[#434655] mt-0.5">Opted-In Count</span>
            </div>
          </div>
        </div>
      )}

      {/* Settings Options List */}
      <div className="bg-[#ffffff] rounded-2xl border border-[#c3c6d7] shadow-2xs overflow-hidden divide-y divide-[#c3c6d7]/40">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#004ac6]">verified_user</span>
            <div>
              <p className="font-semibold text-sm text-[#151c27]">Account Status</p>
              <p className="text-xs text-[#737686]">Mess membership active</p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-[#6cf8bb] text-[#00714d] rounded-full text-xs font-bold">
            Active
          </span>
        </div>

        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#004ac6]">notifications</span>
            <div>
              <p className="font-semibold text-sm text-[#151c27]">Meal Reminders</p>
              <p className="text-xs text-[#737686]">Get notified before meal cutoff times</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={() => setNotificationsEnabled(!notificationsEnabled)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#dce2f3] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#c3c6d7] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2563eb]"></div>
          </label>
        </div>

        <button
          onClick={() => alert('Mess Helpline: +91 98765 00000\nEmail: mess-support@cusat.ac.in')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-[#f0f3ff] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#004ac6]">help_outline</span>
            <div>
              <p className="font-semibold text-sm text-[#151c27]">Help & Support</p>
              <p className="text-xs text-[#737686]">Mess rules, fine info & contacts</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-[#737686]">chevron_right</span>
        </button>

        <button
          onClick={() => alert('MessConnect v2.5.0\nCUSAT Hostel Mess Management')}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-[#f0f3ff] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#004ac6]">info</span>
            <div>
              <p className="font-semibold text-sm text-[#151c27]">About MessConnect</p>
              <p className="text-xs text-[#737686]">Version 2.5.0</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-[#737686]">chevron_right</span>
        </button>
      </div>

      {/* Logout Button */}
      <button
        onClick={() => setShowLogoutModal(true)}
        className="w-full py-3.5 bg-[#ffdad6] text-[#93000a] font-bold text-sm rounded-xl hover:bg-[#ffdad6]/80 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
      >
        <span className="material-symbols-outlined text-[20px]">logout</span>
        Log Out
      </button>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-[#151c27]">Log Out of MessConnect?</h3>
            <p className="text-xs text-[#434655]">
              You'll need your Registration No and Password to sign back in.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowLogoutModal(false);
                  onLogout();
                }}
                className="flex-1 py-2 bg-[#ba1a1a] text-white font-semibold text-xs rounded-lg hover:bg-[#93000a]"
              >
                Yes, Log Out
              </button>
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 border border-[#c3c6d7] text-xs font-semibold rounded-lg text-[#434655]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
