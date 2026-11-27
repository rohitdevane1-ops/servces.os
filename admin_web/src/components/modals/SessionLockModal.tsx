import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Lock, ShieldCheck, KeyRound, AlertCircle, LogOut } from 'lucide-react';
import { Modal } from '../common/Modal';

export const SessionLockModal: React.FC = () => {
  const { isSessionLocked, unlockSession, userProfile, currentRole, isDemoMode, logout } = useAdmin();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isSessionLocked) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsVerifying(true);
    const res = await unlockSession(password);
    setIsVerifying(false);
    if (res.ok) {
      setPassword('');
      setError(null);
    } else {
      setError(res.error || 'Password verification failed.');
    }
  };

  return (
    <Modal
      isOpen={isSessionLocked}
      dismissible={false}
      maxWidthClass="max-w-md"
      backdropClassName="bg-slate-950/90 backdrop-blur-md"
      containerClassName="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full p-8 text-center space-y-6"
      ariaLabel="Session Locked — Server Re-authentication Required"
    >
      <div className="w-16 h-16 rounded-2xl bg-[#0C3832] text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
        <Lock className="w-8 h-8" />
      </div>

      <div>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">
          Session Locked • Server Verification Required
        </span>
        <h2 className="text-xl font-extrabold text-slate-900 mt-2">Console Temporarily Locked</h2>
        <p className="text-xs text-slate-500 mt-1">
          Active session for <strong className="text-slate-800">{userProfile.name || userProfile.email}</strong> (
          {currentRole}). Re-enter your account password to verify with the authentication server.
        </p>
      </div>

      <form onSubmit={handleUnlock} className="space-y-4">
        <div className="text-left">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5 text-center">
            Account Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="Enter your account password..."
            autoFocus
            required
            className={`w-full px-4 py-3 text-center text-sm font-medium bg-slate-50 border-2 rounded-2xl focus:outline-none focus:bg-white transition-all ${
              error ? 'border-rose-400 text-rose-600' : 'border-slate-200 focus:border-emerald-600 text-slate-900'
            }`}
          />
          {error && (
            <div className="text-xs font-bold text-rose-600 mt-2 flex items-center justify-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isVerifying}
          className="w-full py-3.5 bg-[#0C3832] hover:bg-[#124e45] disabled:opacity-50 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <KeyRound className="w-4 h-4 text-emerald-400" />
          <span>{isVerifying ? 'Verifying with Server...' : 'Verify Password & Unlock Console'}</span>
        </button>
      </form>

      {isDemoMode && (
        <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl p-2.5">
          Interactive Sandbox Mode: Click <strong>Sign Out &amp; Switch Account</strong> below to return to the one-click sandbox login screen.
        </p>
      )}

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Fail-Closed Server Lock</span>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out &amp; Switch Account</span>
        </button>
      </div>
    </Modal>
  );
};
