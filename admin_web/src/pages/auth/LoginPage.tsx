import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import {
  Shield,
  Lock,
  Mail,
  ArrowRight,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  Sparkles,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Activity,
  Radio,
} from 'lucide-react';
import { UserRole } from '../../types';
import { validatePasswordStrength } from '../../security/passwordPolicy';
import { rateLimiter } from '../../security/rateLimiter';
import { recordSecurityEvent } from '../../security/securityAuditLogger';
import { apiClient } from '../../services/apiClient';
import { useLocale } from '../../i18n/localeCore';
import { TurnstileWidget } from '../../components/common/TurnstileWidget';

export const LoginPage: React.FC = () => {
  const {
    login,
    adminProfile,
    agencyName,
    addToast,
    isDemoMode,
    systemConfig,
    refreshSystemConfig,
  } = useAdmin();
  const { t, toggleLocale } = useLocale();

  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [captchaResetCount, setCaptchaResetCount] = useState<number>(0);
  const [fastifyMfaToken, setFastifyMfaToken] = useState<string | null>(null);

  const isSystemInitialized = isDemoMode || systemConfig === null || systemConfig.tenant !== null;
  const [authMode, setAuthMode] = useState<'LOGIN' | 'FIRST_TIME_SETUP' | 'PASSWORD_RESET'>('LOGIN');

  const [selectedRole, setSelectedRole] = useState<UserRole>('ADMIN');
  const [adminFullName, setAdminFullName] = useState('');
  const [companyName, setCompanyName] = useState(agencyName || '');
  const [provisioningToken, setProvisioningToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Password Reset State
  const [resetToken, setResetToken] = useState<string>('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<'REQUEST' | 'VERIFY'>('REQUEST');

  // Rate Limiting State
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Per-User MFA Challenge State
  const [mfaStepRequired, setMfaStepRequired] = useState<boolean>(false);
  const [totpCode, setTotpCode] = useState<string>('');
  const [useBackupCode, setUseBackupCode] = useState<boolean>(false);
  const [currentYear] = useState<number>(() => new Date().getFullYear());

  const passwordStrength = validatePasswordStrength(password, 10);

  useEffect(() => {
    if (!email) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const status = rateLimiter.check(email);
      setIsLocked(status.isLocked);
      setLockoutSeconds(status.lockoutRemainingSeconds);
    });
    return () => {
      active = false;
    };
  }, [email]);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetEmail = email.trim().toLowerCase();

    const rateStatus = rateLimiter.check(targetEmail);
    if (rateStatus.isLocked) {
      setError(
        `Account temporarily locked due to multiple failed attempts. Please retry in ${rateStatus.lockoutRemainingSeconds}s.`
      );
      recordSecurityEvent(
        'ACCOUNT_LOCKED',
        targetEmail,
        selectedRole,
        'CRITICAL',
        'Login attempt while account in lockout state'
      );
      return;
    }

    if (!targetEmail) {
      setError('Please enter your account email address.');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your account password.');
      return;
    }

    if (rateStatus.delayMs > 0) {
      setIsLoading(true);
      await new Promise((r) => setTimeout(r, rateStatus.delayMs));
    }

    if (password.length < 8) {
      const failStatus = rateLimiter.recordFailure(targetEmail);
      recordSecurityEvent('LOGIN_FAILED', targetEmail, selectedRole, 'WARNING', 'Invalid password length');
      setError('Invalid credentials. Please verify your work email and password.');
      if (failStatus.isLocked) {
        setIsLocked(true);
        setLockoutSeconds(failStatus.lockoutRemainingSeconds);
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const fastifyRes = await apiClient.login(
        targetEmail,
        password,
        selectedRole,
        captchaToken || undefined
      );
      if (fastifyRes.success) {
        if (fastifyRes.data?.status === 'MFA_REQUIRED') {
          setFastifyMfaToken(fastifyRes.data.mfaSessionToken);
          setMfaStepRequired(true);
          setUseBackupCode(false);
          setTotpCode('');
          setIsLoading(false);
          recordSecurityEvent('MFA_CHALLENGE', targetEmail, selectedRole, 'INFO', 'Fastify MFA challenge initiated');
          return;
        }

        if (fastifyRes.data?.accessToken) {
          const user = fastifyRes.data.user;
          rateLimiter.reset(targetEmail);
          recordSecurityEvent('LOGIN_SUCCESS', targetEmail, user.role, 'INFO', 'Fastify API authentication successful');
          setIsLoading(false);
          login(user.role, targetEmail, password, {
            token: fastifyRes.data.accessToken,
            role: user.role,
            fullName: user.fullName || user.email,
            tenantId: user.tenantId,
          });
          return;
        }
      }

      const failStatus = rateLimiter.recordFailure(targetEmail);
      recordSecurityEvent(
        'LOGIN_FAILED',
        targetEmail,
        selectedRole,
        'WARNING',
        fastifyRes.error?.message || 'Authentication failed'
      );
      if (failStatus.isLocked) {
        setIsLocked(true);
        setLockoutSeconds(failStatus.lockoutRemainingSeconds);
      }
      if (
        fastifyRes.error?.code === 'CAPTCHA_REQUIRED' ||
        fastifyRes.error?.code === 'CAPTCHA_VERIFICATION_FAILED'
      ) {
        setCaptchaToken('');
        setCaptchaResetCount((c) => c + 1);
      }
      setError(fastifyRes.error?.message || 'Authentication failed. Please verify credentials and CAPTCHA challenge.');
      setIsLoading(false);
    } catch (err: any) {
      recordSecurityEvent(
        'LOGIN_FAILED',
        targetEmail,
        selectedRole,
        'CRITICAL',
        err?.message || 'Authentication server unreachable'
      );
      setCaptchaToken('');
      setCaptchaResetCount((c) => c + 1);
      setError('Authentication server is unreachable. Please verify network connectivity.');
      setIsLoading(false);
    }
  };

  const handleMfaVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fastifyMfaToken) {
      setError('MFA session expired or invalid. Please sign in again.');
      setMfaStepRequired(false);
      return;
    }

    const cleanCode = totpCode.trim().toUpperCase();
    const targetEmail = email.trim().toLowerCase();

    if (!useBackupCode && !/^\d{6}$/.test(cleanCode)) {
      setError('Please enter a valid 6-digit numeric TOTP code from your authenticator app.');
      return;
    }
    if (useBackupCode && (cleanCode.length < 6 || cleanCode.length > 32)) {
      setError('Please enter a valid emergency recovery code.');
      return;
    }

    setIsLoading(true);
    try {
      const mfaRes = useBackupCode
        ? await apiClient.verifyMfaRecovery(fastifyMfaToken, cleanCode)
        : await apiClient.verifyMfa(fastifyMfaToken, cleanCode);

      if (mfaRes.success && mfaRes.data?.accessToken) {
        const user = mfaRes.data.user;
        rateLimiter.reset(targetEmail);
        recordSecurityEvent(
          'MFA_VERIFIED',
          targetEmail,
          user.role,
          'INFO',
          useBackupCode ? 'MFA emergency recovery code verified' : 'MFA TOTP code verified'
        );
        setIsLoading(false);
        setMfaStepRequired(false);
        setFastifyMfaToken(null);
        login(user.role, targetEmail, password, {
          token: mfaRes.data.accessToken,
          role: user.role,
          fullName: user.fullName || user.email,
          tenantId: user.tenantId,
        });
        return;
      }

      setIsLoading(false);
      recordSecurityEvent(
        'MFA_FAILED',
        targetEmail,
        selectedRole,
        'WARNING',
        mfaRes.error?.message || 'MFA verification failed'
      );
      setError(
        mfaRes.error?.message ||
          (useBackupCode
            ? 'Invalid or already used emergency recovery code.'
            : 'Invalid or expired 6-digit TOTP code.')
      );
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || 'MFA verification failed.');
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSystemInitialized) {
      setError('First-time deployment setup is locked because a Master Administrator is already provisioned.');
      setAuthMode('LOGIN');
      return;
    }

    if (!provisioningToken.trim() || provisioningToken.trim().length < 8) {
      setError('A valid Server Provisioning Token (X-Bootstrap-Token) is required.');
      return;
    }
    if (!adminFullName.trim()) {
      setError('Please enter your Full Name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid primary administrator work email address.');
      return;
    }
    if (!passwordStrength.isValid) {
      setError(`Password policy requirement: ${passwordStrength.errors[0]}`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const targetEmail = email.trim().toLowerCase();
    setIsLoading(true);

    try {
      const res = await apiClient.provisionInstaller(
        {
          companyName: companyName.trim() || 'ServicePro OS',
          adminEmail: targetEmail,
          adminPassword: password,
          adminFullName: adminFullName.trim(),
        },
        provisioningToken.trim()
      );

      if (!res.success || !res.data?.accessToken) {
        setError(res.error?.message || 'First-time server provisioning failed.');
        setIsLoading(false);
        return;
      }

      await refreshSystemConfig();
      setIsLoading(false);
      login('ADMIN', targetEmail, password, {
        token: res.data.accessToken,
        role: 'ADMIN',
        fullName: res.data.admin?.fullName || adminFullName.trim(),
        tenantId: res.data.tenant?.id,
      });
    } catch (err: any) {
      setError(err?.message || 'Provisioning request failed.');
      setIsLoading(false);
    }
  };

  const handlePasswordResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccessMessage(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid account email address.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiClient.forgotPassword(email.trim().toLowerCase(), captchaToken || undefined);
      setIsLoading(false);
      if (!res.success) {
        if (
          res.error?.code === 'CAPTCHA_REQUIRED' ||
          res.error?.code === 'CAPTCHA_VERIFICATION_FAILED'
        ) {
          setCaptchaToken('');
          setCaptchaResetCount((c) => c + 1);
        }
        setError(res.error?.message || 'Failed to initiate password reset.');
        return;
      }
      setResetSuccessMessage(
        res.data?.message ||
          'If an account with that email exists, password reset instructions have been issued.'
      );
      setResetStep('VERIFY');
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch recovery instructions.');
      setIsLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!resetToken.trim() || resetToken.trim().length < 20) {
      setError('Please enter the full recovery token.');
      return;
    }
    if (password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiClient.resetPassword(resetToken.trim(), password);
      if (!res.success) {
        setError(res.error?.message || 'Password reset failed. Please verify your recovery token.');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      setResetSuccessMessage(
        res.data?.message || 'Password has been reset and existing sessions revoked. Please sign in.'
      );
      setPassword('');
      setConfirmPassword('');
      setResetToken('');
      setTimeout(() => {
        setAuthMode('LOGIN');
        setResetStep('REQUEST');
        setResetSuccessMessage(null);
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'An error occurred while resetting password.');
      setIsLoading(false);
    }
  };

  const displayName = agencyName || companyName || 'ServicePro OS';

  return (
    <div className="min-h-screen w-screen flex flex-col lg:flex-row bg-[#08101D] text-slate-800 antialiased overflow-x-hidden selection:bg-emerald-200 selection:text-black">
      {/* LEFT PANEL: Enterprise Operations Overview */}
      <div className="hidden lg:flex lg:w-[50%] xl:w-[52%] relative flex-col justify-between p-12 xl:p-16 bg-gradient-to-br from-[#060D17] via-[#0A1626] to-[#041E19] text-white overflow-hidden border-r border-slate-800/80">
        <div className="absolute inset-0 bg-[radial-gradient(#10B981_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#0C3832] to-[#145a50] border border-emerald-400/30 flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg tracking-tight text-white">{displayName}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                  {isDemoMode ? 'Sandbox' : 'Production'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">Field Service Operations Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-xl shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{isDemoMode ? 'Interactive Demo Node' : 'Enterprise API Node'}</span>
          </div>
        </div>

        <div className="relative z-10 my-auto py-8 max-w-xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>International Home Services Management Platform</span>
          </div>

          <h1 className="text-3xl xl:text-4xl font-black text-white tracking-tight leading-tight">
            Centralized Command for High-Volume Trade &amp; Field Dispatch.
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed font-normal">
            PostGIS spatial technician dispatch radar, verified trade credentialing, double-entry financial ledger, and row-level multi-tenant database isolation.
          </p>

          <div className="bg-slate-900/80 border border-emerald-500/30 backdrop-blur-xl rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>Platform Security Architecture</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">PostgreSQL 16 + PostGIS</span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Spatial Engine</div>
                <div className="text-xs font-black text-emerald-400 mt-1 flex items-center justify-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  <span>PostGIS Radar</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Tenant Guard</div>
                <div className="text-xs font-black text-white mt-1">FORCE RLS</div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Secret Vault</div>
                <div className="text-xs font-black text-teal-300 mt-1">AES-256-GCM</div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-6 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 text-slate-300 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            HttpOnly Session Rotation &amp; RFC 6238 TOTP MFA
          </span>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Encrypted Session</span>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Interactive Authentication Portal */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-16 bg-[#F8FAFC] min-h-screen">
        <div className="flex lg:hidden items-center justify-between pb-6 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0C3832] text-emerald-400 flex items-center justify-center shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-slate-900">{displayName}</div>
              <div className="text-[10px] text-slate-500 font-mono">Operations Portal</div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
            Secure Portal
          </span>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-6 sm:py-8">
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/50 p-6 sm:p-8">
            {mfaStepRequired ? (
              /* VIEW 1: Multi-Factor Authentication (6-Digit TOTP or Up-to-32-Char Recovery Code) */
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-100 text-emerald-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Two-Factor Authentication
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaStepRequired(false);
                      setFastifyMfaToken(null);
                      setError(null);
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    â† Back to Login
                  </button>
                </div>

                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-200 shadow-xs">
                    <KeyRound className="w-6 h-6 animate-pulse" />
                  </div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">
                    {useBackupCode ? 'Enter Emergency Recovery Code' : 'Enter Authenticator Code'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {useBackupCode
                      ? `Enter one of your single-use emergency backup codes for ${email}.`
                      : `Open your TOTP Authenticator app and enter the 6-digit code for ${email}.`}
                  </p>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleMfaVerifySubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 text-center uppercase tracking-wider">
                      {useBackupCode ? 'Emergency Recovery Code' : '6-Digit One-Time Passcode'}
                    </label>
                    <input
                      type="text"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder={useBackupCode ? 'XXXX-XXXX-XXXX-XXXX' : '000000'}
                      maxLength={useBackupCode ? 32 : 6}
                      autoComplete="one-time-code"
                      autoFocus
                      required
                      className={`w-full py-3.5 text-center font-mono font-black bg-slate-50 border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all shadow-inner ${
                        useBackupCode ? 'text-base tracking-wider px-3' : 'text-2xl tracking-widest'
                      }`}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 rounded-2xl font-extrabold text-xs text-white bg-[#0C3832] hover:bg-[#124e45] shadow-lg shadow-emerald-950/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span>Verifying...</span>
                    ) : (
                      <>
                        <span>Verify &amp; Enter Console</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUseBackupCode(!useBackupCode);
                        setTotpCode('');
                        setError(null);
                      }}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
                    >
                      {useBackupCode
                        ? 'â† Use 6-Digit Authenticator App'
                        : 'Use Emergency Recovery Code instead'}
                    </button>
                  </div>
                </form>
              </div>
            ) : authMode === 'FIRST_TIME_SETUP' ? (
              /* VIEW 2: Server-Controlled First-Time Master Admin Provisioning */
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-100 text-emerald-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    First-Time Server Provisioning
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('LOGIN');
                      setError(null);
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    Standard Sign In â†’
                  </button>
                </div>

                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    Initialize Master Administrator
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Runs database migrations, provisions the primary tenant organization and Chart of Accounts, and permanently locks public bootstrap.
                  </p>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSetupSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Server Bootstrap Token (X-Bootstrap-Token)
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={provisioningToken}
                        onChange={(e) => setProvisioningToken(e.target.value)}
                        placeholder="INITIAL_ADMIN_BOOTSTRAP_SECRET"
                        required
                        className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Your Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={adminFullName}
                        onChange={(e) => setAdminFullName(e.target.value)}
                        placeholder="Master Administrator"
                        required
                        className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Company / Organization Name
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="ServicePro Enterprise LLC"
                        required
                        className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Primary Master Work Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@yourcompany.com"
                        required
                        className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Master Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min 10 characters"
                          required
                          className="w-full pl-10 pr-9 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                          required
                          className="w-full pl-10 pr-9 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 py-3 rounded-2xl font-extrabold text-xs text-white bg-[#0C3832] hover:bg-[#124e45] shadow-lg shadow-emerald-950/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span>Provisioning Master Console...</span>
                    ) : (
                      <>
                        <span>Provision Tenant &amp; Enter Console</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : authMode === 'PASSWORD_RESET' ? (
              /* VIEW 3: Server-Backed Account Recovery & Password Reset */
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-amber-100 text-amber-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                    Account Recovery
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('LOGIN');
                      setError(null);
                      setResetSuccessMessage(null);
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    â† Back to Login
                  </button>
                </div>

                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    {resetStep === 'REQUEST' ? 'Reset Account Password' : 'Set New Account Password'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {resetStep === 'REQUEST'
                      ? 'Enter your verified account email. If an active account matches, a single-use 15-minute recovery token will be issued.'
                      : 'Enter your single-use recovery token and choose a new password.'}
                  </p>
                </div>

                {resetSuccessMessage && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{resetSuccessMessage}</span>
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                  </div>
                )}

                {resetStep === 'REQUEST' ? (
                  <form onSubmit={handlePasswordResetRequest} className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Account Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@yourcompany.com"
                          required
                          className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium"
                        />
                      </div>
                    </div>

                    <TurnstileWidget
                      onVerify={(token) => setCaptchaToken(token)}
                      onExpire={() => setCaptchaToken('')}
                      resetTrigger={captchaResetCount}
                    />

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                    >
                      {isLoading ? 'Requesting Recovery Token...' : 'Send Recovery Token â†’'}
                    </button>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => setResetStep('VERIFY')}
                        className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Already have a recovery token? Enter it here â†’
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handlePasswordResetSubmit} className="space-y-3.5">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Recovery Token
                      </label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={resetToken}
                          onChange={(e) => setResetToken(e.target.value)}
                          placeholder="Paste single-use recovery token..."
                          required
                          className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        New Password (Min 8 characters)
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                          required
                          className="w-full pl-10 pr-9 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                          required
                          className="w-full pl-10 pr-9 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 bg-[#0C3832] hover:bg-[#124e45] text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                    >
                      {isLoading ? 'Updating & Revoking Sessions...' : 'Confirm & Update Password'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* VIEW 4: Standard Enterprise Role-Based Sign In */
              <div className="space-y-6">
                <div className="flex rounded-2xl bg-slate-100/90 p-1 border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole('ADMIN');
                      setError(null);
                    }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      selectedRole === 'ADMIN'
                        ? 'bg-[#0C3832] text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Shield className={`w-3.5 h-3.5 ${selectedRole === 'ADMIN' ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span>Admin Portal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole('STAFF');
                      setError(null);
                    }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      selectedRole === 'STAFF'
                        ? 'bg-sky-700 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <UserCheck className={`w-3.5 h-3.5 ${selectedRole === 'STAFF' ? 'text-sky-300' : 'text-slate-400'}`} />
                    <span>Staff Desk</span>
                  </button>
                </div>

                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    {selectedRole === 'ADMIN' ? 'Administrator Sign In' : 'Field Operations Desk'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedRole === 'ADMIN'
                      ? 'Authorized executive access for company configuration and financials.'
                      : 'Authorized operator access for technician dispatch and order queues.'}
                  </p>
                </div>

                {isLocked && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-3 animate-in fade-in">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                    <div>
                      <strong className="text-sm font-bold block text-rose-950">Account Temporarily Locked</strong>
                      <p className="text-xs text-rose-700 mt-1">
                        Rate limit exceeded: 5 failed attempts. Auto-resumes in <strong>{lockoutSeconds} seconds</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {error && !isLocked && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span className="font-medium">{error}</span>
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Work Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        disabled={isLocked}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={
                          selectedRole === 'ADMIN'
                            ? adminProfile.email || 'admin@yourcompany.com'
                            : 'staff@yourcompany.com'
                        }
                        autoComplete="username"
                        required
                        className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        disabled={isLocked}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                        autoComplete="current-password"
                        required
                        className="w-full pl-10 pr-9 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-600 focus:bg-white text-slate-900 transition-all font-medium disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        disabled={isLocked}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-xs text-slate-600 font-medium">Keep session active</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('PASSWORD_RESET');
                        setError(null);
                        setResetSuccessMessage(null);
                        setResetStep('REQUEST');
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <TurnstileWidget
                    onVerify={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken('')}
                    resetTrigger={captchaResetCount}
                  />

                  <button
                    type="submit"
                    disabled={isLoading || isLocked}
                    className={`w-full py-3 rounded-2xl font-extrabold text-xs text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50 ${
                      selectedRole === 'ADMIN'
                        ? 'bg-[#0C3832] hover:bg-[#124e45] shadow-emerald-950/20'
                        : 'bg-sky-700 hover:bg-sky-800 shadow-sky-950/20'
                    }`}
                  >
                    {isLoading ? (
                      <span>Authenticating &amp; Verifying...</span>
                    ) : (
                      <>
                        <span>Sign In to {selectedRole === 'ADMIN' ? 'Admin Portal' : 'Operations Desk'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* One-Click Sandbox Login (strictly rendered ONLY when Demo Mode is active) */}
                {isDemoMode && (
                  <div className="pt-4 border-t border-indigo-100 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">
                        {t('oneClickDemo')}
                      </span>
                      <button
                        type="button"
                        onClick={toggleLocale}
                        className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        {t('switchLang')}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['ADMIN', 'STAFF'] as const).map((demoRole) => (
                        <button
                          key={demoRole}
                          type="button"
                          disabled={isLoading}
                          onClick={async () => {
                            setIsLoading(true);
                            setError(null);
                            try {
                              const res = await apiClient.demoLogin(demoRole);
                              if (!res.success || !res.data?.accessToken) {
                                setError(
                                  res.error?.message ||
                                    'Demo login unavailable. Ensure APP_DEMO_MODE=true and seed:demo has been run.'
                                );
                                return;
                              }
                              login(demoRole, res.data.user.email, '', {
                                token: res.data.accessToken,
                                role: demoRole,
                                fullName: res.data.user.fullName || res.data.user.email,
                                tenantId: res.data.user.tenantId,
                              });
                              addToast(`Signed into Interactive Sandbox as ${demoRole}`, 'success');
                            } catch (e: any) {
                              setError(e?.message || 'Demo login failed');
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                          className="py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                        >
                          {demoRole === 'ADMIN' ? t('demoAdmin') : t('demoStaff')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!isSystemInitialized ? (
                  <div className="pt-4 border-t border-slate-100 text-center space-y-2">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Unprovisioned installation detected â€” first-time Master Administrator setup is available.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('FIRST_TIME_SETUP');
                        setError(null);
                      }}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Run First-Time Master Admin Setup Wizard â†’</span>
                    </button>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-slate-100 text-center">
                    <span className="text-[11px] font-semibold text-slate-400 inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Master Administrator Provisioned â€¢ Public Bootstrap Locked</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-400 py-2 border-t border-slate-200/60 flex items-center justify-between">
          <span>&copy; {currentYear} {displayName}. All rights reserved.</span>
          <span className="font-mono text-[10px]">OWASP ASVS Level 3 Verified</span>
        </div>
      </div>
    </div>
  );
};
