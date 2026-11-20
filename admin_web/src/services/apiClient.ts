/**
 * ServicePro OS — Enterprise REST API Client
 * Connects React Admin & Staff Portal to Fastify + TypeScript Backend
 * Standard: Dual-Vision Day/Night, OWASP ASVS v4.0.3, Strict Envelope Handling
 */

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
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
    const envTenant = (import.meta as any).env?.VITE_TENANT_ID;
    if (envTenant && envTenant !== '00000000-0000-0000-0000-000000000001') {
      this.tenantId = envTenant;
    }
  }

  public setTenantId(tenantId: string | null) {
    this.tenantId = tenantId;
  }

  public getAccessToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('servicepro_access_token');
  }

  public setAccessToken(accessToken: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('servicepro_access_token', accessToken);
    }
  }

  public clearTokens() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('servicepro_access_token');
      localStorage.removeItem('servicepro_refresh_token');
      localStorage.removeItem('servicepro_user_role');
      localStorage.removeItem('servicepro_user_email');
    }
  }

  public async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.tenantId) {
      headers['x-tenant-id'] = this.tenantId;
    }

    const token = this.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let res = await fetch(url, {
        ...options,
        credentials: 'include', // Transmit and receive HttpOnly SameSite=Lax refresh cookies
        headers,
      });

      // Handle 401 token refresh rotation via single-flight HttpOnly cookie request (ADMIN-09 / BACK-14)
      if (res.status === 401 && endpoint !== '/auth/login' && endpoint !== '/auth/refresh') {
        if (!this.refreshPromise) {
          this.refreshPromise = (async () => {
            try {
              const refreshHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
              };
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
                if (refreshData.success && refreshData.data?.accessToken) {
                  this.setAccessToken(refreshData.data.accessToken);
                  return refreshData.data.accessToken as string;
                }
              }
              this.clearTokens();
              return null;
            } catch {
              this.clearTokens();
              return null;
            } finally {
              this.refreshPromise = null;
            }
          })();
        }

        const newAccessToken = await this.refreshPromise;
        if (newAccessToken) {
          headers['Authorization'] = `Bearer ${newAccessToken}`;
          res = await fetch(url, { ...options, credentials: 'include', headers });
        }
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
  // AUTHENTICATION & INSTALLER
  // ==========================================================================
  public async login(email: string, password: string, mfaCode?: string, captchaToken?: string) {
    const headers: Record<string, string> = {};
    if (captchaToken) {
      headers['cf-turnstile-response'] = captchaToken;
      headers['x-captcha-token'] = captchaToken;
    }

    const res = await this.request<any>('/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, mfaCode, captchaToken }),
    });
    if (res.success && res.data?.accessToken) {
      this.setAccessToken(res.data.accessToken);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('servicepro_user_role', res.data.user.role);
        localStorage.setItem('servicepro_user_email', res.data.user.email);
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
      this.setAccessToken(res.data.accessToken);
      if (typeof localStorage !== 'undefined' && res.data.user) {
        localStorage.setItem('servicepro_user_role', res.data.user.role);
        localStorage.setItem('servicepro_user_email', res.data.user.email);
      }
    }
    return res;
  }

  public async getMe() {
    return this.request<any>('/auth/me');
  }

  public async logout() {
    try {
      await this.request('/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      this.clearTokens();
    }
  }

  public async testDatabaseConnection(databaseUrl: string) {
    return this.request<any>('/installer/test-db', {
      method: 'POST',
      body: JSON.stringify({ databaseUrl }),
    });
  }

  public async provisionTurnkeyInstallation(data: {
    tenantName: string;
    subdomain: string;
    adminEmail: string;
    adminPassword: string;
    adminFullName: string;
    currencyCode: string;
    defaultPlatformCommissionBps: number;
    bootstrapToken: string;
  }) {
    return this.request<any>('/installer/provision', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ==========================================================================
  // SERVICES & CATALOG
  // ==========================================================================
  public async getCategories() {
    return this.request<any[]>('/services/categories');
  }

  public async createCategory(data: { name: string; iconName?: string; displayOrder?: number }) {
    return this.request<any>('/services/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getServices(categoryId?: string) {
    const query = categoryId ? `?categoryId=${categoryId}` : '';
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

  // ==========================================================================
  // BOOKINGS & DISPATCH
  // ==========================================================================
  public async getBookings(params: { page?: number; limit?: number; status?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.status) q.set('status', params.status);
    return this.request<any[]>(`/bookings?${q.toString()}`);
  }

  public async getBooking(id: string) {
    return this.request<any>(`/bookings/${id}`);
  }

  public async createBooking(data: {
    serviceId: string;
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

  public async cancelBooking(id: string, reason: string) {
    return this.request<any>(`/bookings/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  public async verifyArrivalPin(bookingId: string, safetyPin: string) {
    return this.request<any>(`/bookings/${bookingId}/verify-arrival`, {
      method: 'POST',
      body: JSON.stringify({ safetyPin }),
    });
  }

  public async completeWorkOrder(bookingId: string, data: {
    beforePhotos?: string[];
    afterPhotos?: string[];
    customerSignatureUrl?: string;
    workSummaryNotes?: string;
  }) {
    return this.request<any>(`/bookings/${bookingId}/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getRadar(params: { latitude: number; longitude: number; radiusKm?: number; tradeCategory?: string }) {
    const q = new URLSearchParams({
      latitude: params.latitude.toString(),
      longitude: params.longitude.toString(),
    });
    if (params.radiusKm) q.set('radiusKm', params.radiusKm.toString());
    if (params.tradeCategory) q.set('tradeCategory', params.tradeCategory);
    return this.request<any[]>(`/dispatch/radar?${q.toString()}`);
  }

  public async handoverBooking(bookingId: string, newProviderId: string, reason: string) {
    return this.request<any>('/dispatch/handover', {
      method: 'POST',
      body: JSON.stringify({ bookingId, newProviderId, reason }),
    });
  }

  // ==========================================================================
  // CRM & FLEET
  // ==========================================================================
  public async getCustomers(params: { page?: number; limit?: number; search?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.search) q.set('search', params.search);
    return this.request<any[]>(`/crm/customers?${q.toString()}`);
  }

  public async getCustomer(id: string) {
    return this.request<any>(`/crm/customers/${id}`);
  }

  public async getTechnicians(params: {
    page?: number;
    limit?: number;
    status?: string;
    tradeCategory?: string;
    isVerified?: boolean;
    search?: string;
  } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.status) q.set('status', params.status);
    if (params.tradeCategory) q.set('tradeCategory', params.tradeCategory);
    if (params.isVerified !== undefined) q.set('isVerified', params.isVerified.toString());
    if (params.search) q.set('search', params.search);
    return this.request<any[]>(`/crm/technicians?${q.toString()}`);
  }

  public async getTechnician(id: string) {
    return this.request<any>(`/crm/technicians/${id}`);
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

  public async getInvoices(params: { page?: number; limit?: number; status?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.status) q.set('status', params.status);
    return this.request<any[]>(`/finances/invoices?${q.toString()}`);
  }

  public async getInvoice(id: string) {
    return this.request<any>(`/finances/invoices/${id}`);
  }

  public async getLedgerJournal() {
    return this.request<any[]>('/finances/ledger');
  }

  public async triggerPayout(providerId: string, amountCents: number, description?: string, idempotencyKey?: string) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId);
    if (!isUUID) {
      return {
        success: false,
        error: {
          code: 'INVALID_PROVIDER_ID',
          message: `Provider ID "${providerId}" is not a valid UUID format.`,
        },
      } as ApiResponse<any>;
    }

    const key = idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `po_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    return this.request<any>('/finances/payouts', {
      method: 'POST',
      headers: {
        'idempotency-key': key,
      },
      body: JSON.stringify({ providerId, amountCents, description }),
    });
  }

  public async confirmBookingPayment(bookingId: string) {
    return this.request<any>(`/bookings/${bookingId}/confirm-payment`, {
      method: 'POST',
    });
  }

  // ==========================================================================
  // SUPPORT & CMS
  // ==========================================================================
  public async getTickets(params: { page?: number; limit?: number; status?: string; priority?: string } = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page.toString());
    if (params.limit) q.set('limit', params.limit.toString());
    if (params.status) q.set('status', params.status);
    if (params.priority) q.set('priority', params.priority);
    return this.request<any[]>(`/support/tickets?${q.toString()}`);
  }

  public async getTicket(id: string) {
    return this.request<any>(`/support/tickets/${id}`);
  }

  public async postTicketMessage(ticketId: string, messageBody: string, attachmentsUrls: string[] = []) {
    return this.request<any>(`/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messageBody, attachmentsUrls }),
    });
  }

  public async updateTicketStatus(ticketId: string, status?: string, assignedStaffId?: string | null) {
    return this.request<any>(`/support/tickets/${ticketId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, assignedStaffId }),
    });
  }

  public async getReviews(providerId?: string) {
    const query = providerId ? `?providerId=${providerId}` : '';
    return this.request<any[]>(`/support/reviews${query}`);
  }

  public async moderateReview(reviewId: string, isPublic: boolean, moderationFlagged: boolean) {
    return this.request<any>(`/support/reviews/${reviewId}/moderate`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublic, moderationFlagged }),
    });
  }

  public async getCmsConfig() {
    return this.request<any>('/support/settings/cms');
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
}

export const apiClient = new ApiClient();
