/**
 * ServicePro OS — Enterprise REST API Client
 * Connects React Admin & Staff Portal to Fastify + TypeScript Backend
 * Standard: In-memory access JWT + HttpOnly refresh cookie, OWASP ASVS v4.0.3
 */

import type {
  CmsConfigData,
  IntegrationConfigResponse,
  PricingConfig,
  ProviderBonus,
  StaffDailyReport,
  SystemRuntimeConfig,
  TechnicianOnboardingSubmission,
  TenantConfig,
} from '../types';

export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; issue: string }>;
  } | null;
  meta: {
    timestamp: string;
    requestId: string;
    pagination?: {
      page: number;
      limit: number;
      totalRecords: number;
      totalPages: number;
    };
  };
}

class ApiClient {
  private baseUrl: string;
  private tenantId: string | null = null;
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private lastRefreshPayload: {
    accessToken: string;
    user: { id: string; email: string; role: string; tenantId: string };
    permissions: string[];
  } | null = null;
  private lastRefreshLocked: { locked: true; email?: string; role?: string } | null = null;

  constructor() {
    const envBase = (import.meta as any).env?.VITE_API_BASE_URL;
    this.baseUrl =
      envBase || ((import.meta as any).env?.PROD ? '/api/v1' : 'http://localhost:3000/api/v1');
    const envTenant = (import.meta as any).env?.VITE_TENANT_ID;
    if (envTenant && envTenant !== '00000000-0000-0000-0000-000000000001') {
      this.tenantId = envTenant;
    }

    // Purge any legacy client-stored tokens/sessions from previous builds
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('servicepro_access_token');
        localStorage.removeItem('servicepro_refresh_token');
        localStorage.removeItem('servicepro_auth_session');
        localStorage.removeItem('servicepro_user_role');
        localStorage.removeItem('servicepro_user_email');
        localStorage.removeItem('servicepro_lock_pin');
        localStorage.removeItem('servicepro_security_pin');
        localStorage.removeItem('servicepro_admin_pwd_hash');
        localStorage.removeItem('servicepro_admin_pwd_salt');
      } catch {
        // ignore storage restrictions
      }
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getApiOrigin(): string {
    return this.baseUrl.replace(/\/api\/v1\/?$/, '');
  }

  public setTenantId(tenantId: string | null) {
    this.tenantId = tenantId;
  }

  public getTenantId(): string | null {
    return this.tenantId;
  }

  public getToken(): string | null {
    return this.accessToken;
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  public setToken(accessToken: string | null) {
    this.accessToken = accessToken;
  }

  public setAccessToken(accessToken: string) {
    this.accessToken = accessToken;
  }

  public clearSession() {
    this.accessToken = null;
    this.lastRefreshPayload = null;
    this.lastRefreshLocked = null;
  }

  public getLockedSessionHint(): { locked: true; email?: string; role?: string } | null {
    return this.lastRefreshLocked;
  }

  public clearTokens() {
    this.clearSession();
  }

  public async refreshAccessToken(): Promise<string | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          const refreshHeaders: Record<string, string> = {};
          if (this.tenantId) {
            refreshHeaders['x-tenant-id'] = this.tenantId;
          }

          const refreshRes = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: refreshHeaders,
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData?.success && refreshData?.data?.accessToken) {
              this.accessToken = String(refreshData.data.accessToken);
              if (refreshData.data.user?.tenantId) {
                this.tenantId = String(refreshData.data.user.tenantId);
              }
              this.lastRefreshPayload = refreshData.data;
              this.lastRefreshLocked = null;
              return this.accessToken;
            }
          } else if (refreshRes.status === 423) {
            const errJson = await refreshRes.json().catch(() => null);
            const details: Array<{ field?: string; issue?: string }> = errJson?.error?.details || [];
            const emailHint = details.find((d) => d.field === 'email')?.issue;
            const roleHint = details.find((d) => d.field === 'role')?.issue;
            this.accessToken = null;
            this.lastRefreshPayload = null;
            this.lastRefreshLocked = { locked: true, email: emailHint, role: roleHint };
            return null;
          }
          this.clearSession();
          return null;
        } catch {
          this.clearSession();
          return null;
        } finally {
          this.refreshPromise = null;
        }
      })();
    }

    return this.refreshPromise;
  }

  /**
   * Silent boot restore using HttpOnly refresh_token cookie.
   */
  public async restoreSession(): Promise<{
    accessToken: string;
    user: { id: string; email: string; role: string; tenantId: string };
    permissions: string[];
  } | null> {
    const token = await this.refreshAccessToken();
    if (!token || !this.lastRefreshPayload) return null;
    return this.lastRefreshPayload;
  }

  public async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const isAbsolute = /^https?:\/\//i.test(endpoint);
    const url = isAbsolute ? endpoint : `${this.baseUrl}${endpoint}`;
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // Fastify 5 rejects empty-body requests carrying Content-Type: application/json (FST_ERR_CTP_EMPTY_JSON_BODY)
    if (options.body !== undefined && !isFormData && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.tenantId) {
      headers['x-tenant-id'] = this.tenantId;
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      let res = await fetch(url, {
        ...options,
        credentials: 'include',
        headers,
      });

      const isAuthNoRetry =
        endpoint === '/auth/login' ||
        endpoint === '/auth/refresh' ||
        endpoint === '/auth/demo-login' ||
        endpoint === '/auth/logout';

      if (res.status === 401 && !isAuthNoRetry) {
        const newAccessToken = await this.refreshAccessToken();
        if (newAccessToken) {
          headers['Authorization'] = `Bearer ${newAccessToken}`;
          res = await fetch(url, { ...options, credentials: 'include', headers });
        }
      }

      if (res.status === 204) {
        return {
          success: true,
          data: null,
          error: null,
          meta: { timestamp: new Date().toISOString(), requestId: 'client_204' },
        };
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return {
          success: res.ok,
          data: null,
          error: res.ok
            ? null
            : {
                code: `HTTP_${res.status}`,
                message: `Server returned non-JSON response (${res.status})`,
              },
          meta: { timestamp: new Date().toISOString(), requestId: 'client_non_json' },
        };
      }

      const json = await res.json();
      return json as ApiResponse<T>;
    } catch (err: any) {
      return {
        success: false,
        data: null,
        error: {
          code: 'NETWORK_ERROR',
          message: err?.message || 'Failed to connect to ServicePro backend server',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: `err_${Date.now()}`,
        },
      };
    }
  }

  // ==========================================================================
  // AUTHENTICATION & MFA & PASSWORD RECOVERY
  // ==========================================================================
  public async login(
    email: string,
    password: string,
    role?: 'ADMIN' | 'STAFF' | 'TECHNICIAN' | 'CUSTOMER',
    captchaToken?: string,
    rememberMe?: boolean
  ) {
    const headers: Record<string, string> = {};
    if (captchaToken) {
      headers['cf-turnstile-response'] = captchaToken;
      headers['x-captcha-token'] = captchaToken;
    }

    const res = await this.request<any>('/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        password,
        ...(role ? { role } : {}),
        ...(captchaToken ? { captchaToken } : {}),
        ...(rememberMe !== undefined ? { rememberMe } : {}),
      }),
    });
    if (res.success && res.data?.accessToken) {
      this.accessToken = String(res.data.accessToken);
      if (res.data.user?.tenantId) {
        this.tenantId = String(res.data.user.tenantId);
      }
    }
    return res;
  }

  public async demoLogin(role: 'ADMIN' | 'STAFF' | 'CUSTOMER' | 'TECHNICIAN') {
    const res = await this.request<any>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    if (res.success && res.data?.accessToken) {
      this.accessToken = String(res.data.accessToken);
      if (res.data.user?.tenantId) {
        this.tenantId = String(res.data.user.tenantId);
      }
    }
    return res;
  }

  public async verifyMfa(mfaSessionToken: string, totpCode: string) {
    const res = await this.request<any>('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaSessionToken, totpCode }),
    });
    if (res.success && res.data?.accessToken) {
      this.accessToken = String(res.data.accessToken);
      if (res.data.user?.tenantId) {
        this.tenantId = String(res.data.user.tenantId);
      }
    }
    return res;
  }

  public async verifyMfaRecovery(mfaSessionToken: string, backupCode: string) {
    const res = await this.request<any>('/auth/mfa/recovery', {
      method: 'POST',
      body: JSON.stringify({ mfaSessionToken, backupCode }),
    });
    if (res.success && res.data?.accessToken) {
      this.accessToken = String(res.data.accessToken);
      if (res.data.user?.tenantId) {
        this.tenantId = String(res.data.user.tenantId);
      }
    }
    return res;
  }

  public async setupMfa(currentTotpCode?: string) {
    return this.request<{ secret: string; otpAuthUrl: string; instructions: string }>('/auth/mfa/setup', {
      method: 'POST',
      body: JSON.stringify(currentTotpCode ? { currentTotpCode } : {}),
    });
  }

  public async confirmMfa(totpCode: string) {
    return this.request<{ enabled: boolean; backupCodes: string[]; warning: string }>('/auth/mfa/confirm', {
      method: 'POST',
      body: JSON.stringify({ totpCode }),
    });
  }

  public async disableMfa(payload: {
    currentPassword: string;
    totpCode?: string;
    backupCode?: string;
  }) {
    return this.request<{ disabled: boolean; message: string }>('/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async forgotPassword(email: string, captchaToken?: string) {
    const headers: Record<string, string> = {};
    if (captchaToken) {
      headers['cf-turnstile-response'] = captchaToken;
      headers['x-captcha-token'] = captchaToken;
    }
    return this.request<{ requested: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    });
  }

  public async resetPassword(token: string, newPassword: string) {
    return this.request<{ reset: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  }

  public async lockSession() {
    return this.request<{ locked: boolean; lockedAt: string }>('/auth/lock', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public async reauthenticate(password: string) {
    return this.request<{
      verified: boolean;
      verifiedAt: string;
      accessToken?: string;
      user?: { id: string; email: string; role: string; tenantId: string };
    }>('/auth/reauthenticate', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  public async updateMe(payload: {
    fullName?: string;
    phone?: string | null;
    department?: string | null;
    assignedTerritory?: string | null;
    defaultAddress?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
  }) {
    return this.request<{ updated: boolean; avatarUrl?: string | null; coverUrl?: string | null }>('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async changePassword(currentPassword: string, newPassword: string) {
    return this.request<any>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  public async getMe() {
    return this.request<any>('/auth/me');
  }

  public async logout() {
    try {
      await this.request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } finally {
      this.clearSession();
    }
  }

  // ==========================================================================
  // SYSTEM, HEALTH & INSTALLER
  // ==========================================================================
  public async getHealth() {
    return this.request<any>(`${this.getApiOrigin()}/health`);
  }

  public async getSystemConfig() {
    return this.request<SystemRuntimeConfig>('/system/config');
  }

  public async updateSystemConfig(payload: {
    name?: string;
    tagline?: string | null;
    primaryColor?: string;
    currencyCode?: string;
    currencySymbol?: string;
    timezone?: string;
    commissionBps?: number;
    taxRateBps?: number;
    taxName?: string;
    countryCode?: string;
    distanceUnit?: 'km' | 'mi';
    supportPhone?: string | null;
    supportWhatsapp?: string | null;
    emergencyPhone?: string | null;
    logoUrl?: string | null;
    defaultLocale?: string;
    defaultMapLat?: number;
    defaultMapLng?: number;
    pricingConfig?: {
      surgeMultiplier?: number;
      minCalloutFee?: number;
      nightSurcharge?: number;
      surgeActive?: boolean;
    };
    publicSettings?: Record<string, unknown>;
  }) {
    return this.request<{ updated: boolean; tenant: TenantConfig; pricingConfig?: Partial<PricingConfig> | null }>('/system/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async getIntegrations() {
    return this.request<IntegrationConfigResponse>('/system/integrations');
  }

  public async updateIntegrations(payload: {
    stripeAccountId?: string | null;
    stripeLiveMode?: boolean;
    twilioEnabled?: boolean;
    awsSesEnabled?: boolean;
    fcmPushEnabled?: boolean;
    publicSettings?: Record<string, unknown>;
    secrets?: {
      stripe?: string | Record<string, string | null> | null;
      paytabs?: string | Record<string, string | null> | null;
      telr?: string | Record<string, string | null> | null;
      twilio?: string | Record<string, string | null> | null;
      smtp?: string | Record<string, string | null> | null;
      fcm?: string | Record<string, string | null> | null;
    };
  }) {
    return this.request<IntegrationConfigResponse>('/system/integrations', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async testInstallerDb() {
    return this.request<{ connected: boolean; serverTime: string }>('/installer/test-db', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public async provisionInstaller(
    data: {
      companyName: string;
      subdomain?: string;
      adminEmail: string;
      adminPassword: string;
      adminFullName: string;
      currencyCode?: string;
      currencySymbol?: string;
      defaultTaxRateBps?: number;
      taxName?: string;
      platformCommissionPercent?: number;
      primaryBrandColor?: string;
    },
    bootstrapToken: string
  ) {
    return this.request<any>('/installer/provision', {
      method: 'POST',
      headers: {
        'x-bootstrap-token': bootstrapToken,
      },
      body: JSON.stringify(data),
    });
  }

  // ==========================================================================
  // SERVICES & CATALOG
  // ==========================================================================
  public async getCategories() {
    return this.request<any[]>('/services/categories');
  }

  public async createCategory(data: { name: string; iconName?: string; bannerUrl?: string | null; displayOrder?: number }) {
    return this.request<any>('/services/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateCategory(
    id: string,
    data: { name?: string; iconName?: string; bannerUrl?: string | null; displayOrder?: number; isActive?: boolean }
  ) {
    return this.request<any>(`/services/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async deleteCategory(id: string) {
    return this.request<any>(`/services/categories/${id}`, {
      method: 'DELETE',
    });
  }

  public async getServices(categoryId?: string) {
    const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
    return this.request<any[]>(`/services${query}`);
  }

  public async createService(data: {
    categoryId: string;
    name: string;
    description?: string;
    basePriceCents: number;
    estimatedDurationMinutes?: number;
    isPopular?: boolean;
    tiers?: Array<{ tierName: string; multiplier: number; description?: string }>;
  }) {
    return this.request<any>('/services', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateService(
    id: string,
    data: {
      categoryId?: string;
      name?: string;
      description?: string | null;
      basePriceCents?: number;
      estimatedDurationMinutes?: number;
      isPopular?: boolean;
      isActive?: boolean;
    }
  ) {
    return this.request<any>(`/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async deleteService(id: string) {
    return this.request<any>(`/services/${id}`, {
      method: 'DELETE',
    });
  }

  // ==========================================================================
  // BOOKINGS & DISPATCH
  // ==========================================================================
  public async getBookings(params: { page?: number; limit?: number; status?: string; search?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.status) q.set('status', params.status);
    if (params.search) q.set('search', params.search);
    const qs = q.toString();
    return this.request<any[]>(`/bookings${qs ? `?${qs}` : ''}`);
  }

  public async getBooking(id: string) {
    return this.request<{
      booking: any;
      timeline: any[];
      proofs: any | null;
      invoiceItems: any[];
    }>(`/bookings/${id}`);
  }

  public async createBooking(data: {
    serviceId: string;
    customerId?: string;
    addressText: string;
    city?: string;
    state?: string;
    postalCode?: string;
    latitude: number;
    longitude: number;
    accessInstructions?: string;
    scheduledStart?: string;
    priority?: 'STANDARD' | 'URGENT' | 'EMERGENCY';
  }) {
    return this.request<any>('/bookings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async rescheduleBooking(
    id: string,
    data: { scheduledStart: string; scheduledEnd?: string; reason?: string }
  ) {
    return this.request<any>(`/bookings/${id}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  public async assignBooking(id: string, providerId: string, reason?: string) {
    return this.request<any>(`/bookings/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ providerId, ...(reason ? { reason } : {}) }),
    });
  }

  public async cancelBooking(id: string, reason: string = 'Cancelled by dispatcher') {
    return this.request<any>(`/bookings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  public async confirmBookingPayment(bookingId: string) {
    return this.request<any>(`/bookings/${bookingId}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public async getDispatchRadar(
    latitude: number,
    longitude: number,
    radiusKm?: number,
    tradeCategory?: string
  ) {
    const q = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
    });
    if (radiusKm) q.set('radiusKm', radiusKm.toString());
    if (tradeCategory) q.set('tradeCategory', tradeCategory);
    return this.request<any[]>(`/dispatch/radar?${q.toString()}`);
  }

  public async getRadar(params: { latitude: number; longitude: number; radiusKm?: number; tradeCategory?: string }) {
    return this.getDispatchRadar(params.latitude, params.longitude, params.radiusKm, params.tradeCategory);
  }

  public async triggerHandover(bookingId: string, newProviderId: string, reason: string) {
    return this.request<any>('/dispatch/handover', {
      method: 'POST',
      body: JSON.stringify({ bookingId, newProviderId, reason }),
    });
  }

  public async handoverBooking(bookingId: string, newProviderId: string, reason: string) {
    return this.triggerHandover(bookingId, newProviderId, reason);
  }

  // ==========================================================================
  // CRM & FLEET
  // ==========================================================================
  public async getCustomers(params: { page?: number; limit?: number; search?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.search) q.set('search', params.search);
    const qs = q.toString();
    return this.request<any[]>(`/crm/customers${qs ? `?${qs}` : ''}`);
  }

  public async getCustomer(id: string) {
    return this.request<any>(`/crm/customers/${id}`);
  }

  public async createCustomer(data: {
    email: string;
    password?: string;
    fullName: string;
    phone?: string;
    defaultAddress?: string;
    courtesyCreditCents?: number;
  }) {
    return this.request<any>('/crm/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateCustomer(
    id: string,
    data: {
      fullName?: string;
      phone?: string | null;
      defaultAddress?: string | null;
      courtesyCreditCents?: number;
      isActive?: boolean;
    }
  ) {
    return this.request<any>(`/crm/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async getTechnicians(
    params: {
      page?: number;
      limit?: number;
      status?: string;
      tradeCategory?: string;
      isVerified?: boolean;
      search?: string;
    } = {}
  ) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.status) q.set('status', params.status);
    if (params.tradeCategory) q.set('tradeCategory', params.tradeCategory);
    if (params.isVerified !== undefined) q.set('isVerified', params.isVerified.toString());
    if (params.search) q.set('search', params.search);
    const qs = q.toString();
    return this.request<any[]>(`/crm/technicians${qs ? `?${qs}` : ''}`);
  }

  public async getTechnician(id: string) {
    return this.request<any>(`/crm/technicians/${id}`);
  }

  public async createTechnician(data: {
    email: string;
    password?: string;
    fullName: string;
    phone?: string;
    tradeCategory: string;
    licenseNumber?: string;
    hourlyRateCents?: number;
    vehicleMakeModel?: string;
    vehicleLicensePlate?: string;
    isVerified?: boolean;
  }) {
    return this.request<any>('/crm/technicians', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateTechnician(
    id: string,
    data: {
      fullName?: string;
      phone?: string | null;
      tradeCategory?: string;
      licenseNumber?: string | null;
      hourlyRateCents?: number;
      vehicleMakeModel?: string | null;
      vehicleLicensePlate?: string | null;
      isVerified?: boolean;
      isActive?: boolean;
    }
  ) {
    return this.request<any>(`/crm/technicians/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async verifyTechnician(id: string, isVerified: boolean, notes?: string) {
    return this.request<any>(`/crm/technicians/${id}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ isVerified, notes }),
    });
  }

  // ==========================================================================
  // FINANCES & LEDGER
  // ==========================================================================
  public async getFinancialOverview(params?: { startDate?: string; endDate?: string }) {
    const q = new URLSearchParams();
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<any>(`/finances/overview${qs}`);
  }

  public async getFinancialLedger() {
    return this.request<any[]>('/finances/ledger');
  }

  public async getLedgerJournal() {
    return this.getFinancialLedger();
  }

  public async getInvoices(params: { page?: number; limit?: number; status?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return this.request<any[]>(`/finances/invoices${qs ? `?${qs}` : ''}`);
  }

  public async getInvoice(id: string) {
    return this.request<any>(`/finances/invoices/${id}`);
  }

  public async getPayoutsOverview() {
    return this.request<{
      currency: string;
      balances: Array<{
        providerId: string;
        fullName: string;
        tradeCategory: string;
        connectAccountMasked: string;
        payoutsEnabled: boolean;
        completedJobs: number;
        grossRevenueCents: number;
        totalEarnedCents: number;
        totalDisbursedCents: number;
        unpaidBalanceCents: number;
      }>;
      history: Array<{
        id: string;
        providerId: string;
        providerName: string;
        amountCents: number;
        currency: string;
        status: string;
        transferId: string | null;
        processedAt: string | null;
        createdAt: string;
      }>;
    }>('/finances/payouts');
  }

  public async triggerPayout(
    providerId: string,
    amountCents: number,
    idempotencyKey: string,
    description?: string
  ) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId);
    if (!isUUID) {
      return {
        success: false,
        data: null,
        error: {
          code: 'INVALID_PROVIDER_ID',
          message: `Provider ID "${providerId}" is not a valid UUID format.`,
        },
        meta: { timestamp: new Date().toISOString(), requestId: `client_${Date.now()}` },
      };
    }

    return this.request<any>('/finances/payouts', {
      method: 'POST',
      headers: {
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ providerId, amountCents, description }),
    });
  }

  public async reconcilePayout(payoutId: string) {
    return this.request<any>(`/finances/payouts/${payoutId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public async createRefund(
    payload: {
      bookingId?: string;
      invoiceId?: string;
      transactionId?: string;
      amountCents?: number;
      reason: string;
      notes?: string;
    },
    idempotencyKey: string
  ) {
    return this.request<any>('/finances/refunds', {
      method: 'POST',
      headers: {
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ ...payload, idempotencyKey }),
    });
  }

  // ==========================================================================
  // SUPPORT, REVIEWS, CMS & UPLOADS
  // ==========================================================================
  public async getTickets(params: { page?: number; limit?: number; status?: string; priority?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.status) q.set('status', params.status);
    if (params.priority) q.set('priority', params.priority);
    const qs = q.toString();
    return this.request<any[]>(`/support/tickets${qs ? `?${qs}` : ''}`);
  }

  public async getTicket(id: string) {
    return this.request<any>(`/support/tickets/${id}`);
  }

  public async createTicket(payload: {
    subject: string;
    category?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    bookingId?: string;
    customerId?: string;
    initialMessage: string;
  }) {
    return this.request<any>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async postTicketMessage(ticketId: string, messageBody: string, attachmentsUrls: string[] = []) {
    return this.request<any>(`/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messageBody, attachmentsUrls }),
    });
  }

  public async updateTicketStatus(
    ticketId: string,
    payload: { status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; assignedStaffId?: string | null }
  ) {
    return this.request<any>(`/support/tickets/${ticketId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  public async getReviews(providerId?: string) {
    const query = providerId ? `?providerId=${encodeURIComponent(providerId)}` : '';
    return this.request<any[]>(`/support/reviews${query}`);
  }

  public async moderateReview(
    reviewId: string,
    payload: { isPublic: boolean; moderationFlagged: boolean }
  ) {
    return this.request<any>(`/support/reviews/${reviewId}/moderate`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  public async getCmsConfig() {
    return this.request<CmsConfigData>('/support/settings/cms');
  }

  public async updateCmsConfig(data: {
    heroHeading: string;
    heroSubheading: string;
    searchPlaceholder: string;
    promoCouponCode?: string;
    promoDiscountPercent?: number;
  }) {
    return this.request<any>('/support/settings/cms', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request<{
      url: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      expiresAt: string;
    }>('/uploads', {
      method: 'POST',
      body: formData,
    });
  }

  public async triggerAutoDispatch(bookingId: string, options?: { radiusMeters?: number; ttlSeconds?: number }) {
    return this.request<any>('/dispatch/broadcasts', {
      method: 'POST',
      body: JSON.stringify({
        bookingId,
        ...(options?.radiusMeters !== undefined ? { radiusMeters: options.radiusMeters } : {}),
        ...(options?.ttlSeconds !== undefined ? { ttlSeconds: options.ttlSeconds } : {}),
      }),
    });
  }

  public async completeBooking(
    bookingId: string,
    payload: {
      beforePhotos?: string[];
      afterPhotos?: string[];
      customerSignatureUrl?: string;
      workSummaryNotes?: string;
    } = {}
  ) {
    return this.request<any>(`/bookings/${bookingId}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async createInvoice(payload: {
    bookingId: string;
    laborSubtotalCents?: number;
    partsSubtotalCents?: number;
    diagnosticFeeCents?: number;
    discountCents?: number;
    totalAmountCents?: number;
    status?: 'DRAFT' | 'AUTHORIZED' | 'PAID';
  }) {
    return this.request<any>('/finances/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async getRefunds() {
    return this.request<any[]>('/finances/refunds');
  }

  public async reconcileRefund(refundId: string) {
    return this.request<any>(`/finances/refunds/${refundId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public async sendDirectSms(payload: {
    recipientPhone: string;
    recipientName?: string;
    message: string;
    bookingId?: string;
  }) {
    return this.request<{
      id: string;
      status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
      delivered: boolean;
      providerConfigured: boolean;
      recipientPhone: string;
      message: string;
      errorMessage?: string | null;
    }>('/support/sms/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async getIncidents() {
    return this.request<any[]>('/support/incidents');
  }

  public async createIncident(payload: {
    subject: string;
    description: string;
    severity?: 'LOW' | 'MEDIUM' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';
    bookingId?: string;
    customerId?: string;
  }) {
    return this.request<any>('/support/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async resolveIncidentApi(id: string, resolutionNotes?: string) {
    return this.request<any>(`/support/incidents/${id}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify(resolutionNotes ? { resolutionNotes } : {}),
    });
  }

  public async getTechnicianAvailability(techId: string) {
    return this.request<{
      providerId: string;
      shifts: Array<{
        id?: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isActive: boolean;
      }>;
    }>(`/crm/technicians/${techId}/availability`);
  }

  public async updateTechnicianAvailability(
    techId: string,
    shifts: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isActive: boolean;
    }>
  ) {
    return this.request<{
      providerId: string;
      shifts: Array<{
        id?: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isActive: boolean;
      }>;
    }>(`/crm/technicians/${techId}/availability`, {
      method: 'PUT',
      body: JSON.stringify({ shifts }),
    });
  }

  public async getAuditLogs(params?: { limit?: number; offset?: number; action?: string }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    if (params?.action) qs.set('action', params.action);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<any[]>(`/system/audit-logs${suffix}`);
  }

  public async getBonuses(providerId?: string) {
    const suffix = providerId ? `?providerId=${encodeURIComponent(providerId)}` : '';
    return this.request<ProviderBonus[]>(`/finances/bonuses${suffix}`);
  }

  public async awardBonus(payload: {
    providerId: string;
    amountCents: number;
    reason: string;
    category?: 'PERFORMANCE' | 'QUALITY' | 'EMERGENCY' | 'REFERRAL' | 'ADJUSTMENT';
  }) {
    return this.request<ProviderBonus>('/finances/bonuses', {
      method: 'POST',
      headers: {
        'idempotency-key': `bonus_${payload.providerId}_${Date.now()}`,
      },
      body: JSON.stringify(payload),
    });
  }

  public async updateTechnicianDutyStatus(
    techId: string,
    dutyStatus: 'ONLINE' | 'OFFLINE' | 'ON_JOB' | 'EN_ROUTE'
  ) {
    return this.request<{ providerId: string; dutyStatus: string; hasLocation: boolean }>(
      `/crm/technicians/${techId}/duty-status`,
      {
        method: 'PUT',
        body: JSON.stringify({ dutyStatus }),
      }
    );
  }

  public async getStaff() {
    return this.request<any[]>('/crm/staff');
  }

  public async createStaff(payload: {
    email: string;
    password?: string;
    fullName: string;
    phone?: string;
    department?: string;
    assignedTerritory?: string;
    shiftHours?: string;
  }) {
    return this.request<any>('/crm/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async updateStaff(
    id: string,
    payload: {
      fullName?: string;
      phone?: string | null;
      department?: string | null;
      assignedTerritory?: string | null;
      shiftHours?: string | null;
      isActive?: boolean;
    }
  ) {
    return this.request<any>(`/crm/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  public async getOnboardingSubmissions(status?: string) {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<TechnicianOnboardingSubmission[]>(`/crm/technicians/onboarding${suffix}`);
  }

  public async reviewOnboardingSubmission(
    id: string,
    payload: { status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED'; reviewerNotes?: string }
  ) {
    return this.request<{
      id: string;
      providerId: string;
      status: string;
      reviewerNotes?: string | null;
      reviewedAt?: string;
    }>(`/crm/technicians/onboarding/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  public async getSmsStatus() {
    return this.request<{
      provider: string;
      configured: boolean;
      demoMode: boolean;
      fromNumberMasked: string | null;
      recentLogs: Array<{
        id: string;
        destination: string;
        status: string;
        providerMessageId?: string | null;
        errorMessage?: string | null;
        createdAt: string;
      }>;
    }>('/support/sms/status');
  }

  public async getCustomerCommunications(customerId: string) {
    return this.request<{
      customerId: string;
      customerName: string;
      email: string;
      phone: string | null;
      notifications: Array<{
        id: string;
        channel: string;
        templateType?: string;
        destination: string;
        status: string;
        errorMessage?: string | null;
        createdAt: string;
      }>;
      tickets: Array<{
        id: string;
        ticketNumber: string;
        subject: string;
        category: string;
        priority: string;
        status: string;
        createdAt: string;
      }>;
      bookingMessages: Array<{
        id: string;
        bookingId: string;
        bookingReference: string;
        senderRole: string;
        messageText: string;
        createdAt: string;
      }>;
    }>(`/support/communications/${customerId}`);
  }

  public async getDailyReports() {
    return this.request<StaffDailyReport[]>('/support/daily-reports');
  }

  public async submitDailyReport(payload: {
    reportDate?: string;
    shiftWindow?: string;
    jobsCompleted: number;
    ticketsResolved: number;
    escalationsCount: number;
    highlights: string;
    blockers?: string | null;
  }) {
    return this.request<StaffDailyReport>('/support/daily-reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const apiClient = new ApiClient();
