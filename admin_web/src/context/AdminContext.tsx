import React, { useCallback, useEffect, useState, ReactNode } from 'react';
import { ALL_36_PAGES, MODULES_8 } from '../data/pagesMaster';
import { ALL_STAFF_PAGES, STAFF_MODULES } from '../data/staffPagesMaster';
import { recordSecurityEvent } from '../security/securityAuditLogger';
import { formatMoney, formatMoneyCents } from '../utils/formatters';
import { Booking, UserRole } from '../types';
import { useAuthSession } from './useAuthSession';
import { useOperationsData } from './useOperationsData';
import { AdminContext } from './adminContextCore';
import type {
  AuthSession,
  CMSConfig,
  Toast,
  UserProfile,
  ViewingProfileTarget,
} from './types';

export type { AuthSession, CMSConfig, Toast, UserProfile, ViewingProfileTarget };

export const AdminProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((title: string, type: Toast['type'] = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Navigation state
  const [currentPageId, setCurrentPageId] = useState<number>(1);
  const [activeModuleId, setActiveModuleId] = useState<number>(1);
  const [currentStaffPageId, setCurrentStaffPageId] = useState<number>(101);
  const [activeStaffModuleId, setActiveStaffModuleId] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  const navigateToPage = useCallback((pageId: number) => {
    if (pageId === 37) {
      setCurrentPageId(37);
      setActiveModuleId(8);
      window.location.hash = '/page/37';
      return;
    }
    if (pageId === 38) {
      setCurrentPageId(38);
      setActiveModuleId(8);
      window.location.hash = '/page/38';
      return;
    }
    const page = ALL_36_PAGES.find((p) => p.id === pageId);
    if (page) {
      setCurrentPageId(page.id);
      setActiveModuleId(page.moduleId);
      window.location.hash = `/page/${page.id}`;
    }
  }, []);

  const navigateToModule = useCallback(
    (moduleId: number) => {
      const mod = MODULES_8.find((m) => m.id === moduleId);
      if (mod && mod.pages.length > 0) {
        navigateToPage(mod.pages[0].id);
      }
    },
    [navigateToPage]
  );

  const navigateToStaffPage = useCallback((pageId: number) => {
    if (pageId === 114) {
      setCurrentStaffPageId(114);
      setActiveStaffModuleId(4);
      window.location.hash = '/staff/114';
      return;
    }
    const page = ALL_STAFF_PAGES.find((p) => p.id === pageId);
    if (page) {
      setCurrentStaffPageId(page.id);
      setActiveStaffModuleId(page.moduleId);
      window.location.hash = `/staff/${page.id}`;
    }
  }, []);

  const navigateToStaffModule = useCallback(
    (moduleId: number) => {
      const mod = STAFF_MODULES.find((m) => m.id === moduleId);
      if (mod && mod.pages.length > 0) {
        navigateToStaffPage(mod.pages[0].id);
      }
    },
    [navigateToStaffPage]
  );

  const onNavigateRoleDefault = useCallback((role: UserRole) => {
    if (role === 'ADMIN') {
      setCurrentPageId(1);
      setActiveModuleId(1);
      window.location.hash = '/page/1';
    } else {
      setCurrentStaffPageId(101);
      setActiveStaffModuleId(1);
      window.location.hash = '/staff/101';
    }
  }, []);

  const auth = useAuthSession(addToast, onNavigateRoleDefault);
  const ops = useOperationsData(
    auth.session,
    auth.currentRole,
    auth.tenantConfig,
    auth.updateSystemConfig,
    addToast
  );

  // Selected entity state & UI modal states
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedBookingForAssign, setSelectedBookingForAssign] = useState<Booking | null>(null);
  const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false);
  const [isCreateTechnicianModalOpen, setIsCreateTechnicianModalOpen] = useState(false);
  const [isCreateCategoryModalOpen, setIsCreateCategoryModalOpen] = useState(false);
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<'view' | 'edit'>('view');
  const [activeProfileTarget, setActiveProfileTarget] = useState<ViewingProfileTarget>({ type: 'admin' });
  const [isUniversalEditModalOpen, setIsUniversalEditModalOpen] = useState(false);
  const [universalEditTarget, setUniversalEditTarget] = useState<ViewingProfileTarget>({ type: 'admin' });
  const [isSMSModalOpen, setIsSMSModalOpen] = useState(false);
  const [smsRecipient, setSmsRecipient] = useState<{ name: string; phone: string; role?: string; type?: string } | null>(null);
  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
  const [dossierUser, setDossierUser] = useState<{ type: 'customer' | 'technician' | 'staff'; id: string } | null>(null);
  const [isMobileSimulatorOpen, setIsMobileSimulatorOpen] = useState(false);
  const [isDispatchSimulatorOpen, setIsDispatchSimulatorOpen] = useState(false);
  const [isWhiteLabelModalOpen, setIsWhiteLabelModalOpen] = useState(false);

  // Sync hash navigation & strict ADMIN/STAFF route separation
  useEffect(() => {
    if (auth.isAuthInitializing) return;

    const handleHash = () => {
      const hash = window.location.hash;
      if (!auth.session) {
        if (!hash.includes('/login')) {
          window.location.hash = '/login';
        }
        return;
      }

      if (auth.session.role === 'STAFF') {
        if (hash.includes('/page/') || hash.includes('/admin/')) {
          recordSecurityEvent(
            'PRIVILEGE_ELEVATION_DENIED',
            auth.session.user?.email || 'staff-session',
            'STAFF',
            'CRITICAL',
            `Staff session blocked from restricted administrative route: ${hash}`
          );
          addToast('Access Denied: Administrative Clearance Required', 'error');
          window.location.hash = `/staff/${currentStaffPageId || 101}`;
          return;
        }
        if (hash.includes('/staff/114')) {
          setCurrentStaffPageId(114);
          setActiveStaffModuleId(4);
          return;
        }
        const staffMatch = hash.match(/\/staff\/(\d+)/);
        if (staffMatch) {
          const id = parseInt(staffMatch[1], 10);
          const page = ALL_STAFF_PAGES.find((p) => p.id === id);
          if (page) {
            setCurrentStaffPageId(page.id);
            setActiveStaffModuleId(page.moduleId);
          }
        }
        return;
      }

      if (auth.session.role === 'ADMIN') {
        if (hash.includes('/staff/')) {
          addToast('Restricted: Staff workspace requires Staff credentials.', 'warning');
          window.location.hash = `/page/${currentPageId || 1}`;
          return;
        }
        if (hash.includes('/page/37')) {
          setCurrentPageId(37);
          setActiveModuleId(8);
          return;
        }
        if (hash.includes('installer') || hash.includes('/page/38')) {
          setCurrentPageId(38);
          setActiveModuleId(8);
          return;
        }
        const match = hash.match(/\/page\/(\d+)/) || hash.match(/\/admin\/(\d+)/) || hash.match(/#(\d+)/);
        if (match) {
          const id = parseInt(match[1], 10);
          const page = ALL_36_PAGES.find((p) => p.id === id);
          if (page) {
            setCurrentPageId(page.id);
            setActiveModuleId(page.moduleId);
          }
        }
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    (window as any).navigateToPage = navigateToPage;
    (window as any).navigateToStaffPage = navigateToStaffPage;
    return () => window.removeEventListener('hashchange', handleHash);
  }, [auth.isAuthInitializing, auth.session, currentStaffPageId, currentPageId, navigateToPage, navigateToStaffPage, addToast]);

  const navigateToFacebookProfile = useCallback(
    (target?: ViewingProfileTarget) => {
      const finalTarget =
        target ||
        (auth.currentRole === 'ADMIN'
          ? { type: 'admin' }
          : { type: 'staff', id: ops.staffMembers[0]?.id || '' });
      setActiveProfileTarget(finalTarget);
      if (finalTarget.type === 'customer' && finalTarget.id) setSelectedCustomerId(finalTarget.id);
      if (finalTarget.type === 'technician' && finalTarget.id) setSelectedTechnicianId(finalTarget.id);
      if (finalTarget.type === 'staff' && finalTarget.id) setSelectedStaffId(finalTarget.id);

      if (auth.currentRole === 'ADMIN') {
        setCurrentPageId(37);
        setActiveModuleId(8);
        window.location.hash = '/page/37';
      } else {
        setCurrentStaffPageId(114);
        setActiveStaffModuleId(4);
        window.location.hash = '/staff/114';
      }
    },
    [auth.currentRole, ops.staffMembers]
  );

  const openProfileModal = useCallback((tab: 'view' | 'edit' = 'view') => {
    setProfileModalTab(tab);
    setIsProfileModalOpen(true);
  }, []);

  const closeProfileModal = useCallback(() => setIsProfileModalOpen(false), []);

  const openUniversalEditModal = useCallback(
    (target?: ViewingProfileTarget) => {
      setUniversalEditTarget(target || activeProfileTarget);
      setIsUniversalEditModalOpen(true);
    },
    [activeProfileTarget]
  );

  const closeUniversalEditModal = useCallback(() => setIsUniversalEditModalOpen(false), []);

  const openSMSModal = useCallback((recipient: { name: string; phone: string; role?: string; type?: string }) => {
    setSmsRecipient(recipient);
    setIsSMSModalOpen(true);
  }, []);

  const closeSMSModal = useCallback(() => {
    setIsSMSModalOpen(false);
    setSmsRecipient(null);
  }, []);

  const openUserDossier = useCallback((type: 'customer' | 'technician' | 'staff', id: string) => {
    if (type === 'customer') setSelectedCustomerId(id);
    if (type === 'technician') setSelectedTechnicianId(id);
    if (type === 'staff') setSelectedStaffId(id);
    setDossierUser({ type, id });
    setIsDossierModalOpen(true);
  }, []);

  const closeUserDossier = useCallback(() => {
    setIsDossierModalOpen(false);
    setDossierUser(null);
  }, []);

  const openAssignModal = useCallback((booking: Booking) => {
    setSelectedBookingForAssign(booking);
    setIsAssignModalOpen(true);
  }, []);

  const closeAssignModal = useCallback(() => {
    setIsAssignModalOpen(false);
    setSelectedBookingForAssign(null);
  }, []);

  const formatCurrency = useCallback(
    (amount: number, overrideCurrencyCode?: string) => {
      const code = overrideCurrencyCode || auth.tenantConfig.currencyCode;
      const symbol = overrideCurrencyCode ? undefined : auth.tenantConfig.currencySymbol;
      return formatMoney(amount, code, symbol);
    },
    [auth.tenantConfig.currencyCode, auth.tenantConfig.currencySymbol]
  );

  const formatCurrencyCents = useCallback(
    (cents: number | string | null | undefined, overrideCurrencyCode?: string) => {
      const code = overrideCurrencyCode || auth.tenantConfig.currencyCode;
      const symbol = overrideCurrencyCode ? undefined : auth.tenantConfig.currencySymbol;
      return formatMoneyCents(cents, code, symbol);
    },
    [auth.tenantConfig.currencyCode, auth.tenantConfig.currencySymbol]
  );

  return (
    <AdminContext.Provider
      value={{
        session: auth.session,
        isAuthenticated: auth.isAuthenticated,
        isAuthInitializing: auth.isAuthInitializing,
        login: auth.login,
        logout: auth.logout,
        systemConfig: auth.systemConfig,
        tenantConfig: auth.tenantConfig,
        refreshSystemConfig: auth.refreshSystemConfig,
        updateSystemConfig: auth.updateSystemConfig,
        currentRole: auth.currentRole,
        userProfile: auth.userProfile,
        adminProfile: auth.adminProfile,
        updateUserProfile: auth.updateUserProfile,
        isProfileModalOpen,
        profileModalTab,
        openProfileModal,
        closeProfileModal,
        activeProfileTarget,
        setActiveProfileTarget,
        navigateToFacebookProfile,
        agencyName: auth.tenantConfig.name,
        agencyTagline:
          auth.tenantConfig.tagline ||
          (auth.isDemoMode ? 'Interactive Sandbox' : 'Enterprise Field Operations'),
        updateAgencyBranding: auth.updateAgencyBranding,
        selectedCustomerId,
        setSelectedCustomerId,
        selectedTechnicianId,
        setSelectedTechnicianId,
        selectedStaffId,
        setSelectedStaffId,
        isDossierModalOpen,
        dossierUser,
        openUserDossier,
        closeUserDossier,
        currentPageId,
        activeModuleId,
        navigateToPage,
        navigateToModule,
        currentStaffPageId,
        activeStaffModuleId,
        navigateToStaffPage,
        navigateToStaffModule,
        searchQuery,
        setSearchQuery,
        isSidebarCollapsed,
        toggleSidebar: () => setIsSidebarCollapsed((prev) => !prev),
        ...ops,
        selectedBookingId,
        setSelectedBookingId,
        selectedServiceId,
        setSelectedServiceId,
        selectedTicketId,
        setSelectedTicketId,
        isUniversalEditModalOpen,
        universalEditTarget,
        openUniversalEditModal,
        closeUniversalEditModal,
        isSMSModalOpen,
        smsRecipient,
        openSMSModal,
        closeSMSModal,
        isSessionLocked: auth.isSessionLocked,
        lockSession: auth.lockSession,
        unlockSession: auth.unlockSession,
        isCreateCustomerModalOpen,
        setIsCreateCustomerModalOpen,
        isCreateTechnicianModalOpen,
        setIsCreateTechnicianModalOpen,
        isCreateCategoryModalOpen,
        setIsCreateCategoryModalOpen,
        isCreateInvoiceModalOpen,
        setIsCreateInvoiceModalOpen,
        isAssignModalOpen,
        openAssignModal,
        closeAssignModal,
        selectedBookingForAssign,
        isCreateJobModalOpen,
        setIsCreateJobModalOpen,
        isDemoMode: auth.isDemoMode,
        isMobileSimulatorOpen,
        setIsMobileSimulatorOpen,
        isDispatchSimulatorOpen,
        setIsDispatchSimulatorOpen,
        isWhiteLabelModalOpen,
        setIsWhiteLabelModalOpen,
        formatCurrency,
        formatCurrencyCents,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};
