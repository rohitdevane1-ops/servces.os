import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import { Modal } from '../common/Modal';
import { 
  User, 
  Settings, 
  Mail, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  Save, 
  Building,
  KeyRound,
  ShieldCheck
} from 'lucide-react';

export const ProfileModal: React.FC = () => {
  const { 
    isProfileModalOpen, 
    closeProfileModal, 
    profileModalTab, 
    userProfile, 
    updateUserProfile,
    currentRole,
    isDemoMode,
    addToast
  } = useAdmin();

  const [activeTab, setActiveTab] = useState<'view' | 'edit'>('view');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [territory, setTerritory] = useState('');
  const [avatar, setAvatar] = useState('');
  const [bio, setBio] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // MFA Setup State
  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; otpAuthUrl: string } | null>(null);
  const [mfaConfirmCode, setMfaConfirmCode] = useState('');
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[] | null>(null);
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  useEffect(() => {
    if (!isProfileModalOpen) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setActiveTab(profileModalTab);
      setName(userProfile.name);
      setEmail(userProfile.email);
      setPhone(userProfile.phone);
      setTitle(userProfile.title);
      setDepartment(userProfile.department || (currentRole === 'ADMIN' ? 'Executive Operations' : 'Field Dispatch'));
      setTerritory(userProfile.territory);
      setAvatar(userProfile.avatar);
      setBio(userProfile.bio);
      setTwoFactorEnabled(Boolean(userProfile.twoFactorEnabled));
      setCurrentPassword('');
      setNewPassword('');
      setMfaSetupData(null);
      setMfaConfirmCode('');
      setMfaBackupCodes(null);
      setMfaDisablePassword('');
    });
    return () => {
      active = false;
    };
  }, [isProfileModalOpen, profileModalTab, userProfile, currentRole]);

  if (!isProfileModalOpen) return null;

  const handleStartMfaSetup = async () => {
    setMfaBusy(true);
    const res = await apiClient.setupMfa();
    setMfaBusy(false);
    if (!res.success || !res.data) {
      addToast(res.error?.message || 'Unable to start MFA enrollment', 'error');
      return;
    }
    setMfaSetupData(res.data);
  };

  const handleConfirmMfa = async () => {
    if (mfaConfirmCode.trim().length !== 6) {
      addToast('Enter the 6-digit TOTP code from your authenticator app', 'warning');
      return;
    }
    setMfaBusy(true);
    const res = await apiClient.confirmMfa(mfaConfirmCode.trim());
    setMfaBusy(false);
    if (!res.success || !res.data) {
      addToast(res.error?.message || 'Invalid 6-digit TOTP code', 'error');
      return;
    }
    setTwoFactorEnabled(true);
    setMfaSetupData(null);
    setMfaBackupCodes(res.data.backupCodes || []);
    updateUserProfile({ twoFactorEnabled: true });
    addToast('Two-Factor Authentication enabled!', 'success');
  };

  const handleDisableMfa = async () => {
    if (!mfaDisablePassword.trim()) {
      addToast('Enter your current password to disable 2FA', 'warning');
      return;
    }
    setMfaBusy(true);
    const res = await apiClient.disableMfa({ currentPassword: mfaDisablePassword });
    setMfaBusy(false);
    if (!res.success) {
      addToast(res.error?.message || 'Failed to disable 2FA', 'error');
      return;
    }
    setTwoFactorEnabled(false);
    setMfaDisablePassword('');
    updateUserProfile({ twoFactorEnabled: false });
    addToast('Two-Factor Authentication disabled.', 'info');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.trim()) {
      if (isDemoMode) {
        addToast('Changing account passwords is disabled in the Demo Sandbox.', 'warning');
        return;
      }
      if (!currentPassword.trim()) {
        addToast('Please enter your current password to set a new password.', 'error');
        return;
      }
      const pwdRes = await apiClient.changePassword(currentPassword, newPassword);
      if (!pwdRes.success) {
        addToast(pwdRes.error?.message || 'Password update failed.', 'error');
        return;
      }
      addToast('Security password updated and old sessions revoked.', 'success');
    }
    await updateUserProfile({
      name,
      email,
      phone,
      title,
      department,
      territory,
      avatar,
      bio,
      twoFactorEnabled
    });
    closeProfileModal();
  };

  return (
    <Modal
      isOpen={isProfileModalOpen}
      onClose={closeProfileModal}
      title={activeTab === 'view' ? 'Profile Details & Security Dossier' : 'Edit Profile & Security Credentials'}
      maxWidth="max-w-2xl"
    >
      <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-semibold">
          {currentRole === 'ADMIN' ? 'Administrator Identity' : 'Operations Staff Identity'}
        </span>
        <div className="flex items-center bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('view')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'view' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            View Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === 'edit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Edit Profile
          </button>
        </div>
      </div>

      <div className="p-6 overflow-y-auto max-h-[78vh] thin-scrollbar">
        {activeTab === 'view' ? (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-gradient-to-r from-[#0C3832] to-[#134E45] text-white flex flex-col sm:flex-row items-center gap-5 shadow-sm">
              <div className="relative">
                {userProfile.avatar ? (
                  <img
                    src={userProfile.avatar}
                    alt={userProfile.name}
                    className="w-20 h-20 rounded-2xl object-cover ring-4 ring-emerald-400/40 shadow-md"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-black text-2xl ring-4 ring-emerald-400/40 shadow-md">
                    {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0C3832] flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                </span>
              </div>

              <div className="flex-1 text-center sm:text-left min-w-0">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h3 className="text-xl font-black tracking-tight">{userProfile.name}</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-400 text-slate-950 uppercase tracking-wider">
                    {userProfile.role}
                  </span>
                </div>
                <div className="text-xs text-emerald-200/90 font-medium mt-0.5">{userProfile.title}</div>
                <div className="text-[11px] text-emerald-300/80 mt-1 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <span className="flex items-center gap-1">
                    <Building className="w-3 h-3 text-emerald-400" />
                    {userProfile.department}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    {userProfile.territory}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('edit')}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/20 flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-700">
              <span className="font-bold text-slate-900 block mb-1">Operational Mandate &amp; Bio:</span>
              <p className="leading-relaxed">{userProfile.bio || 'No operational bio configured.'}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Direct Contact</span>
                <div className="flex items-center gap-2.5 text-xs">
                  <Mail className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[10px]">Email Address</span>
                    <span className="font-bold text-slate-900 font-mono text-[11px]">{userProfile.email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 text-xs">
                  <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[10px]">Direct Phone Line</span>
                    <span className="font-bold text-slate-900 font-mono text-[11px]">{userProfile.phone || 'Not provided'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Security &amp; 2FA Status</span>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Two-Factor Authentication:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    twoFactorEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {twoFactorEnabled ? '● 2FA Enabled' : '○ Not Enrolled'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Access Token Storage:</span>
                  <span className="font-mono text-slate-900 font-bold text-[11px]">In-Memory + HttpOnly Refresh</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Active Role Scope:</span>
                  <span className="text-emerald-700 font-bold text-[11px]">{currentRole}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                Role Permissions &amp; Access Scope
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Customer &amp; Technician Directory Access</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Live GPS Dispatch Board &amp; Order Handover</span>
                </div>
                {currentRole === 'ADMIN' && (
                  <>
                    <div className="flex items-center gap-2 text-slate-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Double-Entry Ledger &amp; Escrow Payout Settlement</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Platform Configuration &amp; Encrypted Integrations</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2">Profile Avatar URL</label>
              <div className="flex items-center gap-4">
                {avatar ? (
                  <img src={avatar} alt="Avatar" className="w-12 h-12 rounded-xl object-cover ring-2 ring-emerald-500" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
                    {name ? name.charAt(0).toUpperCase() : <User className="w-6 h-6" />}
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="url"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="Enter custom image URL (https://...)"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Job Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Operating Hub / Territory</label>
                <input
                  type="text"
                  value={territory}
                  onChange={(e) => setTerritory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Operational Mandate / Bio</label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800"
              />
            </div>

            {/* Real TOTP MFA Enrollment & Password Controls */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Two-Factor Authentication (TOTP MFA)</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Server-enforced AES-256-GCM encrypted TOTP &amp; single-use recovery codes
                  </span>
                </div>
                {!twoFactorEnabled ? (
                  <button
                    type="button"
                    disabled={mfaBusy}
                    onClick={handleStartMfaSetup}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    {mfaBusy ? 'Starting...' : 'Enroll 2FA'}
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                    2FA Active
                  </span>
                )}
              </div>

              {mfaSetupData && (
                <div className="p-3 bg-white rounded-xl border border-emerald-200 space-y-2 text-xs">
                  <div className="font-bold text-slate-900">1. Add this secret key to Google Authenticator / Authy:</div>
                  <div className="p-2 bg-slate-100 rounded font-mono text-[11px] font-bold text-slate-800 break-all">
                    {mfaSetupData.secret}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      maxLength={6}
                      value={mfaConfirmCode}
                      onChange={e => setMfaConfirmCode(e.target.value)}
                      placeholder="Enter 6-digit code"
                      className="px-3 py-1.5 border border-slate-200 rounded-xl font-mono text-xs"
                    />
                    <button
                      type="button"
                      disabled={mfaBusy}
                      onClick={handleConfirmMfa}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl font-bold text-xs cursor-pointer"
                    >
                      Verify &amp; Activate
                    </button>
                  </div>
                </div>
              )}

              {mfaBackupCodes && mfaBackupCodes.length > 0 && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1.5 text-xs">
                  <div className="font-bold text-amber-900">Save your single-use recovery backup codes:</div>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-amber-950">
                    {mfaBackupCodes.map((c, idx) => (
                      <div key={idx} className="p-1 bg-white rounded border border-amber-200 text-center font-bold">
                        {c}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {twoFactorEnabled && (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                  <input
                    type="password"
                    value={mfaDisablePassword}
                    onChange={e => setMfaDisablePassword(e.target.value)}
                    placeholder="Current password to disable 2FA"
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={mfaBusy}
                    onClick={handleDisableMfa}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Disable 2FA
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1 flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> Current Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">New Password (optional)</label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={closeProfileModal}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Profile Changes</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
