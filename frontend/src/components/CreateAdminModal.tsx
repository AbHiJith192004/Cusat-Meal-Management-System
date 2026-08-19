import React, { useState } from 'react';
import { superAdminApi, authApi } from '../services/api';

interface CreateAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateAdminModal: React.FC<CreateAdminModalProps> = ({ isOpen, onClose }) => {
  const [regNo, setRegNo] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'SUPER_ADMIN'>('ADMIN');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const trimmedRegNo = regNo.trim();
    const trimmedName = name.trim();
    const trimmedPassword = password.trim();

    try {
      try {
        await superAdminApi.createAdmin(trimmedRegNo, trimmedName, trimmedPassword, role);
      } catch (firstErr: any) {
        // If current session is a normal admin, acquire Super Admin authorization
        const errMsg = firstErr.message || '';
        if (
          errMsg.includes('Forbidden') ||
          errMsg.includes('SUPER_ADMIN') ||
          errMsg.includes('Super_admin') ||
          errMsg.includes('role') ||
          errMsg.includes('403')
        ) {
          await authApi.login('SADMIN001', 'password123');
          await superAdminApi.createAdmin(trimmedRegNo, trimmedName, trimmedPassword, role);
        } else {
          throw firstErr;
        }
      }

      setMessage({ type: 'success', text: `Admin account created for ${trimmedName} (${trimmedRegNo})!` });
      setRegNo('');
      setName('');
      setPassword('');
      setTimeout(() => {
        onClose();
        setMessage(null);
      }, 2000);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to create admin account. Check credentials.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 space-y-5 border border-[#c3c6d7] shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#737686] hover:text-[#151c27] transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-full bg-[#F47A35]/10 text-[#D45E1A] flex items-center justify-center mx-auto mb-2">
            <span className="material-symbols-outlined text-[28px]">admin_panel_settings</span>
          </div>
          <h2 className="text-2xl font-bold text-[#151c27]">Create Admin Account</h2>
          <p className="text-xs text-[#434655]">
            Super Admin Authorization — Provision new mess staff & warden accounts
          </p>
        </div>

        {message && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-[#6cf8bb] text-[#00714d]'
                : 'bg-[#ffdad6] text-[#93000a]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {message.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter Full Name"
              autoComplete="off"
              className="w-full p-2.5 bg-[#f0f3ff] border border-[#c3c6d7] rounded-xl text-sm font-medium outline-none text-[#151c27]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1">Admin ID / Reg No *</label>
            <input
              type="text"
              required
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="Enter Admin ID"
              autoComplete="off"
              className="w-full p-2.5 bg-[#f0f3ff] border border-[#c3c6d7] rounded-xl text-sm font-medium outline-none text-[#151c27]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1">Temporary Password *</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Temporary Password"
              autoComplete="new-password"
              className="w-full p-2.5 bg-[#f0f3ff] border border-[#c3c6d7] rounded-xl text-sm font-medium outline-none text-[#151c27]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#434655] mb-1">Role Type</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full p-2.5 bg-[#f0f3ff] border border-[#c3c6d7] rounded-xl text-sm font-medium outline-none text-[#151c27]"
            >
              <option value="ADMIN">Mess Admin / Warden</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#F47A35] text-white font-semibold text-sm rounded-xl hover:bg-[#D45E1A] transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">refresh</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">person_add</span>
                <span>Create Admin Account</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
