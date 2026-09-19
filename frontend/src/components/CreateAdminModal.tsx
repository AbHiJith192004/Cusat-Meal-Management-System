import React, { useState } from 'react';
import { superAdminApi } from '../services/api';
import { Modal } from './Modal';

interface CreateAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateAdminModal: React.FC<CreateAdminModalProps> = ({ isOpen, onClose }) => {
  const [regNo, setRegNo] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'SUPER_ADMIN'>('ADMIN');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [issued, setIssued] = useState<{ name: string; regNo: string; code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const trimmedRegNo = regNo.trim();
    const trimmedName = name.trim();

    try {
      // Creating an admin requires a Super Warden session. This used to catch a
      // 403 and silently re-authenticate as a hardcoded SADMIN001 account to
      // push the action through anyway - a privilege escalation shipped in the
      // bundle. A denial is now reported to the person, who can sign in with an
      // account that actually holds the permission.
      const created = await superAdminApi.createAdmin(trimmedRegNo, trimmedName, role);

      // Deliberately no auto-close here. The setup code is returned exactly
      // once and only its digest is stored, so dismissing this dialog on a
      // timer would destroy the one copy and leave the new administrator
      // unable to activate.
      setIssued({
        name: trimmedName,
        regNo: trimmedRegNo,
        code: created.setup_code,
        expiresAt: created.setup_code_expires_at,
      });
      setRegNo('');
      setName('');
    } catch (err: any) {
      const raw = err?.message || '';
      const denied =
        raw.includes('403') ||
        raw.toUpperCase().includes('SUPER_ADMIN') ||
        raw.toLowerCase().includes('forbidden');

      setMessage({
        type: 'error',
        text: denied
          ? 'Only a Super Warden can create admin accounts. Sign in with a Super Warden account and try again.'
          : raw || 'Could not create the admin account. Check the details and try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open scrim={false}>
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 space-y-5 border border-[#E3CB9B] shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#9B7B52] hover:text-[#2D1A0E] transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-full bg-[#F47A35]/10 text-[#D45E1A] flex items-center justify-center mx-auto mb-2">
            <span className="material-symbols-outlined text-[28px]">admin_panel_settings</span>
          </div>
          <h2 className="text-2xl font-bold text-[#2D1A0E]">Create Admin Account</h2>
          <p className="text-xs text-[#6B4A28]">
            Super Admin Authorization — Provision new mess staff & warden accounts
          </p>
        </div>

        {issued && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl text-xs font-semibold flex items-center gap-2 bg-[#D9EFDF] text-[#087443]">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              <span>
                Account created for {issued.name} ({issued.regNo}).
              </span>
            </div>

            <div className="p-4 rounded-xl border border-[#F47A35]/30 bg-[#F47A35]/5 space-y-2">
              <p className="text-xs font-bold text-[#D45E1A] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">key</span>
                One-time setup code
              </p>
              <p className="text-[11px] text-[#6B4A28] leading-relaxed">
                Give this to {issued.name} in person, after checking their identity. They enter it
                on the activation screen and choose their own password. It is shown{' '}
                <strong>only now</strong> and cannot be recovered — if it is lost, create a fresh
                code rather than reusing this one.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2.5 bg-white border border-[#E3CB9B] rounded-lg text-[11px] font-mono break-all text-[#2D1A0E] select-all">
                  {issued.code}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(issued.code).then(
                      () => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      },
                      () => setCopied(false),
                    );
                  }}
                  className="shrink-0 px-3 py-2.5 bg-[#F47A35] text-white text-xs font-semibold rounded-lg hover:bg-[#D45E1A] transition-colors cursor-pointer"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-[#9B7B52]">
                Expires {new Date(issued.expiresAt).toLocaleString()}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIssued(null);
                  setCopied(false);
                }}
                className="flex-1 py-2.5 border border-[#E3CB9B] text-[#6B4A28] font-semibold text-sm rounded-xl hover:bg-[#FDF7EA] transition-colors cursor-pointer"
              >
                Create another
              </button>
              <button
                type="button"
                onClick={() => {
                  setIssued(null);
                  setCopied(false);
                  onClose();
                }}
                className="flex-1 py-2.5 bg-[#2D1A0E] text-white font-semibold text-sm rounded-xl hover:bg-[#6B4A28] transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {message && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-[#D9EFDF] text-[#087443]'
                : 'bg-[#ffdad6] text-[#93000a]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {message.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{message.text}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          autoComplete="off"
          hidden={issued !== null}
        >
          <div>
            <label className="block text-xs font-semibold text-[#6B4A28] mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter Full Name"
              autoComplete="off"
              className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium outline-none text-[#2D1A0E]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6B4A28] mb-1">Admin ID / Reg No *</label>
            <input
              type="text"
              required
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="Enter Admin ID"
              autoComplete="off"
              className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium outline-none text-[#2D1A0E]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6B4A28] mb-1">Role Type</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full p-2.5 bg-[#FDF7EA] border border-[#E3CB9B] rounded-xl text-sm font-medium outline-none text-[#2D1A0E]"
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
    </Modal>
  );
};
