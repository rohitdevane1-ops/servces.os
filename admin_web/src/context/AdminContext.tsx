import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { verifySessionValidity } from '../security/sessionManager';
import { recordSecurityEvent } from '../security/securityAuditLogger';
import { supabaseService, SupabaseConfigState } from '../services/supabaseClient';
import { apiClient } from '../services/apiClient';
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
  PricingConfig
} from '../types';

export interface CMSConfig {
  heroHeading: string;
  heroSubheading: string;
  promoCoupon: string;
  promoDiscount: number;
  heroGraphicName: string;
  heroGraphicDesc: string;
}
import { 
  INITIAL_BOOKINGS, 
  INITIAL_TECHNICIANS, 
  INITIAL_CUSTOMERS, 
  INITIAL_SERVICES, 
  SERVICE_CATEGORIES, 
  INITIAL_INVOICES, 
  INITIAL_TICKETS, 
  INITIAL_REVIEWS, 
  INITIAL_AUDIT_LOGS,
  INITIAL_STAFF_MEMBERS
} from '../data/mockData';
import { ALL_36_PAGES, MODULES_8 } from '../data/pagesMaster';
import { ALL_STAFF_PAGES, STAFF_MODULES } from '../data/staffPagesMaster';

interface Toast {
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

function loadOperationalState<T>(storageKey: string, devFallback: T[]): T[] {
  if (import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE !== 'true') {
    return [];
  }
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return devFallback;
    }
  }
  return devFallback;
}

export const INITIAL_INCIDENTS: Incident[] = [];

export interface AuthSession {
  user: UserProfile;
  role: UserRole;
  token: string;
  loginTime: string;
}

interface AdminContextType {
  // Authentication & Authorization Session (Production-Ready)
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (
    role: UserRole,
    email: string,
    password: string,
    verifiedCloudSession?: { token: string; role: 'ADMIN' | 'STAFF'; fullName?: string }
  ) => boolean;
  setupMasterAdmin: (
    name: string,
    email: string,
    password?: string,
    companyName?: string,
    verifiedToken?: string
  ) => boolean;
  logout: () => void;

  // User Profile
  userProfile: UserProfile;
  adminProfile: UserProfile;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  isProfileModalOpen: boolean;
  profileModalTab: 'view' | 'edit';
  openProfileModal: (tab?: 'view' | 'edit') => void;
  closeProfileModal: () => void;

  // Facebook-Style Profile Navigation & Inspection
  activeProfileTarget: ViewingProfileTarget;
  setActiveProfileTarget: (target: ViewingProfileTarget) => void;
  navigateToFacebookProfile: (target?: ViewingProfileTarget) => void;

  // Universal User Dossier & Entity Selection (Customer, Technician, Staff)
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

  // White-label agency branding
  agencyName: string;
  agencyTagline: string;
  updateAgencyBranding: (name: string, tagline?: string) => void;

  // Current Role
  currentRole: UserRole;

  // Admin Navigation
  currentPageId: number;
  activeModuleId: number;
  navigateToPage: (pageId: number) => void;
  navigateToModule: (moduleId: number) => void;

  // Staff Navigation
  currentStaffPageId: number;
  activeStaffModuleId: number;
  navigateToStaffPage: (pageId: number) => void;
  navigateToStaffModule: (moduleId: number) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Domain data
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

  // Entity Details Selection IDs
  selectedBookingId: string;
  setSelectedBookingId: (id: string) => void;
  selectedServiceId: string;
  setSelectedServiceId: (id: string) => void;
  selectedTicketId: string;
  setSelectedTicketId: (id: string) => void;

  // Dynamic Pricing & Platform Commission Configuration
  pricingConfig: PricingConfig;
  updatePricingConfig: (updates: Partial<PricingConfig>) => void;

  // Incidents & Alerts Mutations
  resolveIncident: (id: string) => void;
  acknowledgeAllIncidents: () => void;

  // Mutations
  updateBookingStatus: (bookingId: string, status: BookingStatus) => void;
  rescheduleBooking: (bookingId: string, newDate: string, newSlot: string, reason?: string) => void;
  verifyBooking: (bookingId: string) => void;
  assignTechnician: (bookingId: string, technicianId: string) => void;
  emergencyHandover: (bookingId: string, newTechnicianId: string, reason: string) => void;
  createBooking: (newBooking: Partial<Booking>) => void;

  // Website & Mobile CMS Configuration
  cmsConfig: CMSConfig;
  updateCmsConfig: (updates: Partial<CMSConfig>) => void;
  
  // Entity CRUD Mutations
  addCustomer: (customer: Partial<Customer>) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  addTechnician: (tech: Partial<Technician>) => Technician;
  updateTechnician: (id: string, updates: Partial<Technician>) => void;
  addService: (service: Partial<ServiceItem>) => ServiceItem;
  updateService: (id: string, updates: Partial<ServiceItem>) => void;
  deleteService: (id: string) => void;
  addCategory: (category: Partial<ServiceCategory>) => ServiceCategory;
  updateCategory: (id: string, updates: Partial<ServiceCategory>) => void;
  addInvoice: (invoice: Partial<Invoice>) => Invoice;

  // Universal Entity Edit Modal (For Admin, Staff, Customer, Tech)
  isUniversalEditModalOpen: boolean;
  universalEditTarget: ViewingProfileTarget;
  openUniversalEditModal: (target?: ViewingProfileTarget) => void;
  closeUniversalEditModal: () => void;

  // Direct SMS Dispatch Modal
  isSMSModalOpen: boolean;
  smsRecipient: { name: string; phone: string; role?: string; type?: string } | null;
  openSMSModal: (recipient: { name: string; phone: string; role?: string; type?: string }) => void;
  closeSMSModal: () => void;

  // Session Security Lock
  isSessionLocked: boolean;
  lockSession: () => void;
  unlockSession: (pin?: string) => boolean;

  // Dedicated Administrative Registration Modals
  isCreateCustomerModalOpen: boolean;
  setIsCreateCustomerModalOpen: (open: boolean) => void;
  isCreateTechnicianModalOpen: boolean;
  setIsCreateTechnicianModalOpen: (open: boolean) => void;
  isCreateCategoryModalOpen: boolean;
  setIsCreateCategoryModalOpen: (open: boolean) => void;
  isCreateInvoiceModalOpen: boolean;
  setIsCreateInvoiceModalOpen: (open: boolean) => void;

  // Modals & Drawers
  isAssignModalOpen: boolean;
  openAssignModal: (booking: Booking) => void;
  closeAssignModal: () => void;
  selectedBookingForAssign: Booking | null;

  isCreateJobModalOpen: boolean;
  setIsCreateJobModalOpen: (open: boolean) => void;

  // Commercial Turnkey Suite (Ready-to-Sell)
  isDemoMode: boolean;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
  isMobileSimulatorOpen: boolean;
  setIsMobileSimulatorOpen: (open: boolean) => void;
  isDispatchSimulatorOpen: boolean;
  setIsDispatchSimulatorOpen: (open: boolean) => void;
  isWhiteLabelModalOpen: boolean;
  setIsWhiteLabelModalOpen: (open: boolean) => void;

  // Cloud Supabase Shared Persistence Engine
  supabaseConfig: SupabaseConfigState;
  testSupabaseConnection: () => Promise<{ success: boolean; message: string; latencyMs?: number }>;

  toasts: Toast[];
  addToast: (title: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [agencyName, setAgencyName] = useState<string>(() => {
    return localStorage.getItem('servicepro_agency_name') || '';
  });
  const [agencyTagline, setAgencyTagline] = useState<string>(() => {
    return localStorage.getItem('servicepro_agency_tagline') || '';
  });

  // User Profile Data - Clean Unpopulated Production Defaults
  const [adminProfile, setAdminProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('servicepro_admin_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      name: '',
      email: '',
      phone: '',
      role: 'ADMIN',
      title: 'Platform Administrator',
      avatar: '',
      territory: '',
      department: 'Executive Administration',
      twoFactorEnabled: false,
      bio: ''
    };
  });

  const [staffProfile, setStaffProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('servicepro_staff_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      name: '',
      email: '',
      phone: '',
      role: 'STAFF',
      title: 'Operations Coordinator',
      avatar: '',
      territory: '',
      department: 'Field Operations',
      twoFactorEnabled: false,
      bio: ''
    };
  });

  // Production Session & Role State
  const [session, setSession] = useState<AuthSession | null>(() => {
    const saved = localStorage.getItem('servicepro_auth_session');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s && s.token && typeof s.token === 'string') {
          // In production, reject synthetic client tokens and purge invalid session
          if (import.meta.env.PROD && s.token.startsWith('tok_')) {
            localStorage.removeItem('servicepro_auth_session');
            return null;
          }
          return s;
        }
      } catch (e) {}
    }
    return null;
  });

  const isAuthenticated = session !== null;
  const currentRole: UserRole = session?.role || 'ADMIN';
  const userProfile = currentRole === 'ADMIN' ? adminProfile : staffProfile;

  const [currentPageId, setCurrentPageId] = useState<number>(1);
  const [activeModuleId, setActiveModuleId] = useState<number>(1);

  const [currentStaffPageId, setCurrentStaffPageId] = useState<number>(101);
  const [activeStaffModuleId, setActiveStaffModuleId] = useState<number>(1);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const [bookings, setBookings] = useState<Booking[]>(() =>
    loadOperationalState('servicepro_bookings', INITIAL_BOOKINGS)
  );
  const [technicians, setTechnicians] = useState<Technician[]>(() =>
    loadOperationalState('servicepro_technicians', INITIAL_TECHNICIANS)
  );
  const [customers, setCustomers] = useState<Customer[]>(() =>
    loadOperationalState('servicepro_customers', INITIAL_CUSTOMERS)
  );
  const [services, setServices] = useState<ServiceItem[]>(() =>
    loadOperationalState('servicepro_services', INITIAL_SERVICES)
  );
  const [categories, setCategories] = useState<ServiceCategory[]>(() =>
    loadOperationalState('servicepro_categories', SERVICE_CATEGORIES)
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    loadOperationalState('servicepro_invoices', INITIAL_INVOICES)
  );
  const [tickets, setTickets] = useState<SupportTicket[]>(() =>
    loadOperationalState('servicepro_tickets', INITIAL_TICKETS)
  );
  const [reviews, setReviews] = useState<CustomerReview[]>(() =>
    loadOperationalState('servicepro_reviews', INITIAL_REVIEWS)
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() =>
    loadOperationalState('servicepro_audit_logs', INITIAL_AUDIT_LOGS)
  );

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedBookingForAssign, setSelectedBookingForAssign] = useState<Booking | null>(null);
  const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);

  // Synchronize live operational data from Fastify REST API on mount / login (ADMIN-01 & ADMIN-04)
  useEffect(() => {
    let active = true;
    async function fetchLiveData() {
      if (!session?.token) return;
      try {
        const [bookingsRes, servicesRes, categoriesRes] = await Promise.allSettled([
          apiClient.getBookings({ limit: 50 }),
          apiClient.getServices(),
          apiClient.getCategories(),
        ]);

        if (!active) return;

        if (bookingsRes.status === 'fulfilled' && bookingsRes.value.success && Array.isArray(bookingsRes.value.data) && bookingsRes.value.data.length > 0) {
          const mappedBookings: Booking[] = bookingsRes.value.data.map((b: any) => ({
            id: b.id,
            jobNo: b.bookingReference || `JOB-${b.id?.substring(0, 6)}`,
            customerName: b.customerName || 'Customer',
            customerPhone: b.customerPhone || '',
            customerAddress: b.addressText || 'Customer Address',
            serviceName: b.serviceName || 'Home Service',
            category: b.categoryName || 'General',
            technicianName: b.providerName || 'Field Tech',
            technicianId: b.providerId || '',
            scheduleDate: b.scheduledStart ? new Date(b.scheduledStart).toLocaleDateString() : 'Today',
            scheduleTime: b.scheduledStart ? new Date(b.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00 AM',
            estimate: Number(b.totalAuthorizedCents || 0) / 100,
            paymentStatus: b.escrowStatus === 'RELEASED_TO_PROVIDER' ? 'Paid' : 'Pending',
            status: b.status === 'COMPLETED' ? 'Completed' : b.status === 'IN_PROGRESS' ? 'In Progress' : 'Scheduled',
            priority: b.priority === 'EMERGENCY' ? 'Critical' : 'Medium',
            lat: b.latitude || 25.7617,
            lng: b.longitude || -80.1918,
            notes: b.accessInstructions || ''
          }));
          setBookings(mappedBookings);
        }

        if (servicesRes.status === 'fulfilled' && servicesRes.value.success && Array.isArray(servicesRes.value.data) && servicesRes.value.data.length > 0) {
          const mappedServices: ServiceItem[] = servicesRes.value.data.map((s: any) => ({
            id: s.id,
            name: s.name,
            category: s.categoryName || 'General',
            basePrice: Number(s.basePriceCents || 0) / 100,
            durationMinutes: s.estimatedDurationMinutes || 60,
            isPopular: s.isPopular || false,
            status: s.isActive ? 'Active' : 'Draft',
            description: s.description || ''
          }));
          setServices(mappedServices);
        }

        if (categoriesRes.status === 'fulfilled' && categoriesRes.value.success && Array.isArray(categoriesRes.value.data) && categoriesRes.value.data.length > 0) {
          const mappedCategories: ServiceCategory[] = categoriesRes.value.data.map((c: any) => ({
            id: c.id,
            name: c.name,
            iconName: c.iconName || 'Wrench',
            serviceCount: c.servicesCount || 10,
            color: '#6366F1'
          }));
          setCategories(mappedCategories);
        }
      } catch (e) {
        console.warn('[AdminContext] Live API data sync notice:', e);
      }
    }

    fetchLiveData();
    return () => { active = false; };
  }, [session?.token]);

  const toggleSidebar = () => setIsSidebarCollapsed(prev => !prev);

  const addToast = useCallback((title: string, type: Toast['type'] = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts(prev => [...prev, { id, title, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Commercial Showcase & Turnkey Suite State
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [isMobileSimulatorOpen, setIsMobileSimulatorOpen] = useState(false);
  const [isDispatchSimulatorOpen, setIsDispatchSimulatorOpen] = useState(false);
  const [isWhiteLabelModalOpen, setIsWhiteLabelModalOpen] = useState(false);

  const enableDemoMode = useCallback(() => {
    setIsDemoMode(true);
    addToast('Demo simulation mode activated. Showcase fixtures are now enabled.', 'info');
  }, [addToast]);

  const disableDemoMode = useCallback(() => {
    setBookings([]);
    setTechnicians([]);
    setCustomers([]);
    setServices([]);
    setCategories([]);
    setInvoices([]);
    setTickets([]);
    setReviews([]);
    setAuditLogs([]);
    setIncidents([]);

    localStorage.setItem('servicepro_demo_mode', 'false');
    localStorage.setItem('servicepro_bookings', JSON.stringify([]));
    localStorage.setItem('servicepro_technicians', JSON.stringify([]));
    localStorage.setItem('servicepro_customers', JSON.stringify([]));
    localStorage.setItem('servicepro_services', JSON.stringify([]));
    localStorage.setItem('servicepro_categories', JSON.stringify([]));
    localStorage.setItem('servicepro_invoices', JSON.stringify([]));
    localStorage.setItem('servicepro_tickets', JSON.stringify([]));
    localStorage.setItem('servicepro_reviews', JSON.stringify([]));
    localStorage.setItem('servicepro_audit_logs', JSON.stringify([]));
    localStorage.setItem('servicepro_incidents', JSON.stringify([]));

    setIsDemoMode(false);
    addToast('Production Clean Mode Active: Wiped all records to clean 0 baseline!', 'success');
  }, [addToast]);

  // Entity Details Selection IDs
  const [selectedBookingId, setSelectedBookingId] = useState<string>(() => bookings[0]?.id || '');
  const [selectedServiceId, setSelectedServiceId] = useState<string>(() => services[0]?.id || '');
  const [selectedTicketId, setSelectedTicketId] = useState<string>(() => tickets[0]?.id || '');

  // Dynamic Pricing & Platform Commission Configuration (Persisted)
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(() => {
    const savedRate = localStorage.getItem('servicepro_commission_rate');
    const savedSurge = localStorage.getItem('servicepro_surge_multiplier');
    const savedMin = localStorage.getItem('servicepro_min_fee');
    const savedNight = localStorage.getItem('servicepro_night_surcharge');
    return {
      commissionRate: savedRate ? parseFloat(savedRate) : 15.0,
      surgeMultiplier: savedSurge ? parseFloat(savedSurge) : 1.25,
      minCalloutFee: savedMin ? parseFloat(savedMin) : 49.0,
      nightSurcharge: savedNight ? parseFloat(savedNight) : 35.0,
      surgeActive: true
    };
  });

  const updatePricingConfig = useCallback((updates: Partial<PricingConfig>) => {
    setPricingConfig(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem('servicepro_commission_rate', next.commissionRate.toString());
      localStorage.setItem('servicepro_surge_multiplier', next.surgeMultiplier.toString());
      localStorage.setItem('servicepro_min_fee', next.minCalloutFee.toString());
      localStorage.setItem('servicepro_night_surcharge', next.nightSurcharge.toString());
      return next;
    });
    addToast('Platform commission & pricing rules saved and live across all apps!', 'success');
  }, [addToast]);

  // Website & Mobile CMS Configuration (Persisted)
  const [cmsConfig, setCmsConfig] = useState<CMSConfig>(() => {
    const saved = localStorage.getItem('servicepro_cms_config');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      heroHeading: 'Your Service Our Priority',
      heroSubheading: 'Certified home professionals at your doorstep within 30 minutes. Transparent pricing & 100% satisfaction guaranteed.',
      promoCoupon: 'SERVICE20',
      promoDiscount: 20,
      heroGraphicName: 'serviceos_master_ui.jpg',
      heroGraphicDesc: 'Smiling woman graphic banner • 1200x600 px'
    };
  });

  const updateCmsConfig = useCallback((updates: Partial<CMSConfig>) => {
    setCmsConfig(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem('servicepro_cms_config', JSON.stringify(next));
      return next;
    });
    addToast('Website & Mobile CMS changes published live across all client apps!', 'success');
  }, [addToast]);

  // Incidents State (Territory Localized & Context-Driven)
  const [incidents, setIncidents] = useState<Incident[]>(() =>
    loadOperationalState('servicepro_incidents', INITIAL_INCIDENTS)
  );

  const resolveIncident = useCallback((id: string) => {
    setIncidents(prev => {
      const updated = prev.map(inc => inc.id === id ? { ...inc, resolved: true } : inc);
      localStorage.setItem('servicepro_incidents', JSON.stringify(updated));
      return updated;
    });
    setAuditLogs(prev => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        user: currentRole === 'ADMIN' ? adminProfile.name : staffProfile.name,
        role: currentRole,
        action: 'RESOLVE_INCIDENT',
        module: 'Safety & Compliance',
        details: `Incident #${id} acknowledged and marked resolved in central audit log.`,
        ipAddress: 'Client Session'
      },
      ...prev
    ]);
    addToast('Incident marked as Resolved and recorded in Compliance Audit Log.', 'success');
  }, [currentRole, adminProfile.name, staffProfile.name, addToast]);

  const acknowledgeAllIncidents = useCallback(() => {
    setIncidents(prev => {
      const updated = prev.map(i => ({ ...i, resolved: true }));
      localStorage.setItem('servicepro_incidents', JSON.stringify(updated));
      return updated;
    });
    setAuditLogs(prev => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        user: currentRole === 'ADMIN' ? adminProfile.name : staffProfile.name,
        role: currentRole,
        action: 'ACKNOWLEDGE_ALL_INCIDENTS',
        module: 'Safety & Compliance',
        details: 'All active critical alerts acknowledged and archived in compliance log.',
        ipAddress: 'Client Session'
      },
      ...prev
    ]);
    addToast('All active alerts acknowledged and archived in audit log.', 'info');
  }, [currentRole, adminProfile.name, staffProfile.name, addToast]);

  // Service CRUD Mutations
  const addService = useCallback((service: Partial<ServiceItem>): ServiceItem => {
    const newService: ServiceItem = {
      id: `s-${Date.now()}`,
      name: service.name || 'New Custom Service',
      category: service.category || 'General Services',
      basePrice: service.basePrice || 120,
      durationMinutes: service.durationMinutes || 60,
      isPopular: service.isPopular || false,
      status: service.status || 'Active',
      description: service.description || 'Professional home service executed by certified technicians.'
    };
    setServices(prev => {
      const next = [newService, ...prev];
      localStorage.setItem('servicepro_services', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveService(newService).then(synced => {
        if (synced) {
          addToast(`Service "${newService.name}" created and synced to cloud database!`, 'success');
        } else {
          addToast('Service saved to local browser storage only; cloud database sync failed.', 'warning');
        }
      }).catch(() => {
        addToast('Service saved to local browser storage only; cloud database connection error.', 'warning');
      });
    } else {
      addToast(`Service "${newService.name}" saved to local browser storage.`, 'success');
    }
    return newService;
  }, [addToast]);

  const updateService = useCallback((id: string, updates: Partial<ServiceItem>) => {
    setServices(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...updates } : s);
      localStorage.setItem('servicepro_services', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveService({ id, ...updates }).then(synced => {
        if (synced) {
          addToast('Service updated and synced to cloud database!', 'success');
        } else {
          addToast('Service updated in local browser storage only; cloud database sync failed.', 'warning');
        }
      }).catch(() => {
        addToast('Service updated in local browser storage only; cloud database connection error.', 'warning');
      });
    } else {
      addToast('Service updated in local browser storage.', 'success');
    }
  }, [addToast]);

  const deleteService = useCallback((id: string) => {
    setServices(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem('servicepro_services', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.deleteService(id).then(synced => {
        if (synced) {
          addToast('Service removed from local and cloud catalogue.', 'warning');
        } else {
          addToast('Service removed from local browser storage only; cloud deletion failed.', 'warning');
        }
      }).catch(() => {
        addToast('Service removed from local browser storage only; cloud connection error.', 'warning');
      });
    } else {
      addToast('Service removed from local catalogue.', 'warning');
    }
  }, [addToast]);

  // Booking Verification & Escrow Release
  const verifyBooking = useCallback((bookingId: string) => {
    setBookings(prev => {
      const next = prev.map(b => {
        if (b.id === bookingId) {
          return { ...b, isVerified: true, paymentStatus: 'Paid' as const };
        }
        return b;
      });
      localStorage.setItem('servicepro_bookings', JSON.stringify(next));
      return next;
    });
    setAuditLogs(prev => {
      const newLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        user: currentRole === 'ADMIN' ? (adminProfile.name || 'Admin') : (staffProfile.name || 'Staff'),
        role: currentRole,
        action: 'VERIFY_ORDER',
        module: 'Job Quality Audit',
        details: `Order #${bookingId} verified: photo proof and signature approved for escrow release.`,
        ipAddress: 'Client Session'
      };
      const next = [newLog, ...prev];
      localStorage.setItem('servicepro_audit_logs', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.verifyBookingEscrow(bookingId).then(synced => {
        if (synced) {
          addToast(`Work order #${bookingId} verified & synced to cloud escrow ledger!`, 'success');
        } else {
          addToast(`Work order #${bookingId} verified in local browser storage only; cloud escrow sync failed.`, 'warning');
        }
      }).catch(() => {
        addToast(`Work order #${bookingId} verified in local browser storage only; cloud connection error.`, 'warning');
      });
    } else {
      addToast(`Work order #${bookingId} verified in local ledger.`, 'success');
    }
  }, [currentRole, adminProfile.name, staffProfile.name, addToast]);

  // Dedicated Registration Modals
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false);
  const [isCreateTechnicianModalOpen, setIsCreateTechnicianModalOpen] = useState(false);
  const [isCreateCategoryModalOpen, setIsCreateCategoryModalOpen] = useState(false);
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false);

  // Facebook-Style Profile Target & Navigation
  const [activeProfileTarget, setActiveProfileTarget] = useState<ViewingProfileTarget>(() => {
    return { type: 'admin' };
  });

  // Universal Entity Edit Modal (For Admin, Staff, Customer, Tech)
  const [isUniversalEditModalOpen, setIsUniversalEditModalOpen] = useState(false);
  const [universalEditTarget, setUniversalEditTarget] = useState<ViewingProfileTarget>({ type: 'admin' });

  // Direct SMS Dispatch Modal
  const [isSMSModalOpen, setIsSMSModalOpen] = useState(false);
  const [smsRecipient, setSmsRecipient] = useState<{ name: string; phone: string; role?: string } | null>(null);

  const openUniversalEditModal = useCallback((target?: ViewingProfileTarget) => {
    const finalTarget = target || activeProfileTarget;
    setUniversalEditTarget(finalTarget);
    setIsUniversalEditModalOpen(true);
  }, [activeProfileTarget]);

  const closeUniversalEditModal = useCallback(() => {
    setIsUniversalEditModalOpen(false);
  }, []);

  const openSMSModal = useCallback((recipient: { name: string; phone: string; role?: string; type?: string }) => {
    setSmsRecipient(recipient);
    setIsSMSModalOpen(true);
  }, []);

  const closeSMSModal = useCallback(() => {
    setIsSMSModalOpen(false);
    setSmsRecipient(null);
  }, []);

  // Enterprise Session Lock & Inactivity Watcher
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());

  const lockSession = useCallback(() => {
    setIsSessionLocked(true);
    recordSecurityEvent(
      'SESSION_LOCKED',
      session?.user?.email || 'authenticated-user',
      currentRole,
      'INFO',
      'Console session locked',
      { manual: true }
    );
    addToast('Console session secured & locked. Enter PIN to resume.', 'warning');
  }, [addToast, session, currentRole]);

  const unlockSession = useCallback((pin?: string): boolean => {
    // No default or master PIN exists: unlocking requires a PIN the operator configured.
    // If none is configured, the only way to resume is to sign out and authenticate again.
    const configuredPin = localStorage.getItem('servicepro_security_pin');
    if (configuredPin && pin === configuredPin) {
      setIsSessionLocked(false);
      lastActivityRef.current = Date.now();
      recordSecurityEvent(
        'SESSION_UNLOCKED',
        session?.user?.email || 'authenticated-user',
        currentRole,
        'INFO',
        'Console session unlocked via valid PIN',
        { success: true }
      );
      addToast('Console access granted. Session unlocked.', 'success');
      return true;
    }
    recordSecurityEvent(
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      session?.user?.email || 'authenticated-user',
      currentRole,
      'WARNING',
      'Invalid PIN entered during console unlock attempt',
      { enteredPinLength: pin?.length || 0 }
    );
    addToast('Invalid Security PIN. Enter your 4-digit PIN to resume.', 'error');
    return false;
  }, [addToast, session, currentRole]);

  const addCustomer = useCallback((newCust: Partial<Customer>): Customer => {
    const nextId = `C${Date.now()}`;
    const fullCustomer: Customer = {
      id: nextId,
      name: newCust.name || 'New Customer',
      email: newCust.email || '',
      phone: newCust.phone || '',
      city: newCust.city || '',
      address: newCust.address || '',
      totalBookings: 0,
      lifetimeSpend: 0,
      rating: 5.0,
      status: 'Active',
      photo: newCust.photo || ''
    };
    setCustomers(prev => {
      const next = [fullCustomer, ...prev];
      localStorage.setItem('servicepro_customers', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveCustomer(fullCustomer).then(synced => {
        if (synced) {
          addToast(`Customer ${fullCustomer.name} created and synced to cloud database!`, 'success');
        } else {
          addToast('Customer saved to local browser storage only; cloud database sync failed.', 'warning');
        }
      }).catch(() => {
        addToast('Customer saved to local browser storage only; cloud database connection error.', 'warning');
      });
    } else {
      addToast(`Customer ${fullCustomer.name} saved to local browser storage.`, 'success');
    }
    return fullCustomer;
  }, [addToast]);

  const updateCustomer = useCallback((id: string, updates: Partial<Customer>) => {
    setCustomers(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      localStorage.setItem('servicepro_customers', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveCustomer({ id, ...updates }).then(synced => {
        if (synced) {
          addToast('Customer profile updated and synced to cloud database!', 'success');
        } else {
          addToast('Customer updated in local browser storage only; cloud database sync failed.', 'warning');
        }
      }).catch(() => {
        addToast('Customer updated in local browser storage only; cloud connection error.', 'warning');
      });
    } else {
      addToast('Customer profile updated in local browser storage.', 'success');
    }
  }, [addToast]);

  const addTechnician = useCallback((newTech: Partial<Technician>): Technician => {
    const nextId = `T${Date.now()}`;
    const fullTech: Technician = {
      id: nextId,
      name: newTech.name || 'New Technician',
      phone: newTech.phone || '',
      specialization: newTech.specialization || 'General',
      rating: 5.0,
      jobsCompleted: 0,
      status: 'Available',
      photo: newTech.photo || '',
      onTimeRate: 100,
      currentJobsCount: 0,
      workingHours: '9:00 AM - 5:00 PM',
      lat: 0,
      lng: 0
    };
    setTechnicians(prev => {
      const next = [fullTech, ...prev];
      localStorage.setItem('servicepro_technicians', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveTechnician(fullTech).then(synced => {
        if (synced) {
          addToast(`Technician ${fullTech.name} onboarded and synced to cloud database!`, 'success');
        } else {
          addToast('Technician saved to local browser storage only; cloud database sync failed.', 'warning');
        }
      }).catch(() => {
        addToast('Technician saved to local browser storage only; cloud connection error.', 'warning');
      });
    } else {
      addToast(`Technician ${fullTech.name} onboarded in local browser storage.`, 'success');
    }
    return fullTech;
  }, [addToast]);

  const updateTechnician = useCallback((id: string, updates: Partial<Technician>) => {
    setTechnicians(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      localStorage.setItem('servicepro_technicians', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveTechnician({ id, ...updates }).then(synced => {
        if (synced) {
          addToast('Technician profile updated and synced to cloud database!', 'success');
        } else {
          addToast('Technician updated in local browser storage only; cloud database sync failed.', 'warning');
        }
      }).catch(() => {
        addToast('Technician updated in local browser storage only; cloud connection error.', 'warning');
      });
    } else {
      addToast('Technician profile updated in local browser storage.', 'success');
    }
  }, [addToast]);

  const addCategory = useCallback((newCat: Partial<ServiceCategory>): ServiceCategory => {
    const nextId = `cat-${Date.now()}`;
    const fullCat: ServiceCategory = {
      id: nextId,
      name: newCat.name || 'New Service Category',
      iconName: newCat.iconName || 'Flame',
      serviceCount: 1,
      color: 'emerald'
    };
    setCategories(prev => {
      const next = [...prev, fullCat];
      localStorage.setItem('servicepro_categories', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveCategory(fullCat).then(synced => {
        if (synced) {
          addToast(`Category "${fullCat.name}" created and synced to cloud database!`, 'success');
        } else {
          addToast('Category saved to local browser storage only; cloud database sync failed.', 'warning');
        }
      }).catch(() => {
        addToast('Category saved to local browser storage only; cloud connection error.', 'warning');
      });
    } else {
      addToast(`Category "${fullCat.name}" created in local browser storage.`, 'success');
    }
    return fullCat;
  }, [addToast]);

  const updateCategory = useCallback((id: string, updates: Partial<ServiceCategory>) => {
    setCategories(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      localStorage.setItem('servicepro_categories', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveCategory({ id, ...updates }).then(synced => {
        if (synced) {
          addToast('Service category updated and synced to cloud database!', 'success');
        } else {
          addToast('Category updated in local browser storage only; cloud database sync failed.', 'warning');
        }
      }).catch(() => {
        addToast('Category updated in local browser storage only; cloud connection error.', 'warning');
      });
    } else {
      addToast('Service category updated in local browser storage.', 'success');
    }
  }, [addToast]);

  const addInvoice = useCallback((newInv: Partial<Invoice>): Invoice => {
    const nextId = `INV-${Date.now()}`;
    const fullInv: Invoice = {
      id: nextId,
      invoiceNo: `#INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      customerName: newInv.customerName || 'Customer',
      serviceName: newInv.serviceName || 'Custom Maintenance & Repair',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      amount: newInv.amount || 250,
      status: (newInv.status as any) || 'Pending'
    };
    setInvoices(prev => {
      const next = [fullInv, ...prev];
      localStorage.setItem('servicepro_invoices', JSON.stringify(next));
      return next;
    });
    addToast(`Invoice ${fullInv.invoiceNo} generated successfully!`, 'success');
    return fullInv;
  }, [addToast]);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<'view' | 'edit'>('view');

  const openProfileModal = useCallback((tab: 'view' | 'edit' = 'view') => {
    setProfileModalTab(tab);
    setIsProfileModalOpen(true);
  }, []);

  const closeProfileModal = useCallback(() => {
    setIsProfileModalOpen(false);
  }, []);

  const updateUserProfile = useCallback((updates: Partial<UserProfile>) => {
    if (currentRole === 'ADMIN') {
      setAdminProfile(prev => {
        const next = { ...prev, ...updates };
        localStorage.setItem('servicepro_admin_profile', JSON.stringify(next));
        return next;
      });
    } else {
      setStaffProfile(prev => {
        const next = { ...prev, ...updates };
        localStorage.setItem('servicepro_staff_profile', JSON.stringify(next));
        return next;
      });
    }
    addToast('Profile details updated and saved securely!', 'success');
  }, [currentRole, addToast]);

  // Universal User Dossier (Customer, Technician, Staff)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(() =>
    loadOperationalState('servicepro_staff_members', INITIAL_STAFF_MEMBERS)
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => customers[0]?.id || '');
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>(() => technicians[0]?.id || '');
  const [selectedStaffId, setSelectedStaffId] = useState<string>(() => staffMembers[0]?.id || '');

  const navigateToFacebookProfile = useCallback((target?: ViewingProfileTarget) => {
    const finalTarget = target || (currentRole === 'ADMIN' ? { type: 'admin' } : { type: 'staff', id: staffMembers[0]?.id || '' });
    setActiveProfileTarget(finalTarget);
    if (finalTarget.type === 'customer' && finalTarget.id) setSelectedCustomerId(finalTarget.id);
    if (finalTarget.type === 'technician' && finalTarget.id) setSelectedTechnicianId(finalTarget.id);
    if (finalTarget.type === 'staff' && finalTarget.id) setSelectedStaffId(finalTarget.id);

    if (currentRole === 'ADMIN') {
      setCurrentPageId(37);
      setActiveModuleId(8);
      window.location.hash = `/page/37`;
    } else {
      setCurrentStaffPageId(114);
      setActiveStaffModuleId(4);
      window.location.hash = `/staff/114`;
    }
  }, [currentRole]);

  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
  const [dossierUser, setDossierUser] = useState<{ type: 'customer' | 'technician' | 'staff'; id: string } | null>(null);

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

  const updateAgencyBranding = useCallback((name: string, tagline?: string) => {
    const finalName = name.trim() || 'ServicePro OS';
    const finalTagline = tagline?.trim() || 'US / UK Field Operations';
    setAgencyName(finalName);
    setAgencyTagline(finalTagline);
    localStorage.setItem('servicepro_agency_name', finalName);
    localStorage.setItem('servicepro_agency_tagline', finalTagline);
    document.title = `${finalName} | Operations Console`;
    addToast(`Agency branding updated to "${finalName}" across all panels & documents!`, 'success');
  }, [addToast]);

  React.useEffect(() => {
    document.title = agencyName ? `${agencyName} | Operations Console` : 'Operations Console';
  }, [agencyName]);

  // Enforce server-authoritative session & role when Cloud Supabase is configured
  useEffect(() => {
    if (!supabaseService.isConfigured() || !session) return;
    let isCancelled = false;
    supabaseService.verifyActiveCloudSession().then((cloudCheck) => {
      if (isCancelled) return;
      if (!cloudCheck.valid || !cloudCheck.role) {
        setSession(null);
        localStorage.removeItem('servicepro_auth_session');
        return;
      }
      if (session.role !== cloudCheck.role) {
        // Prevent client-side role tampering in localStorage
        const correctedSession: AuthSession = {
          ...session,
          role: cloudCheck.role,
          token: cloudCheck.token || session.token,
        };
        setSession(correctedSession);
        localStorage.setItem('servicepro_auth_session', JSON.stringify(correctedSession));
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [session?.token, session?.role]);

  const login = useCallback(
    (
      role: UserRole,
      email: string,
      _password: string,
      verifiedCloudSession?: { token: string; role: 'ADMIN' | 'STAFF'; fullName?: string }
    ): boolean => {
      // Fail closed in production: authoritative server session token is strictly required
      if (import.meta.env.PROD && (!verifiedCloudSession || !verifiedCloudSession.token)) {
        addToast('Production authentication failed: verified server session token is required.', 'error');
        return false;
      }

      // Never permit local-only session creation when Cloud Supabase is configured
      if (supabaseService.isConfigured() && (!verifiedCloudSession || !verifiedCloudSession.token)) {
        addToast('Cloud authentication required: session token missing.', 'error');
        return false;
      }

      const authoritativeRole: UserRole = verifiedCloudSession?.role || role;
      let effectiveProfile: UserProfile;

      if (authoritativeRole === 'ADMIN') {
        effectiveProfile = {
          ...adminProfile,
          email: email.trim().toLowerCase() || adminProfile.email,
          name: verifiedCloudSession?.fullName || adminProfile.name || 'Platform Administrator',
          role: 'ADMIN',
          twoFactorEnabled: true,
        };
        setAdminProfile(effectiveProfile);
        localStorage.setItem('servicepro_admin_profile', JSON.stringify(effectiveProfile));
        localStorage.setItem('servicepro_admin_initialized', 'true');
      } else {
        effectiveProfile = {
          ...staffProfile,
          email: email.trim().toLowerCase() || staffProfile.email,
          name: verifiedCloudSession?.fullName || staffProfile.name || 'Operations Coordinator',
          role: 'STAFF',
        };
        setStaffProfile(effectiveProfile);
        localStorage.setItem('servicepro_staff_profile', JSON.stringify(effectiveProfile));
      }

      const randomBytes = crypto.getRandomValues(new Uint8Array(24));
      const randomHex = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const newSession: AuthSession = {
        user: effectiveProfile,
        role: authoritativeRole,
        token: verifiedCloudSession?.token || `tok_${authoritativeRole.toLowerCase()}_${Date.now()}_${randomHex}`,
        loginTime: new Date().toISOString(),
      };

      setSession(newSession);
      localStorage.setItem('servicepro_auth_session', JSON.stringify(newSession));
      addToast(
        `Authenticated successfully as ${authoritativeRole === 'ADMIN' ? 'Administrator' : 'Operations Staff'}`,
        'success'
      );

      if (authoritativeRole === 'ADMIN') {
        setCurrentPageId(1);
        setActiveModuleId(1);
        window.location.hash = '/page/1';
      } else {
        setCurrentStaffPageId(101);
        setActiveStaffModuleId(1);
        window.location.hash = '/staff/101';
      }
      return true;
    },
    [adminProfile, staffProfile, addToast]
  );

  const setupMasterAdmin = useCallback(
    (
      name: string,
      email: string,
      _password?: string,
      companyName?: string,
      verifiedToken?: string
    ): boolean => {
      // Fail closed in production: authoritative server bootstrap token is strictly required
      if (import.meta.env.PROD && !verifiedToken) {
        addToast('Production setup requires server-side administrator provisioning.', 'error');
        return false;
      }

      // Never permit browser-only Admin bootstrap when Cloud Supabase is configured without server provisioning token verification
      if (supabaseService.isConfigured() && !verifiedToken) {
        addToast('Server-controlled first-Admin provisioning token verification is required.', 'error');
        return false;
      }

      const trimmedName = name.trim() || 'Master Administrator';
      const trimmedEmail = email.trim().toLowerCase();
      const updatedAdmin: UserProfile = {
        ...adminProfile,
        name: trimmedName,
        email: trimmedEmail,
        title: 'Chief Executive Administrator',
        role: 'ADMIN',
        twoFactorEnabled: true,
      };

      setAdminProfile(updatedAdmin);
      localStorage.setItem('servicepro_admin_profile', JSON.stringify(updatedAdmin));
      localStorage.setItem('servicepro_admin_initialized', 'true');

      if (companyName && companyName.trim()) {
        const coName = companyName.trim();
        setAgencyName(coName);
        localStorage.setItem('servicepro_agency_name', coName);
      }

      const randomBytes = crypto.getRandomValues(new Uint8Array(24));
      const randomHex = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const newSession: AuthSession = {
        user: updatedAdmin,
        role: 'ADMIN',
        token: verifiedToken || `tok_admin_${Date.now()}_${randomHex}`,
        loginTime: new Date().toISOString(),
      };

      setSession(newSession);
      localStorage.setItem('servicepro_auth_session', JSON.stringify(newSession));
      addToast(`Master Administrator configured for ${trimmedName}! Welcome to ServicePro OS.`, 'success');

      setCurrentPageId(1);
      setActiveModuleId(1);
      window.location.hash = '/page/1';
      return true;
    },
    [adminProfile, addToast]
  );

  const logout = useCallback(() => {
    setIsSessionLocked(false);
    setSession(null);
    localStorage.removeItem('servicepro_auth_session');
    if (supabaseService.isConfigured()) {
      supabaseService.signOut();
    }
    addToast('You have been safely signed out.', 'info');
    window.location.hash = '/login';
  }, [addToast]);

  // Periodic Idle Timeout Check (15 minutes idle timeout enforcement)
  useEffect(() => {
    if (!isAuthenticated) return;

    const recordActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, recordActivity, { passive: true }));

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
          addToast('Session expired after 12 hours. Please re-authenticate.', 'error');
        } else if (validity.isIdleTimedOut) {
          recordSecurityEvent(
            'SESSION_LOCKED',
            session?.user?.email || 'authenticated-user',
            currentRole,
            'INFO',
            'Session locked due to 15-minute inactivity'
          );
          lockSession();
        }
      } catch (err) {
        console.warn('[AdminContext] Session validity heartbeat verification check notice:', err);
      }
    }, 15000); // 15-second heartbeat check

    return () => {
      events.forEach(evt => window.removeEventListener(evt, recordActivity));
      clearInterval(timer);
    };
  }, [isAuthenticated, isSessionLocked, session, currentRole, logout, lockSession, addToast]);

  const navigateToPage = useCallback((pageId: number) => {
    if (pageId === 37) {
      setCurrentPageId(37);
      setActiveModuleId(8);
      window.location.hash = `/page/37`;
      return;
    }
    const page = ALL_36_PAGES.find(p => p.id === pageId);
    if (page) {
      setCurrentPageId(page.id);
      setActiveModuleId(page.moduleId);
      window.location.hash = `/page/${page.id}`;
    }
  }, []);

  const navigateToModule = useCallback((moduleId: number) => {
    const mod = MODULES_8.find(m => m.id === moduleId);
    if (mod && mod.pages.length > 0) {
      navigateToPage(mod.pages[0].id);
    }
  }, [navigateToPage]);

  const navigateToStaffPage = useCallback((pageId: number) => {
    if (pageId === 114) {
      setCurrentStaffPageId(114);
      setActiveStaffModuleId(4);
      window.location.hash = `/staff/114`;
      return;
    }
    const page = ALL_STAFF_PAGES.find(p => p.id === pageId);
    if (page) {
      setCurrentStaffPageId(page.id);
      setActiveStaffModuleId(page.moduleId);
      window.location.hash = `/staff/${page.id}`;
    }
  }, []);

  const navigateToStaffModule = useCallback((moduleId: number) => {
    const mod = STAFF_MODULES.find(m => m.id === moduleId);
    if (mod && mod.pages.length > 0) {
      navigateToStaffPage(mod.pages[0].id);
    }
  }, [navigateToStaffPage]);

  React.useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;

      // Unauthenticated access gate
      if (!session) {
        if (!hash.includes('/login')) {
          window.location.hash = '/login';
        }
        return;
      }

      // Enforce strict role-based route separation
      if (session.role === 'STAFF') {
        if (hash.includes('/page/') || hash.includes('/admin/')) {
          recordSecurityEvent(
            'PRIVILEGE_ELEVATION_DENIED',
            session.user?.email || 'staff-session',
            'STAFF',
            'CRITICAL',
            `Staff session blocked from accessing restricted administrative route: ${hash}`
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
          const page = ALL_STAFF_PAGES.find(p => p.id === id);
          if (page) {
            setCurrentStaffPageId(page.id);
            setActiveStaffModuleId(page.moduleId);
          }
        }
        return;
      }

      if (session.role === 'ADMIN') {
        if (hash.includes('/staff/')) {
          addToast('Restricted: Staff operations must be managed via staff credentials', 'warning');
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
          const page = ALL_36_PAGES.find(p => p.id === id);
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
  }, [session, currentStaffPageId, currentPageId, navigateToPage, navigateToStaffPage, addToast]);

  const updateBookingStatus = (bookingId: string, status: BookingStatus) => {
    setBookings(prev => {
      const next = prev.map(b => {
        if (b.id === bookingId) {
          return { ...b, status };
        }
        return b;
      });
      localStorage.setItem('servicepro_bookings', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveBooking({ id: bookingId, status }).then(synced => {
        if (synced) {
          addToast(`Job ${bookingId} status updated to ${status} (synced to cloud)!`, 'success');
        } else {
          addToast(`Job ${bookingId} status updated in local browser storage only; cloud sync failed.`, 'warning');
        }
      }).catch(() => {
        addToast(`Job ${bookingId} status updated in local browser storage only; cloud connection error.`, 'warning');
      });
    } else {
      addToast(`Job ${bookingId} status updated to ${status} in local browser storage.`, 'success');
    }
  };

  const rescheduleBooking = (bookingId: string, newDate: string, newSlot: string, reason?: string) => {
    setBookings(prev => {
      const next = prev.map(b => {
        if (b.id === bookingId) {
          return {
            ...b,
            scheduleDate: newDate,
            scheduleTime: newSlot,
            status: b.status === 'Pending' ? 'Scheduled' : b.status,
            notes: reason ? `${b.notes ? b.notes + ' • ' : ''}[Rescheduled to ${newDate} at ${newSlot}: ${reason}]` : b.notes
          };
        }
        return b;
      });
      localStorage.setItem('servicepro_bookings', JSON.stringify(next));
      return next;
    });

    const newLog: AuditLogItem = {
      id: `A-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: currentRole === 'ADMIN' ? 'Admin' : 'Staff Dispatcher',
      role: currentRole === 'ADMIN' ? 'Super Admin' : 'Operations Dispatcher',
      action: 'Rescheduled',
      module: 'Scheduling Desk',
      details: `Rescheduled booking ${bookingId} to ${newDate} at ${newSlot}.${reason ? ` Reason: ${reason}` : ''}`,
      ipAddress: 'Client Session'
    };
    setAuditLogs(prev => {
      const next = [newLog, ...prev];
      localStorage.setItem('servicepro_audit_logs', JSON.stringify(next));
      return next;
    });

    if (supabaseService.isConfigured()) {
      supabaseService.saveBooking({ id: bookingId, scheduleDate: newDate, scheduleTime: newSlot }).catch(err => {
        console.warn('[AdminContext] reschedule sync error:', err);
      });
    }

    addToast(`Booking ${bookingId} successfully rescheduled to ${newDate} at ${newSlot}!`, 'success');
  };

  const assignTechnician = (bookingId: string, technicianId: string) => {
    const tech = technicians.find(t => t.id === technicianId);
    if (!tech) return;

    setBookings(prev => {
      const next: Booking[] = prev.map(b => {
        if (b.id === bookingId) {
          return {
            ...b,
            technicianId: tech.id,
            technicianName: tech.name,
            status: 'Scheduled' as const
          };
        }
        return b;
      });
      localStorage.setItem('servicepro_bookings', JSON.stringify(next));
      return next;
    });

    setTechnicians(prev => {
      const next: Technician[] = prev.map(t => {
        if (t.id === technicianId) {
          return { ...t, currentJobsCount: t.currentJobsCount + 1, status: 'On Job' as const };
        }
        return t;
      });
      localStorage.setItem('servicepro_technicians', JSON.stringify(next));
      return next;
    });

    // Record audit log
    const newLog: AuditLogItem = {
      id: `A-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'Admin',
      role: 'Super Admin',
      action: 'Assigned',
      module: 'Dispatch',
      details: `Assigned technician ${tech.name} to job ${bookingId}`,
      ipAddress: 'Client Session'
    };
    setAuditLogs(prev => {
      const next = [newLog, ...prev];
      localStorage.setItem('servicepro_audit_logs', JSON.stringify(next));
      return next;
    });

    addToast(`Technician ${tech.name} assigned successfully!`, 'success');
    setIsAssignModalOpen(false);
  };

  const emergencyHandover = async (bookingId: string, newTechnicianId: string, reason: string) => {
    const newTech = technicians.find(t => t.id === newTechnicianId);
    if (!newTech) return;

    const booking = bookings.find(b => b.id === bookingId);
    const oldTechName = booking ? booking.technicianName : 'Previous Tech';

    // Call authoritative backend handover API (ADMIN-05)
    try {
      await apiClient.handoverBooking(bookingId, newTechnicianId, reason);
    } catch (err) {
      console.warn('[AdminContext] Handover API call non-blocking error:', err);
    }

    setBookings(prev => {
      const next: Booking[] = prev.map(b => {
        if (b.id === bookingId) {
          return {
            ...b,
            technicianId: newTech.id,
            technicianName: newTech.name,
            status: 'In Progress' as const,
            notes: `Emergency Handover from ${oldTechName}: ${reason}`
          };
        }
        return b;
      });
      localStorage.setItem('servicepro_bookings', JSON.stringify(next));
      return next;
    });

    // Record audit
    const newLog: AuditLogItem = {
      id: `A-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'Admin',
      role: 'Super Admin',
      action: 'Handover',
      module: 'Emergency Dispatch',
      details: `Transferred job ${bookingId} from ${oldTechName} to ${newTech.name}. Reason: ${reason}`,
      ipAddress: 'Client Session'
    };
    setAuditLogs(prev => {
      const next = [newLog, ...prev];
      localStorage.setItem('servicepro_audit_logs', JSON.stringify(next));
      return next;
    });

    addToast(`Job ${bookingId} handed over to ${newTech.name}!`, 'warning');
    setIsAssignModalOpen(false);
  };

  const createBooking = (newBooking: Partial<Booking>) => {
    const nextId = `B-${Date.now()}`;
    const fullBooking: Booking = {
      id: nextId,
      jobNo: `#SP-${1000 + bookings.length + 1}`,
      customerName: newBooking.customerName || 'Customer',
      customerPhone: newBooking.customerPhone || '',
      customerAddress: newBooking.customerAddress || '',
      serviceName: newBooking.serviceName || 'General Service',
      category: newBooking.category || 'General',
      technicianName: newBooking.technicianName || 'Unassigned',
      technicianId: newBooking.technicianId || '',
      scheduleDate: newBooking.scheduleDate || new Date().toISOString().split('T')[0],
      scheduleTime: newBooking.scheduleTime || '09:00 AM',
      estimate: newBooking.estimate || 0,
      paymentStatus: newBooking.paymentStatus || 'Pending',
      status: newBooking.status || 'Pending',
      priority: newBooking.priority || 'Medium',
      lat: 0,
      lng: 0,
      notes: newBooking.notes || ''
    };

    setBookings(prev => {
      const next = [fullBooking, ...prev];
      localStorage.setItem('servicepro_bookings', JSON.stringify(next));
      return next;
    });
    if (supabaseService.isConfigured()) {
      supabaseService.saveBooking(fullBooking).then(synced => {
        if (synced) {
          addToast(`New Booking ${fullBooking.jobNo} created and synced to cloud database!`, 'success');
        } else {
          addToast(`Booking ${fullBooking.jobNo} saved to local browser storage only; cloud database sync failed.`, 'warning');
        }
      }).catch(() => {
        addToast(`Booking ${fullBooking.jobNo} saved to local browser storage only; cloud database connection error.`, 'warning');
      });
    } else {
      addToast(`New Booking ${fullBooking.jobNo} created in local browser storage.`, 'success');
    }
    setIsCreateJobModalOpen(false);
  };

  const openAssignModal = (booking: Booking) => {
    setSelectedBookingForAssign(booking);
    setIsAssignModalOpen(true);
  };

  const closeAssignModal = () => {
    setIsAssignModalOpen(false);
    setSelectedBookingForAssign(null);
  };

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).navigateToPage = navigateToPage;
      (window as any).navigateToStaffPage = navigateToStaffPage;
      (window as any).lockSession = lockSession;
      (window as any).navigateToFacebookProfile = navigateToFacebookProfile;
    }
  }, [navigateToPage, navigateToStaffPage, lockSession, navigateToFacebookProfile]);

  // Cloud Supabase Shared Synchronization & Realtime Event Stream
  useEffect(() => {
    if (supabaseService.isConfigured()) {
      Promise.all([
        supabaseService.fetchCategories(),
        supabaseService.fetchServices(),
        supabaseService.fetchBookings(),
      ]).then(([remCats, remSvcs, remBkgs]) => {
        if (remCats !== null) setCategories(remCats);
        if (remSvcs !== null) setServices(remSvcs);
        if (remBkgs !== null) setBookings(remBkgs);
      }).catch(err => {
        console.warn('[AdminContext] Supabase initial synchronization skipped:', err);
      });

      const unsubscribe = supabaseService.subscribeToRealtime((table, payload) => {
        console.log(`[Realtime Sync] ${table} event:`, payload);
        addToast(`Realtime cloud update received on ${table}!`, 'info');
      });

      return () => unsubscribe();
    }
  }, [addToast]);

  return (
    <AdminContext.Provider
      value={{
        session,
        isAuthenticated,
        login,
        setupMasterAdmin,
        logout,
        currentRole,
        userProfile,
        adminProfile,
        updateUserProfile,
        isProfileModalOpen,
        profileModalTab,
        openProfileModal,
        closeProfileModal,
        activeProfileTarget,
        setActiveProfileTarget,
        navigateToFacebookProfile,
        agencyName,
        agencyTagline,
        updateAgencyBranding,
        selectedCustomerId,
        setSelectedCustomerId,
        selectedTechnicianId,
        setSelectedTechnicianId,
        selectedStaffId,
        setSelectedStaffId,
        staffMembers,
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
        toggleSidebar,
        bookings,
        technicians,
        customers,
        services,
        categories,
        invoices,
        tickets,
        reviews,
        auditLogs,
        incidents,
        selectedBookingId,
        setSelectedBookingId,
        selectedServiceId,
        setSelectedServiceId,
        selectedTicketId,
        setSelectedTicketId,
        pricingConfig,
        updatePricingConfig,
        cmsConfig,
        updateCmsConfig,
        resolveIncident,
        acknowledgeAllIncidents,
        updateBookingStatus,
        rescheduleBooking,
        verifyBooking,
        assignTechnician,
        emergencyHandover,
        createBooking,
        addCustomer,
        updateCustomer,
        addTechnician,
        updateTechnician,
        addService,
        updateService,
        deleteService,
        addCategory,
        updateCategory,
        addInvoice,
        isUniversalEditModalOpen,
        universalEditTarget,
        openUniversalEditModal,
        closeUniversalEditModal,
        isSMSModalOpen,
        smsRecipient,
        openSMSModal,
        closeSMSModal,
        isSessionLocked,
        lockSession,
        unlockSession,
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
        isDemoMode,
        enableDemoMode,
        disableDemoMode,
        isMobileSimulatorOpen,
        setIsMobileSimulatorOpen,
        isDispatchSimulatorOpen,
        setIsDispatchSimulatorOpen,
        isWhiteLabelModalOpen,
        setIsWhiteLabelModalOpen,
        supabaseConfig: supabaseService.getConfig(),
        testSupabaseConnection: useCallback(() => supabaseService.testConnection(), []),
        toasts,
        addToast,
        removeToast
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};
