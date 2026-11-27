import {
  Booking,
  Technician,
  Customer,
  ServiceItem,
  ServiceCategory,
  Invoice,
  SupportTicket,
  CustomerReview,
  AuditLogItem,
  BookingStatus,
  UserRole,
  StaffMember,
  Incident,
  PricingConfig,
  SystemRuntimeConfig,
  TenantConfig,
} from '../types';

export interface CMSConfig {
  heroHeading: string;
  heroSubheading: string;
  searchPlaceholder?: string;
  promoCoupon: string;
  promoDiscount: number;
  heroGraphicName: string;
  heroGraphicDesc: string;
}

export interface Toast {
  id: string;
  title: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

export interface ViewingProfileTarget {
  type: 'admin' | 'staff' | 'technician' | 'customer';
  id?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  role: 'ADMIN' | 'STAFF';
  title: string;
  avatar: string;
  territory: string;
  department: string;
  twoFactorEnabled: boolean;
  bio: string;
}

export interface AuthSession {
  user: UserProfile;
  role: UserRole;
  token: string;
  tenantId?: string;
  loginTime: string;
}

export interface MutationResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AdminContextType {
  session: AuthSession | null;
  isAuthenticated: boolean;
  isAuthInitializing: boolean;
  login: (
    role: UserRole,
    email: string,
    password: string,
    verifiedSession?: { token: string; role: 'ADMIN' | 'STAFF'; fullName?: string; tenantId?: string }
  ) => boolean;
  logout: () => void;

  systemConfig: SystemRuntimeConfig | null;
  tenantConfig: TenantConfig;
  refreshSystemConfig: () => Promise<void>;
  updateSystemConfig: (
    updates: Partial<TenantConfig> & {
      logoUrl?: string | null;
      pricingConfig?: {
        surgeMultiplier?: number;
        minCalloutFee?: number;
        nightSurcharge?: number;
        surgeActive?: boolean;
      };
    }
  ) => Promise<MutationResult>;

  userProfile: UserProfile;
  adminProfile: UserProfile;
  updateUserProfile: (profile: Partial<UserProfile>) => Promise<MutationResult> | void;
  isProfileModalOpen: boolean;
  profileModalTab: 'view' | 'edit';
  openProfileModal: (tab?: 'view' | 'edit') => void;
  closeProfileModal: () => void;

  activeProfileTarget: ViewingProfileTarget;
  setActiveProfileTarget: (target: ViewingProfileTarget) => void;
  navigateToFacebookProfile: (target?: ViewingProfileTarget) => void;

  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  selectedTechnicianId: string;
  setSelectedTechnicianId: (id: string) => void;
  selectedStaffId: string;
  setSelectedStaffId: (id: string) => void;
  staffMembers: StaffMember[];
  isDossierModalOpen: boolean;
  dossierUser: { type: 'customer' | 'technician' | 'staff'; id: string } | null;
  openUserDossier: (type: 'customer' | 'technician' | 'staff', id: string) => void;
  closeUserDossier: () => void;

  agencyName: string;
  agencyTagline: string;
  updateAgencyBranding: (name: string, tagline?: string) => Promise<void>;

  currentRole: UserRole;

  currentPageId: number;
  activeModuleId: number;
  navigateToPage: (pageId: number) => void;
  navigateToModule: (moduleId: number) => void;

  currentStaffPageId: number;
  activeStaffModuleId: number;
  navigateToStaffPage: (pageId: number) => void;
  navigateToStaffModule: (moduleId: number) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  bookings: Booking[];
  technicians: Technician[];
  customers: Customer[];
  services: ServiceItem[];
  categories: ServiceCategory[];
  invoices: Invoice[];
  tickets: SupportTicket[];
  reviews: CustomerReview[];
  auditLogs: AuditLogItem[];
  incidents: Incident[];
  isDataLoading: boolean;
  refreshOperationsData: () => Promise<void>;

  selectedBookingId: string;
  setSelectedBookingId: (id: string) => void;
  selectedServiceId: string;
  setSelectedServiceId: (id: string) => void;
  selectedTicketId: string;
  setSelectedTicketId: (id: string) => void;

  pricingConfig: PricingConfig;
  updatePricingConfig: (updates: Partial<PricingConfig>) => Promise<void>;

  resolveIncident: (id: string, resolutionNotes?: string) => Promise<void>;
  acknowledgeAllIncidents: () => Promise<void>;
  updateTicketStatus: (ticketId: string, status: SupportTicket['status']) => Promise<void>;

  updateBookingStatus: (bookingId: string, status: BookingStatus, reason?: string) => Promise<MutationResult>;
  rescheduleBooking: (
    bookingId: string,
    newDateOrIso: string,
    newSlotOrReason?: string,
    reason?: string
  ) => Promise<MutationResult>;
  verifyBooking: (bookingId: string) => void;
  assignTechnician: (bookingId: string, technicianId: string, reason?: string) => Promise<MutationResult>;
  emergencyHandover: (bookingId: string, newTechnicianId: string, reason: string) => Promise<MutationResult>;
  createBooking: (newBooking: Partial<Booking>) => Promise<MutationResult>;

  cmsConfig: CMSConfig;
  updateCmsConfig: (updates: Partial<CMSConfig>) => Promise<MutationResult>;

  addCustomer: (customer: Partial<Customer>) => Promise<Customer | null>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<MutationResult>;
  addTechnician: (tech: Partial<Technician>) => Promise<Technician | null>;
  updateTechnician: (id: string, updates: Partial<Technician>) => Promise<MutationResult>;
  updateTechnicianDutyStatus: (
    id: string,
    dutyStatus: 'ONLINE' | 'OFFLINE' | 'ON_JOB' | 'EN_ROUTE'
  ) => Promise<MutationResult>;
  verifyTechnician: (id: string, isVerified: boolean, notes?: string) => Promise<MutationResult>;
  createStaffMember: (payload: {
    email: string;
    fullName: string;
    phone?: string;
    department?: string;
    assignedTerritory?: string;
    shiftHours?: string;
    password?: string;
  }) => Promise<MutationResult>;
  updateStaffMember: (
    id: string,
    updates: {
      fullName?: string;
      phone?: string | null;
      department?: string | null;
      assignedTerritory?: string | null;
      shiftHours?: string | null;
      isActive?: boolean;
    }
  ) => Promise<MutationResult>;
  addService: (service: Partial<ServiceItem>) => Promise<ServiceItem | null>;
  updateService: (id: string, updates: Partial<ServiceItem>) => Promise<MutationResult>;
  deleteService: (id: string) => Promise<MutationResult>;
  addCategory: (category: Partial<ServiceCategory>) => Promise<ServiceCategory | null>;
  updateCategory: (id: string, updates: Partial<ServiceCategory>) => Promise<MutationResult>;
  deleteCategory: (id: string) => Promise<MutationResult>;
  addInvoice: (invoice: Partial<Invoice> & { bookingId?: string; subtotalAmount?: number }) => Promise<MutationResult>;
  moderateReview: (reviewId: string, isPublic: boolean, moderationFlagged: boolean) => Promise<MutationResult>;

  isUniversalEditModalOpen: boolean;
  universalEditTarget: ViewingProfileTarget;
  openUniversalEditModal: (target?: ViewingProfileTarget) => void;
  closeUniversalEditModal: () => void;

  isSMSModalOpen: boolean;
  smsRecipient: { name: string; phone: string; role?: string; type?: string } | null;
  openSMSModal: (recipient: { name: string; phone: string; role?: string; type?: string }) => void;
  closeSMSModal: () => void;

  isSessionLocked: boolean;
  lockSession: () => void;
  unlockSession: (password?: string) => Promise<{ ok: boolean; error?: string }>;

  isCreateCustomerModalOpen: boolean;
  setIsCreateCustomerModalOpen: (open: boolean) => void;
  isCreateTechnicianModalOpen: boolean;
  setIsCreateTechnicianModalOpen: (open: boolean) => void;
  isCreateCategoryModalOpen: boolean;
  setIsCreateCategoryModalOpen: (open: boolean) => void;
  isCreateInvoiceModalOpen: boolean;
  setIsCreateInvoiceModalOpen: (open: boolean) => void;

  isAssignModalOpen: boolean;
  openAssignModal: (booking: Booking) => void;
  closeAssignModal: () => void;
  selectedBookingForAssign: Booking | null;

  isCreateJobModalOpen: boolean;
  setIsCreateJobModalOpen: (open: boolean) => void;

  isDemoMode: boolean;
  isMobileSimulatorOpen: boolean;
  setIsMobileSimulatorOpen: (open: boolean) => void;
  isDispatchSimulatorOpen: boolean;
  setIsDispatchSimulatorOpen: (open: boolean) => void;
  isWhiteLabelModalOpen: boolean;
  setIsWhiteLabelModalOpen: (open: boolean) => void;

  formatCurrency: (amount: number, overrideCurrencyCode?: string) => string;
  formatCurrencyCents: (cents: number | string | null | undefined, overrideCurrencyCode?: string) => string;

  toasts: Toast[];
  addToast: (title: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}
