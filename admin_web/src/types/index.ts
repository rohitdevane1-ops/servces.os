export type UserRole = 'ADMIN' | 'STAFF';

export interface PageDef {
  id: number;
  moduleId: number;
  moduleName: string;
  name: string;
  tabName?: string;
  route: string;
  icon: string;
  purpose: string;
}

export interface ModuleDef {
  id: number;
  name: string;
  icon: string;
  pages: PageDef[];
}

export interface StaffPageDef {
  id: number;
  moduleId: number;
  moduleName: string;
  name: string;
  tabName?: string;
  route: string;
  icon: string;
  purpose: string;
}

export interface StaffModuleDef {
  id: number;
  name: string;
  icon: string;
  pages: StaffPageDef[];
}

export type BookingStatus = 'Completed' | 'In Progress' | 'Pending' | 'Scheduled' | 'Cancelled';
export type PaymentStatus = 'Paid' | 'Pending' | 'Unpaid';
export type JobPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface Booking {
  id: string;
  jobNo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  serviceName: string;
  category: string;
  technicianName: string;
  technicianId: string;
  technicianPhone?: string;
  scheduleDate: string;
  scheduleTime: string;
  scheduledStartIso?: string;
  estimate: number;
  paymentStatus: PaymentStatus;
  status: BookingStatus;
  rawStatus?: string;
  priority: JobPriority;
  lat: number;
  lng: number;
  customerId?: string;
  serviceId?: string;
  safetyPin?: string;
  currency?: string;
  notes?: string;
  isVerified?: boolean;
}

export type TechnicianStatus = 'Available' | 'On Job' | 'Busy' | 'On Leave' | 'Offline';

export interface Technician {
  id: string;
  name: string;
  email?: string;
  photo: string;
  phone: string;
  specialization: string;
  status: TechnicianStatus;
  rating: number;
  jobsCompleted: number;
  onTimeRate: number;
  currentJobsCount: number;
  workingHours: string;
  lat: number;
  lng: number;
  hourlyRate?: number;
  licenseNumber?: string;
  vehicleMakeModel?: string;
  vehicleLicensePlate?: string;
  isVerified?: boolean;
  isActive?: boolean;
  matchScore?: number;
}

export interface Customer {
  id: string;
  name: string;
  photo?: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  totalBookings: number;
  lifetimeSpend: number;
  courtesyCreditCents?: number;
  rating: number;
  status: 'Active' | 'Suspended';
  isActive?: boolean;
  notes?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  photo: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  shiftHours: string;
  status: 'Online' | 'Busy' | 'Offline';
  activeQueueCount: number;
  totalOrdersHandled: number;
  joinedDate: string;
  territory: string;
}

export interface ServiceItem {
  id: string;
  categoryId?: string;
  slug?: string;
  name: string;
  category: string;
  basePrice: number;
  durationMinutes: number;
  isPopular: boolean;
  status: 'Active' | 'Draft';
  description: string;
}

export interface ServiceCategory {
  id: string;
  slug?: string;
  name: string;
  iconName: string;
  bannerUrl?: string | null;
  displayOrder?: number;
  serviceCount: number;
  color: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  bookingId?: string;
  bookingReference?: string;
  customerId?: string;
  customerName: string;
  providerName?: string;
  serviceName: string;
  amount: number;
  laborSubtotalCents?: number;
  partsSubtotalCents?: number;
  taxTotalCents?: number;
  totalAmountCents?: number;
  refundedAmountCents?: number;
  rawStatus?: string;
  currency?: string;
  date: string;
  paidAt?: string | null;
  status: 'Paid' | 'Pending' | 'Overdue';
}

export interface SupportTicket {
  id: string;
  ticketNo: string;
  customerId?: string;
  customerName: string;
  customerEmail?: string;
  assignedStaffName?: string;
  bookingId?: string;
  bookingReference?: string;
  subject: string;
  category: string;
  priority: 'Urgent' | 'High' | 'Normal';
  status: 'Open' | 'In Progress' | 'Resolved';
  rawStatus?: string;
  createdAt: string;
  lastReply: string;
}

export interface CustomerReview {
  id: string;
  bookingId?: string;
  customerName: string;
  providerName?: string;
  photo?: string;
  serviceName: string;
  rating: number;
  comment: string;
  date: string;
  isVerified: boolean;
  isPublic?: boolean;
  moderationFlagged?: boolean;
  providerResponse?: string | null;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  module: string;
  details: string;
  ipAddress: string;
}

export interface Incident {
  id: string;
  severity: 'Critical' | 'High' | 'Moderate';
  category: 'Safety' | 'Vehicle' | 'Escrow' | 'SLA' | 'Rating';
  title: string;
  description: string;
  timestamp: string;
  bookingNo: string;
  technicianName?: string;
  customerName?: string;
  resolved: boolean;
  address?: string;
}

export interface PricingConfig {
  commissionRate: number; // e.g. 15.0 (%)
  surgeMultiplier: number; // e.g. 1.25
  minCalloutFee: number; // e.g. 49.0
  nightSurcharge: number; // e.g. 35.0
  surgeActive: boolean;
}

export interface TenantConfig {
  name: string;
  tagline?: string | null;
  slug: string;
  primaryColor: string;
  currencyCode: string;
  currencySymbol: string;
  timezone: string;
  commissionBps: number;
  taxRateBps: number;
  vatPercent: number;
  taxName: string;
  countryCode: string;
  distanceUnit: 'km' | 'mi';
  supportPhone: string | null;
  supportWhatsapp: string | null;
  emergencyPhone: string | null;
  logoUrl: string | null;
  defaultLocale: string;
  defaultMapLat: number;
  defaultMapLng: number;
  pricingConfig?: Partial<PricingConfig> | null;
}

export interface SystemRuntimeConfig {
  demoMode: boolean;
  paymentGateway: string;
  paymentGatewayConfigured: boolean;
  defaultCurrency: string;
  defaultVatPercent: number;
  defaultTaxName: string;
  defaultCountryCode: string;
  defaultDistanceUnit: 'km' | 'mi';
  supportedLocales: string[];
  pricingConfig?: Partial<PricingConfig> | null;
  tenant: TenantConfig | null;
}

export interface CmsConfigData {
  heroHeading: string;
  heroSubheading: string;
  searchPlaceholder: string;
  promoCouponCode: string | null;
  promoDiscountPercent: number | null;
}

export interface IntegrationConfigResponse {
  stripeAccountId: string | null;
  stripeLiveMode: boolean;
  twilioEnabled: boolean;
  awsSesEnabled: boolean;
  fcmPushEnabled: boolean;
  publicSettings: Record<string, any>;
  secretsMasked: Record<string, any>;
  updatedAt: string | null;
}

export interface ProviderBonus {
  id: string;
  providerId: string;
  providerName: string;
  amountCents: number;
  currency: string;
  category: 'PERFORMANCE' | 'QUALITY' | 'EMERGENCY' | 'REFERRAL' | 'ADJUSTMENT';
  reason: string;
  status: 'APPROVED' | 'DISBURSED' | 'VOIDED';
  awardedBy?: string | null;
  createdAt: string;
}

export interface StaffDailyReport {
  id: string;
  staffUserId: string;
  authorName?: string;
  reportDate: string;
  referenceCode: string;
  shiftWindow: string;
  jobsCompleted: number;
  ticketsResolved: number;
  escalationsCount: number;
  highlights: string;
  blockers?: string | null;
  status?: string;
  createdAt: string;
}

export interface TechnicianOnboardingSubmission {
  id: string;
  providerId: string;
  providerName: string;
  email: string;
  licenseNumber: string;
  nationalIdNumber?: string | null;
  vehicleMakeModel: string;
  vehicleLicensePlate: string;
  tradeCategory: string;
  documentUrls: string[];
  status: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewerNotes?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
}
