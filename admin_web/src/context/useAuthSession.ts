import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { IS_DEMO_MODE } from '../i18n/localeCore';
import { verifySessionValidity } from '../security/sessionManager';
import { recordSecurityEvent } from '../security/securityAuditLogger';
import type { SystemRuntimeConfig, TenantConfig, UserRole } from '../types';
import type { AuthSession, MutationResult, Toast, UserProfile } from './types';

export const DEFAULT_TENANT_CONFIG: TenantConfig = {
  name: 'ServicePro OS',
  slug: 'default',
  primaryColor: '#6366F1',
  currencyCode: 'AED',
  currencySymbol: 'AED ',
  timezone: 'Asia/Dubai',
  commissionBps: 1500,
  taxRateBps: 500,
  vatPercent: 5,
  taxName: 'VAT',
  countryCode: 'AE',
  distanceUnit: 'km',
  supportPhone: null,
  supportWhatsapp: null,
  emergencyPhone: null,
  logoUrl: null,
  defaultLocale: 'en',
  defaultMapLat: 25.2048,
  defaultMapLng: 55.2708,
};

const LOCK_STORAGE_KEY = 'servicepro_session_locked';

function buildEmptyProfile(role: 'ADMIN' | 'STAFF'): UserProfile {
  return {
    name: '',
    email: '',
    phone: '',
    role,
    title: role === 'ADMIN' ? 'Platform Administrator' : 'Operations Coordinator',
    avatar: '',
    territory: '',
    department: role === 'ADMIN' ? 'Executive Administration' : 'Field Operations',
    twoFactorEnabled: false,
    bio: '',
  };
}

export function useAuthSession(
  addToast: (title: string, type?: Toast['type']) => void,
  onNavigateRoleDefault: (role: UserRole) => void
) {
  const [systemConfig, setSystemConfig] = useState<SystemRuntimeConfig | null>(null);
  const [tenantConfig, setTenantConfig] = useState<TenantConfig>(DEFAULT_TENANT_CONFIG);

  const [adminProfile, setAdminProfile] = useState<UserProfile>(() => buildEmptyProfile('ADMIN'));
  const [staffProfile, setStaffProfile] = useState<UserProfile>(() => buildEmptyProfile('STAFF'));

  const [session, setSession] = useState<AuthSession | null>(null);
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(true);
  const [isSessionLocked, setIsSessionLocked] = useState<boolean>(() => {
    try {
      return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(LOCK_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const lastActivityRef = useRef<number>(0);

  const applyServerTenant = useCallback((cfg: SystemRuntimeConfig | null) => {
    if (!cfg) return;
    setSystemConfig(cfg);
    if (cfg.tenant) {
      setTenantConfig({
        ...cfg.tenant,
        ...(cfg.pricingConfig ? { pricingConfig: cfg.pricingConfig } : {}),
      });
    } else {
      setTenantConfig((prev) => ({
        ...prev,
        currencyCode: cfg.defaultCurrency || prev.currencyCode,
        taxRateBps: Math.round((cfg.defaultVatPercent ?? 5) * 100),
        vatPercent: cfg.defaultVatPercent ?? 5,
        taxName: cfg.defaultTaxName || prev.taxName,
        countryCode: cfg.defaultCountryCode || prev.countryCode,
        distanceUnit: cfg.defaultDistanceUnit || prev.distanceUnit,
        ...(cfg.pricingConfig ? { pricingConfig: cfg.pricingConfig } : {}),
      }));
    }
  }, []);

  const refreshSystemConfig = useCallback(async () => {
    const res = await apiClient.getSystemConfig();
    if (res.success && res.data) {
      applyServerTenant(res.data);
    }
  }, [applyServerTenant]);

  const hydrateUserFromMe = useCallback(async (fallbackEmail: string, fallbackRole: UserRole, token: string, fullNameHint?: string) => {
    const meRes = await apiClient.getMe();
    if (!meRes.success || !meRes.data?.user) {
      return null;
    }
    const u = meRes.data.user;
    const serverRole = String(u.role || fallbackRole).toUpperCase();
    if (serverRole !== 'ADMIN' && serverRole !== 'STAFF') {
      return null;
    }
    if (meRes.data.tenant) {
      setTenantConfig((prev) => ({ ...prev, ...meRes.data.tenant }));
    }
    const profile: UserProfile = {
      name: u.fullName || fullNameHint || u.email?.split('@')[0] || (serverRole === 'ADMIN' ? 'Administrator' : 'Dispatcher'),
      email: u.email || fallbackEmail,
      phone: u.phone || '',
      role: serverRole,
      title: serverRole === 'ADMIN' ? 'Platform Administrator' : 'Operations Coordinator',
      avatar: u.avatarUrl || '',
      territory: u.assignedTerritory || meRes.data.tenant?.countryCode || '',
      department:
        u.department || (serverRole === 'ADMIN' ? 'Executive Administration' : 'Field Operations'),
      twoFactorEnabled: Boolean(u.mfaEnabled),
      bio: '',
    };
    if (serverRole === 'ADMIN') {
      setAdminProfile(profile);
    } else {
      setStaffProfile(profile);
    }
    const nextSession: AuthSession = {
      user: profile,
      role: serverRole,
      token,
      tenantId: u.tenantId,
      loginTime: new Date().toISOString(),
    };
    setSession(nextSession);
    return nextSession;
  }, []);

  // Boot effect: load public /system/config + silently restore HttpOnly cookie session
  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        const cfgRes = await apiClient.getSystemConfig();
        if (active && cfgRes.success && cfgRes.data) {
          applyServerTenant(cfgRes.data);
        }

        const restored = await apiClient.restoreSession();
        if (!active) return;

        if (restored?.accessToken && restored.user) {
          const role = String(restored.user.role || '').toUpperCase();
          if (role === 'ADMIN' || role === 'STAFF') {
            apiClient.setToken(restored.accessToken);
            if (restored.user.tenantId) {
              apiClient.setTenantId(restored.user.tenantId);
            }
            const hydrated = await hydrateUserFromMe(
              restored.user.email,
              role as UserRole,
              restored.accessToken
            );
            if (!hydrated && active) {
              apiClient.clearSession();
              setSession(null);
            }
          } else {
            apiClient.clearSession();
          }
        } else {
          const lockedHint = apiClient.getLockedSessionHint();
          if (lockedHint?.locked && active) {
            const lockedRole: UserRole =
              String(lockedHint.role || '').toUpperCase() === 'STAFF' ? 'STAFF' : 'ADMIN';
            const lockedEmail = lockedHint.email || '';
            const shellProfile: UserProfile = {
              ...buildEmptyProfile(lockedRole),
              email: lockedEmail,
              name: lockedEmail ? lockedEmail.split('@')[0] : lockedRole,
            };
            if (lockedRole === 'ADMIN') {
              setAdminProfile(shellProfile);
            } else {
              setStaffProfile(shellProfile);
            }
            setSession({
              user: shellProfile,
              role: lockedRole,
              token: '',
              loginTime: new Date().toISOString(),
            });
            setIsSessionLocked(true);
            try {
              sessionStorage.setItem(LOCK_STORAGE_KEY, '1');
            } catch {
              // ignore
            }
          }
        }
      } finally {
        if (active) {
          setIsAuthInitializing(false);
        }
      }
    }
    boot();
    return () => {
      active = false;
    };
  }, [applyServerTenant, hydrateUserFromMe]);

  const isAuthenticated = session !== null;
  const currentRole: UserRole = session?.role || 'ADMIN';
  const userProfile = currentRole === 'ADMIN' ? adminProfile : staffProfile;
  const isDemoMode = IS_DEMO_MODE || Boolean(systemConfig?.demoMode);

  const login = useCallback(
    (
      role: UserRole,
      email: string,
      _password: string,
      verifiedSession?: { token: string; role: 'ADMIN' | 'STAFF'; fullName?: string; tenantId?: string }
    ): boolean => {
      if (!verifiedSession || !verifiedSession.token) {
        addToast('Authentication failed: verified server session token is required.', 'error');
        return false;
      }

      const authoritativeRole: UserRole = verifiedSession.role || role;
      apiClient.setToken(verifiedSession.token);
      if (verifiedSession.tenantId) {
        apiClient.setTenantId(verifiedSession.tenantId);
      }

      const normalizedEmail = email.trim().toLowerCase();
      const baseProfile = authoritativeRole === 'ADMIN' ? adminProfile : staffProfile;
      const effectiveProfile: UserProfile = {
        ...baseProfile,
        email: normalizedEmail || baseProfile.email,
        name: verifiedSession.fullName || baseProfile.name || (authoritativeRole === 'ADMIN' ? 'Administrator' : 'Dispatcher'),
        role: authoritativeRole,
        twoFactorEnabled: false,
      };

      if (authoritativeRole === 'ADMIN') {
        setAdminProfile(effectiveProfile);
      } else {
        setStaffProfile(effectiveProfile);
      }

      const nextSession: AuthSession = {
        user: effectiveProfile,
        role: authoritativeRole,
        token: verifiedSession.token,
        tenantId: verifiedSession.tenantId,
        loginTime: new Date().toISOString(),
      };
      setSession(nextSession);
      lastActivityRef.current = Date.now();
      setIsSessionLocked(false);
      try {
        sessionStorage.removeItem(LOCK_STORAGE_KEY);
      } catch {
        // ignore
      }

      void hydrateUserFromMe(normalizedEmail, authoritativeRole, verifiedSession.token, verifiedSession.fullName);
      void refreshSystemConfig();

      addToast(
        `Authenticated successfully as ${authoritativeRole === 'ADMIN' ? 'Administrator' : 'Operations Staff'}`,
        'success'
      );
      onNavigateRoleDefault(authoritativeRole);
      return true;
    },
    [adminProfile, staffProfile, addToast, hydrateUserFromMe, refreshSystemConfig, onNavigateRoleDefault]
  );

  const lockSession = useCallback(() => {
    setIsSessionLocked(true);
    try {
      sessionStorage.setItem(LOCK_STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    void apiClient.lockSession().catch(() => {});
    apiClient.setToken(null);
    recordSecurityEvent(
      'SESSION_LOCKED',
      session?.user?.email || 'authenticated-user',
      currentRole,
      'INFO',
      'Console session locked by user or idle timeout'
    );
    addToast('Console locked. Enter your account password to resume.', 'warning');
  }, [addToast, session?.user?.email, currentRole]);

  const unlockSession = useCallback(
    async (password?: string): Promise<{ ok: boolean; error?: string }> => {
      const candidate = (password || '').trim();
      if (!candidate) {
        const msg = 'Please enter your account password to unlock the session.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }

      const res = await apiClient.reauthenticate(candidate);
      if (res.success && res.data?.verified) {
        if (res.data.accessToken) {
          apiClient.setToken(String(res.data.accessToken));
          const unlockedRole = (String(res.data.user?.role || currentRole).toUpperCase() === 'STAFF'
            ? 'STAFF'
            : 'ADMIN') as UserRole;
          await hydrateUserFromMe(
            res.data.user?.email || session?.user?.email || '',
            unlockedRole,
            String(res.data.accessToken)
          );
        }
        setIsSessionLocked(false);
        lastActivityRef.current = Date.now();
        try {
          sessionStorage.removeItem(LOCK_STORAGE_KEY);
        } catch {
          // ignore
        }
        recordSecurityEvent(
          'SESSION_UNLOCKED',
          session?.user?.email || 'authenticated-user',
          currentRole,
          'INFO',
          'Console session unlocked via server password re-authentication'
        );
        addToast('Session unlocked.', 'success');
        return { ok: true };
      }

      const errMsg = res.error?.message || 'Incorrect password. Re-authentication failed.';
      recordSecurityEvent(
        'UNAUTHORIZED_ACCESS_ATTEMPT',
        session?.user?.email || 'authenticated-user',
        currentRole,
        'WARNING',
        'Failed server password re-authentication on lock screen'
      );
      addToast(errMsg, 'error');
      return { ok: false, error: errMsg };
    },
    [addToast, hydrateUserFromMe, session?.user?.email, currentRole]
  );

  const logout = useCallback(() => {
    setIsSessionLocked(false);
    try {
      sessionStorage.removeItem(LOCK_STORAGE_KEY);
    } catch {
      // ignore
    }
    setSession(null);
    void apiClient.logout().catch(() => {});
    apiClient.clearSession();
    addToast('You have been safely signed out.', 'info');
    window.location.hash = '/login';
  }, [addToast]);

  const updateUserProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<MutationResult> => {
      const hasPersistedFields =
        updates.name !== undefined ||
        updates.phone !== undefined ||
        updates.department !== undefined ||
        updates.territory !== undefined ||
        updates.avatar !== undefined;

      if (hasPersistedFields) {
        const res = await apiClient.updateMe({
          ...(updates.name !== undefined && updates.name.trim() ? { fullName: updates.name.trim() } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone.trim() || null } : {}),
          ...(updates.department !== undefined ? { department: updates.department.trim() || null } : {}),
          ...(updates.territory !== undefined ? { assignedTerritory: updates.territory.trim() || null } : {}),
          ...(updates.avatar !== undefined ? { avatarUrl: updates.avatar.trim() || null } : {}),
        });
        if (!res.success) {
          const msg = res.error?.message || 'Failed to save profile changes to PostgreSQL.';
          addToast(msg, 'error');
          return { ok: false, error: msg };
        }
      }

      if (currentRole === 'ADMIN') {
        setAdminProfile((prev) => ({ ...prev, ...updates }));
      } else {
        setStaffProfile((prev) => ({ ...prev, ...updates }));
      }
      setSession((prev) => (prev ? { ...prev, user: { ...prev.user, ...updates } } : prev));
      if (hasPersistedFields) {
        addToast('Profile details persisted to PostgreSQL.', 'success');
      }
      return { ok: true };
    },
    [currentRole, addToast]
  );

  const updateSystemConfig = useCallback(
    async (
      updates: Partial<TenantConfig> & {
        logoUrl?: string | null;
        pricingConfig?: {
          surgeMultiplier?: number;
          minCalloutFee?: number;
          nightSurcharge?: number;
          surgeActive?: boolean;
        };
      }
    ): Promise<MutationResult> => {
      const res = await apiClient.updateSystemConfig(updates);
      if (!res.success || !res.data?.tenant) {
        const msg = res.error?.message || 'Failed to update tenant system settings.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      const nextTenant: TenantConfig = {
        ...res.data.tenant,
        ...(res.data.pricingConfig !== undefined ? { pricingConfig: res.data.pricingConfig } : {}),
      };
      setTenantConfig(nextTenant);
      setSystemConfig((prev) =>
        prev
          ? {
              ...prev,
              tenant: nextTenant,
              ...(res.data?.pricingConfig !== undefined ? { pricingConfig: res.data.pricingConfig } : {}),
            }
          : prev
      );
      addToast('Tenant platform configuration saved to PostgreSQL.', 'success');
      return { ok: true };
    },
    [addToast]
  );

  const updateAgencyBranding = useCallback(
    async (name: string, tagline?: string) => {
      const finalName = name.trim();
      if (!finalName) return;
      await updateSystemConfig({
        name: finalName,
        ...(tagline !== undefined ? { tagline: tagline.trim() || null } : {}),
      });
    },
    [updateSystemConfig]
  );

  useEffect(() => {
    document.title = tenantConfig.name ? `${tenantConfig.name} | Operations Console` : 'Operations Console';
  }, [tenantConfig.name]);

  // 15-minute idle timeout watcher
  useEffect(() => {
    if (!isAuthenticated) return;
    lastActivityRef.current = Date.now();

    const recordActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    const timer = setInterval(() => {
      try {
        if (isSessionLocked) return;
        const validity = verifySessionValidity(session, lastActivityRef.current);
        if (validity.isExpired) {
          recordSecurityEvent(
            'SESSION_EXPIRED',
            session?.user?.email || 'authenticated-user',
            currentRole,
            'WARNING',
            validity.reason || 'Session expired after 12 hours'
          );
          logout();
          addToast('Session expired after 12 hours. Please sign in again.', 'error');
        } else if (validity.isIdleTimedOut) {
          lockSession();
        }
      } catch {
        // non-fatal heartbeat check
      }
    }, 15000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, recordActivity));
      clearInterval(timer);
    };
  }, [isAuthenticated, isSessionLocked, session, currentRole, logout, lockSession, addToast]);

  return {
    systemConfig,
    tenantConfig,
    refreshSystemConfig,
    updateSystemConfig,
    updateAgencyBranding,
    session,
    isAuthenticated,
    isAuthInitializing,
    isDemoMode,
    currentRole,
    userProfile,
    adminProfile,
    updateUserProfile,
    login,
    logout,
    isSessionLocked,
    lockSession,
    unlockSession,
  };
}
