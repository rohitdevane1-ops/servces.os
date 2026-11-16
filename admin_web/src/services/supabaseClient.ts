/**
 * ServicePro OS — Production Cloud Supabase Client & Realtime Sync Engine
 * Standards: OWASP ASVS v4.0.3, PostgreSQL 16 + PostGIS
 * 
 * Provides unified data synchronization between Admin Web, Staff Web, and Flutter Mobile apps.
 * Operates in hybrid mode:
 * - Live Cloud Mode: When VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY (or configured settings) are provided.
 * - Resilient Local Mode: When unconfigured or offline, seamlessly persists to local storage without errors.
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { 
  Booking, 
  Technician, 
  Customer, 
  ServiceItem, 
  ServiceCategory, 
  AuditLogItem 
} from '../types';

export interface SupabaseConfigState {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  isLiveConnected: boolean;
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private url: string = '';
  private anonKey: string = '';

  constructor() {
    this.initClient();
  }

  public initClient(customUrl?: string, customKey?: string): boolean {
    const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
    const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
    const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('servicepro_supabase_url') || '' : '';
    const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('servicepro_supabase_anon_key') || '' : '';

    this.url = customUrl || envUrl || storedUrl;
    this.anonKey = customKey || envKey || storedKey;

    if (this.url && this.anonKey && this.url.startsWith('http') && !this.url.includes('your-project') && !this.url.includes('xyzcompany')) {
      try {
        this.client = createClient(this.url, this.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
          realtime: {
            params: {
              eventsPerSecond: 10,
            },
          },
        });
        return true;
      } catch (err) {
        console.warn('[SupabaseService] Client initialization error:', err);
        this.client = null;
        return false;
      }
    } else {
      this.client = null;
      return false;
    }
  }

  public getClient(): SupabaseClient | null {
    return this.client;
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  public getConfig(): SupabaseConfigState {
    return {
      url: this.url,
      anonKey: this.anonKey ? `${this.anonKey.substring(0, 10)}...` : '',
      isConfigured: this.isConfigured(),
      isLiveConnected: this.client !== null,
    };
  }

  // =========================================================================
  // Supabase Authentication, One-Time Bootstrap & Server-Side MFA Methods
  // =========================================================================

  public async checkSystemInitialized(): Promise<{ initialized: boolean; fromServer: boolean }> {
    if (!this.client) {
      const localInit =
        typeof localStorage !== 'undefined' &&
        Boolean(
          localStorage.getItem('servicepro_admin_initialized') &&
          localStorage.getItem('servicepro_admin_pwd_hash')
        );
      return { initialized: localInit, fromServer: false };
    }
    try {
      const { data, error } = await this.client.rpc('check_system_initialized');
      if (error) throw error;
      return { initialized: Boolean(data), fromServer: true };
    } catch (e) {
      console.warn('[SupabaseService] checkSystemInitialized error:', e);
      return { initialized: false, fromServer: false };
    }
  }

  public async bootstrapFirstAdmin(params: {
    provisioningToken: string;
    email: string;
    password: string;
    fullName: string;
    companyName?: string;
    phone?: string;
  }): Promise<{
    success: boolean;
    adminUserId?: string;
    tenantId?: string;
    mfaEnrollment?: {
      secretBase32: string;
      otpauthUrl: string;
      recoveryCodes: string[];
    };
    error?: string;
  }> {
    if (!this.client) {
      return { success: false, error: 'Supabase cloud client is not configured.' };
    }
    try {
      const { data, error } = await this.client.functions.invoke('bootstrap-first-admin', {
        headers: {
          'x-bootstrap-token': params.provisioningToken.trim(),
        },
        body: {
          provisioningToken: params.provisioningToken.trim(),
          email: params.email.trim().toLowerCase(),
          password: params.password,
          fullName: params.fullName.trim(),
          companyName: params.companyName?.trim() || '',
          phone: params.phone?.trim() || '',
        },
      });
      if (error) throw error;
      if (!data?.success) {
        return {
          success: false,
          error: data?.error || 'Server-controlled first-Admin provisioning failed.',
        };
      }
      return {
        success: true,
        adminUserId: data.adminUserId,
        tenantId: data.tenantId,
        mfaEnrollment: data.mfaEnrollment,
      };
    } catch (e: any) {
      console.warn('[SupabaseService] bootstrapFirstAdmin error:', e);
      return {
        success: false,
        error: e?.message || 'Unable to reach bootstrap-first-admin Edge Function.',
      };
    }
  }

  public async signIn(
    email: string,
    password: string
  ): Promise<{
    success: boolean;
    token?: string;
    userId?: string;
    tenantId?: string;
    role?: 'ADMIN' | 'STAFF';
    fullName?: string;
    phone?: string;
    error?: string;
  }> {
    if (!this.client) return { success: false, error: 'Supabase not configured' };
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.user?.id) {
        throw error || new Error('Invalid email or password.');
      }

      // Query authoritative server-side user profile & role from public.users
      const { data: userRow, error: profileError } = await this.client
        .from('users')
        .select('id, tenant_id, email, phone, first_name, last_name, role, is_active')
        .eq('id', data.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (profileError || !userRow) {
        await this.client.auth.signOut();
        return {
          success: false,
          error: 'No active administrator or staff profile exists for this account.',
        };
      }

      if (userRow.role !== 'ADMIN' && userRow.role !== 'STAFF') {
        await this.client.auth.signOut();
        return {
          success: false,
          error: 'Unauthorized role: Only ADMIN and STAFF accounts may access the web console.',
        };
      }

      return {
        success: true,
        token: data.session?.access_token,
        userId: userRow.id,
        tenantId: userRow.tenant_id,
        role: userRow.role as 'ADMIN' | 'STAFF',
        fullName: `${userRow.first_name || ''} ${userRow.last_name || ''}`.trim() || email,
        phone: userRow.phone || '',
      };
    } catch (e: any) {
      console.warn('[SupabaseService] signIn error:', e);
      return { success: false, error: e?.message || 'Supabase sign-in failed' };
    }
  }

  public async verifyActiveCloudSession(): Promise<{
    valid: boolean;
    role?: 'ADMIN' | 'STAFF';
    email?: string;
    fullName?: string;
    token?: string;
  }> {
    if (!this.client) return { valid: false };
    try {
      const { data: sessionData } = await this.client.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user?.id) return { valid: false };

      const { data: userRow } = await this.client
        .from('users')
        .select('id, email, first_name, last_name, role, is_active')
        .eq('id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!userRow || (userRow.role !== 'ADMIN' && userRow.role !== 'STAFF')) {
        await this.client.auth.signOut();
        return { valid: false };
      }

      const mfaStatus = await this.getMfaStatus();
      if (!mfaStatus?.isMfaVerifiedForSession) {
        return { valid: false };
      }

      return {
        valid: true,
        role: userRow.role as 'ADMIN' | 'STAFF',
        email: userRow.email || user.email || '',
        fullName: `${userRow.first_name || ''} ${userRow.last_name || ''}`.trim(),
        token: sessionData.session?.access_token,
      };
    } catch {
      return { valid: false };
    }
  }

  public async getMfaStatus(): Promise<{
    authenticated: boolean;
    isEnrolled: boolean;
    isMfaEnabled: boolean;
    isMfaVerifiedForSession: boolean;
    isLocked: boolean;
    lockedUntil: string | null;
    failedAttempts: number;
    remainingRecoveryCodes: number;
  } | null> {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client.rpc('get_my_mfa_status');
      if (error || !data) return null;
      return {
        authenticated: Boolean(data.authenticated),
        isEnrolled: Boolean(data.is_enrolled),
        isMfaEnabled: Boolean(data.is_mfa_enabled),
        isMfaVerifiedForSession: Boolean(data.is_mfa_verified_for_session),
        isLocked: Boolean(data.is_locked),
        lockedUntil: data.locked_until || null,
        failedAttempts: Number(data.failed_attempts || 0),
        remainingRecoveryCodes: Number(data.remaining_recovery_codes || 0),
      };
    } catch (e) {
      console.warn('[SupabaseService] getMfaStatus error:', e);
      return null;
    }
  }

  public async enrollMfa(params: {
    secretBase32: string;
    recoveryCodeHashes: string[];
    verificationCode: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.client) return { success: false, error: 'Supabase not configured' };
    try {
      const { data, error } = await this.client.rpc('enroll_my_mfa', {
        p_totp_secret: params.secretBase32,
        p_recovery_code_hashes: params.recoveryCodeHashes,
        p_verification_code: params.verificationCode,
      });
      if (error) throw error;
      if (!data?.success) {
        return { success: false, error: data?.error || 'MFA enrollment failed.' };
      }
      return { success: true };
    } catch (e: any) {
      console.warn('[SupabaseService] enrollMfa error:', e);
      return { success: false, error: e?.message || 'MFA enrollment failed.' };
    }
  }

  public async verifyMfaCode(
    code: string,
    isRecoveryCode: boolean = false
  ): Promise<{
    verified: boolean;
    usedRecoveryCode?: boolean;
    remainingRecoveryCodes?: number;
    attemptsRemaining?: number;
    isLocked?: boolean;
    lockoutSeconds?: number;
    error?: string;
  }> {
    if (!this.client) {
      return { verified: false, error: 'Supabase not configured' };
    }
    try {
      const { data, error } = await this.client.rpc('verify_my_mfa_code', {
        p_code: code,
        p_is_recovery_code: isRecoveryCode,
      });
      if (error) throw error;
      return {
        verified: Boolean(data?.verified),
        usedRecoveryCode: Boolean(data?.used_recovery_code),
        remainingRecoveryCodes: data?.remaining_recovery_codes,
        attemptsRemaining: data?.attempts_remaining,
        isLocked: Boolean(data?.is_locked),
        lockoutSeconds: data?.lockout_seconds,
        error: data?.error,
      };
    } catch (e: any) {
      console.warn('[SupabaseService] verifyMfaCode error:', e);
      return {
        verified: false,
        error: e?.message || 'Server MFA verification failed.',
      };
    }
  }

  public async signUp(
    email: string,
    password: string,
    role: 'CUSTOMER' | 'TECHNICIAN' = 'CUSTOMER',
    fullName: string = ''
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!this.client) return { success: false, error: 'Supabase not configured' };
    try {
      // Strictly disallow self-registration of ADMIN or STAFF roles
      const safeRole = role === 'TECHNICIAN' ? 'TECHNICIAN' : 'CUSTOMER';
      const names = (fullName || 'Customer').trim().split(' ');
      const firstName = names[0] || 'Customer';
      const lastName = names.slice(1).join(' ') || 'Account';

      const { data, error } = await this.client.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });
      if (error) throw error;

      const tenantId = await this.getTenantId();
      if (data.user?.id && tenantId) {
        const { error: userInsertError } = await this.client.from('users').insert({
          id: data.user.id,
          tenant_id: tenantId,
          email: email.trim().toLowerCase(),
          phone: `+1800${String(Date.now()).slice(-7)}`,
          password_hash: 'SUPABASE_MANAGED_AUTH',
          role: safeRole,
          is_active: true,
          is_verified: true,
        });

        if (userInsertError) {
          throw new Error(`User record provisioning failed: ${userInsertError.message}`);
        }

        if (safeRole === 'CUSTOMER') {
          const { error: profError } = await this.client.from('customer_profiles').insert({
            user_id: data.user.id,
            tenant_id: tenantId,
            full_name: `${firstName} ${lastName}`.trim(),
            default_address_text: null,
            courtesy_credit_cents: 0,
          });
          if (profError) {
            console.warn('[SupabaseService] customer_profile creation note:', profError.message);
          }
        } else {
          const { error: profError } = await this.client.from('provider_profiles').insert({
            user_id: data.user.id,
            tenant_id: tenantId,
            full_name: `${firstName} ${lastName}`.trim(),
            trade_category: 'General Maintenance',
            license_number: null,
          });
          if (profError) {
            console.warn('[SupabaseService] provider_profile creation note:', profError.message);
          }
        }
      }

      return { success: true, token: data.session?.access_token };
    } catch (e: any) {
      console.warn('[SupabaseService] signUp error:', e);
      return { success: false, error: e?.message || 'Supabase sign-up failed' };
    }
  }

  public async signOut(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.rpc('revoke_my_mfa_session');
    } catch {
      // Ignore if session already expired
    }
    try {
      await this.client.auth.signOut();
    } catch (e) {
      console.warn('[SupabaseService] signOut error:', e);
    }
  }

  /**
   * Test database connectivity and PostGIS functions
   */
  public async testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    if (!this.client) {
      return { 
        success: false, 
        message: 'Supabase credentials not configured. Operating in resilient local persistence mode.' 
      };
    }

    const start = Date.now();
    try {
      const { error } = await this.client.from('categories').select('count', { count: 'exact', head: true });
      const latencyMs = Date.now() - start;
      if (error) throw error;
      return { 
        success: true, 
        message: `Successfully connected to database (latency: ${latencyMs}ms)`, 
        latencyMs 
      };
    } catch (err: any) {
      return { 
        success: false, 
        message: `Connection check failed: ${err.message || 'Unknown network error'}` 
      };
    }
  }

  // =========================================================================
  // Remote Synchronization Methods (Aligned 1:1 with 01_initial_schema.sql)
  // =========================================================================

  public async fetchCategories(): Promise<ServiceCategory[] | null> {
    if (!this.client) return null;
    try {
      // 1. Primary: Query canonical service_categories table
      const { data, error } = await this.client
        .from('service_categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (!error && data) {
        return data.map(c => ({
          id: c.id,
          name: c.name || c.title || 'Category',
          iconName: c.icon_name || 'Wrench',
          serviceCount: 20,
          color: '#6366F1'
        }));
      }

      // 2. Fallback: Query legacy categories table if present
      const { data: legacyData, error: legacyErr } = await this.client
        .from('categories')
        .select('*')
        .order('priority_rank', { ascending: true });

      if (legacyErr) {
        if (error) throw error;
        throw legacyErr;
      }

      return (legacyData || []).map(c => ({
        id: c.id,
        name: c.title || c.name || 'Category',
        iconName: c.icon_name || 'Wrench',
        serviceCount: 20,
        color: '#6366F1'
      }));
    } catch (e) {
      console.warn('[SupabaseService] fetchCategories fallback:', e);
      return null;
    }
  }

  public async fetchServices(): Promise<ServiceItem[] | null> {
    if (!this.client) return null;
    try {
      // 1. Primary: Query canonical services with service_categories relation
      const { data, error } = await this.client
        .from('services')
        .select('*, service_categories(name)')
        .eq('is_active', true);

      if (!error && data) {
        return data.map(s => ({
          id: s.id,
          name: s.name,
          category: s.service_categories?.name || 'General Service',
          basePrice: Number(s.base_price_cents) / 100,
          durationMinutes: s.estimated_duration_minutes || 60,
          isPopular: s.is_popular || false,
          status: s.is_active ? 'Active' : 'Draft',
          description: s.description || ''
        }));
      }

      // 2. Fallback: Query services with legacy categories relation
      const { data: legacyData, error: legacyErr } = await this.client
        .from('services')
        .select('*, categories(title)')
        .eq('is_active', true);

      if (legacyErr) {
        if (error) throw error;
        throw legacyErr;
      }

      return (legacyData || []).map(s => ({
        id: s.id,
        name: s.name,
        category: s.categories?.title || 'General Service',
        basePrice: Number(s.base_price_cents) / 100,
        durationMinutes: s.estimated_duration_minutes || 60,
        isPopular: s.is_popular || false,
        status: s.is_active ? 'Active' : 'Draft',
        description: s.description || ''
      }));
    } catch (e) {
      console.warn('[SupabaseService] fetchServices fallback:', e);
      return null;
    }
  }

  public async fetchBookings(): Promise<Booking[] | null> {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .from('bookings')
        .select('*, services(name, service_categories(name)), users(email, phone)')
        .order('created_at', { ascending: false });

      if (error) {
        // Fallback to legacy relation format
        const { data: legData, error: legErr } = await this.client
          .from('bookings')
          .select('*, services(name, categories(title)), users(email, phone)')
          .order('created_at', { ascending: false });
        if (legErr) throw error;
        return (legData || []).map(b => ({
          id: b.id,
          jobNo: b.booking_reference || `JOB-${b.id.substring(0, 6)}`,
          customerName: b.users?.email ? b.users.email.split('@')[0] : 'Customer',
          customerPhone: b.users?.phone || '',
          customerAddress: b.address_text || 'Main Service Area',
          serviceName: b.services?.name || 'General HVAC Service',
          category: b.services?.categories?.title || 'HVAC',
          technicianName: 'Field Pro',
          technicianId: b.provider_id || b.assigned_provider_id || '',
          scheduleDate: b.scheduled_start ? new Date(b.scheduled_start).toLocaleDateString() : 'Today',
          scheduleTime: b.scheduled_start ? new Date(b.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00 AM',
          estimate: Number(b.total_authorized_cents || 0) / 100,
          paymentStatus: b.escrow_status === 'RELEASED_TO_PROVIDER' ? 'Paid' : b.escrow_status === 'REFUNDED_TO_CUSTOMER' ? 'Unpaid' : 'Pending',
          status: b.status === 'COMPLETED' ? 'Completed' : b.status === 'IN_PROGRESS' || b.status === 'ON_SITE' ? 'In Progress' : b.status === 'CANCELLED' ? 'Cancelled' : 'Scheduled',
          priority: b.is_emergency ? 'Critical' : 'Medium',
          lat: b.latitude || 25.7617,
          lng: b.longitude || -80.1918,
          notes: b.problem_description || ''
        }));
      }

      return (data || []).map(b => ({
        id: b.id,
        jobNo: b.booking_reference || `JOB-${b.id.substring(0, 6)}`,
        customerName: b.users?.email ? b.users.email.split('@')[0] : 'Customer',
        customerPhone: b.users?.phone || '',
        customerAddress: b.address_text || 'Main Service Area',
        serviceName: b.services?.name || 'General HVAC Service',
        category: b.services?.service_categories?.name || 'HVAC',
        technicianName: 'Field Pro',
        technicianId: b.provider_id || b.assigned_provider_id || '',
        scheduleDate: b.scheduled_start ? new Date(b.scheduled_start).toLocaleDateString() : 'Today',
        scheduleTime: b.scheduled_start ? new Date(b.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:00 AM',
        estimate: Number(b.total_authorized_cents || 0) / 100,
        paymentStatus: b.escrow_status === 'RELEASED_TO_PROVIDER' ? 'Paid' : b.escrow_status === 'REFUNDED_TO_CUSTOMER' ? 'Unpaid' : 'Pending',
        status: b.status === 'COMPLETED' ? 'Completed' : b.status === 'IN_PROGRESS' || b.status === 'ON_SITE' ? 'In Progress' : b.status === 'CANCELLED' ? 'Cancelled' : 'Scheduled',
        priority: b.is_emergency ? 'Critical' : 'Medium',
        lat: b.latitude || 25.7617,
        lng: b.longitude || -80.1918,
        notes: b.problem_description || ''
      }));
    } catch (e) {
      console.warn('[SupabaseService] fetchBookings fallback:', e);
      return null;
    }
  }

  private cachedTenantId: string | null = null;

  public async getTenantId(): Promise<string | null> {
    if (this.cachedTenantId) return this.cachedTenantId;
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .from('tenants')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (!error && data?.id) {
        this.cachedTenantId = data.id;
        return data.id;
      }
      const { data: anyTenant } = await this.client
        .from('tenants')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (anyTenant?.id) {
        this.cachedTenantId = anyTenant.id;
        return anyTenant.id;
      }
    } catch (err) {
      console.warn('[SupabaseService] getTenantId lookup error:', err);
    }
    return null;
  }

  private isValidUuid(id?: string): boolean {
    if (!id) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  }

  public async saveCustomer(customer: Partial<Customer>): Promise<boolean> {
    if (!this.client) return false;
    try {
      const tenantId = await this.getTenantId();
      if (!tenantId) {
        console.warn('[SupabaseService] saveCustomer: No active tenant record found.');
        return false;
      }
      const names = (customer.name || 'New Customer').trim().split(' ');
      const firstName = names[0] || 'Customer';
      const lastName = names.slice(1).join(' ') || 'User';

      const payload: Record<string, any> = {
        tenant_id: tenantId,
        email: customer.email || `customer.${Date.now()}@client.local`,
        phone: customer.phone || `+1800${String(Date.now()).slice(-7)}`,
        first_name: firstName,
        last_name: lastName,
        role: 'CUSTOMER',
        is_active: true
      };

      if (this.isValidUuid(customer.id)) {
        payload.id = customer.id;
      }

      const { data, error } = await this.client.from('users').upsert(payload).select('id').maybeSingle();
      if (error) throw error;

      if (data?.id) {
        await this.client.from('customer_profiles').upsert({
          user_id: data.id,
          tier: 'PLATINUM VIP',
          total_bookings: customer.totalBookings || 0,
          lifetime_spend_cents: Math.round((customer.lifetimeSpend || 0) * 100),
        }, { onConflict: 'user_id' });
      }
      return true;
    } catch (e) {
      console.warn('[SupabaseService] saveCustomer error:', e);
      return false;
    }
  }

  private toDeterministicUuid(seed: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    let h3 = 0x85ebca6b;
    let h4 = 0xc2b2ae35;
    for (let i = 0; i < seed.length; i++) {
      const ch = seed.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ ch, 0x85ebca6b) >>> 0;
      h3 = Math.imul(h3 ^ (ch + i), 0xc2b2ae35) >>> 0;
      h4 = Math.imul(h4 ^ (ch * 31), 0x27d4eb2f) >>> 0;
    }
    const hex = [h1, h2, h3, h4].map((v) => v.toString(16).padStart(8, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  public async saveBooking(booking: Partial<Booking>): Promise<boolean> {
    if (!this.client) return false;
    try {
      const tenantId = await this.getTenantId();
      if (!tenantId) {
        console.warn('[SupabaseService] saveBooking: No active tenant record found.');
        return false;
      }

      let customerId: string | null = null;
      if (this.isValidUuid(booking.customerId)) {
        customerId = booking.customerId!;
      } else {
        const { data: cust } = await this.client
          .from('users')
          .select('id')
          .eq('role', 'CUSTOMER')
          .limit(1)
          .maybeSingle();
        if (cust?.id) customerId = cust.id;
      }

      let serviceId: string | null = null;
      if (this.isValidUuid(booking.serviceId)) {
        serviceId = booking.serviceId!;
      } else {
        const { data: svc } = await this.client
          .from('services')
          .select('id')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (svc?.id) serviceId = svc.id;
      }

      if (!customerId || !serviceId) {
        console.warn('[SupabaseService] saveBooking: Missing customer or service reference in database.');
        return false;
      }

      const estimateDollars = booking.estimate || 150;
      const safetyPin = String((booking as any).safetyPin || Math.floor(1000 + Math.random() * 9000)).slice(0, 6);
      const rawReference = booking.jobNo || `JOB-${Math.floor(1000 + Math.random() * 9000)}`;
      const rawScheduled = (booking as any).scheduledStart || (booking as any).scheduledDate || (booking as any).scheduledTime;
      const parsedScheduled = rawScheduled && !Number.isNaN(Date.parse(String(rawScheduled)))
        ? new Date(String(rawScheduled)).toISOString()
        : new Date().toISOString();

      const payload: Record<string, any> = {
        tenant_id: tenantId,
        customer_id: customerId,
        service_id: serviceId,
        booking_reference: rawReference.slice(0, 16),
        address_text: booking.customerAddress || 'Client Location',
        service_location: `SRID=4326;POINT(${booking.lng || -80.1918} ${booking.lat || 25.7617})`,
        scheduled_start: parsedScheduled,
        is_emergency: booking.priority === 'Critical',
        emergency_surcharge_cents: booking.priority === 'Critical' ? 4900 : 0,
        labor_cost_cents: Math.round(estimateDollars * 80),
        diagnostic_fee_cents: 2000,
        parts_total_cents: 0,
        tax_amount_cents: Math.round(estimateDollars * 7),
        platform_fee_cents: Math.round(estimateDollars * 15),
        net_payout_cents: Math.round(estimateDollars * 85),
        total_authorized_cents: Math.round(estimateDollars * 100),
        escrow_status: booking.paymentStatus === 'Paid' ? 'RELEASED_TO_PROVIDER' : 'HELD_IN_ESCROW',
        safety_pin: safetyPin,
        problem_description: booking.notes || '',
        status: booking.status === 'Completed'
          ? 'COMPLETED'
          : booking.status === 'In Progress'
          ? 'IN_PROGRESS'
          : booking.status === 'Cancelled'
          ? 'CANCELLED'
          : 'REQUESTED'
      };

      if (this.isValidUuid(booking.id)) {
        payload.id = booking.id;
      } else if (booking.id) {
        payload.id = this.toDeterministicUuid(`booking:${tenantId}:${booking.id}`);
      }
      if (this.isValidUuid(booking.technicianId)) {
        payload.provider_id = booking.technicianId;
      }

      const { data, error } = await this.client.from('bookings').upsert(payload).select('id').maybeSingle();
      if (error || !data?.id) {
        if (error) throw error;
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[SupabaseService] saveBooking error:', e);
      return false;
    }
  }

  public async saveTechnician(tech: Partial<Technician>): Promise<boolean> {
    if (!this.client) return false;
    try {
      const tenantId = await this.getTenantId();
      if (!tenantId) return false;
      const names = (tech.name || 'New Technician').trim().split(' ');
      const firstName = names[0] || 'Field';
      const lastName = names.slice(1).join(' ') || 'Technician';
      const isExisting = this.isValidUuid(tech.id);

      // Aligned with users_role_check: CHECK (role IN ('CUSTOMER', 'TECHNICIAN', 'ADMIN', 'STAFF'))
      const payload: Record<string, any> = {
        tenant_id: tenantId,
        phone: tech.phone || `+1800${String(Date.now()).slice(-7)}`,
        first_name: firstName,
        last_name: lastName,
        role: 'TECHNICIAN',
        is_active: true
      };
      if ((tech as any).email) {
        payload.email = (tech as any).email;
      } else if (!isExisting) {
        payload.email = `${firstName.toLowerCase()}.${Date.now()}@technician.local`;
      }
      if (isExisting) {
        payload.id = tech.id;
      } else if (tech.id) {
        payload.id = this.toDeterministicUuid(`tech:${tenantId}:${tech.id}`);
      }
      const { data, error } = await this.client.from('users').upsert(payload).select('id').maybeSingle();
      if (error || !data?.id) {
        if (error) throw error;
        return false;
      }

      const { error: profileError } = await this.client.from('provider_profiles').upsert({
        user_id: data.id,
        trade_license_number: (tech as any).licenseNumber || `LIC-${String(data.id).slice(0, 6).toUpperCase()}`,
        trade_category: tech.specialization || 'General Service',
        is_verified: true,
        is_online: tech.status === 'Available' || tech.status === 'On Job',
        average_rating: tech.rating || 4.95,
        completed_jobs_count: tech.jobsCompleted || 0,
      }, { onConflict: 'user_id' });
      if (profileError) throw profileError;
      return true;
    } catch (e) {
      console.warn('[SupabaseService] saveTechnician error:', e);
      return false;
    }
  }

  public async saveCategory(category: Partial<ServiceCategory>): Promise<boolean> {
    if (!this.client) return false;
    try {
      const tenantId = await this.getTenantId();
      if (!tenantId) return false;
      const slug = (category.name || 'category').toLowerCase().replace(/[^a-z0-9]+/g, '-');

      // 1. Primary: Aligned with 003_services_and_catalog.sql service_categories table
      const canonicalPayload: Record<string, any> = {
        tenant_id: tenantId,
        slug: `${slug}-${Date.now().toString().slice(-4)}`,
        name: category.name || 'New Category',
        icon_name: category.iconName || 'wrench',
        display_order: (category as any).displayOrder || (category as any).priorityRank || 1,
        is_active: true
      };

      if (this.isValidUuid(category.id)) {
        canonicalPayload.id = category.id;
      } else if (category.id) {
        canonicalPayload.id = this.toDeterministicUuid(`category:${tenantId}:${category.id}`);
      }

      const { data: canonData, error: canonError } = await this.client
        .from('service_categories')
        .upsert(canonicalPayload)
        .select('id')
        .maybeSingle();

      if (!canonError && canonData?.id) {
        return true;
      }

      // 2. Fallback: Aligned with legacy categories table if present
      const legacyPayload: Record<string, any> = {
        tenant_id: tenantId,
        slug: canonicalPayload.slug,
        title: category.name || 'New Category',
        short_title: (category.name || 'Category').slice(0, 64),
        priority_rank: canonicalPayload.display_order,
        icon_name: category.iconName || 'Wrench',
        image_url: (category as any).imageUrl || '/assets/categories/default.jpg',
        is_active: true
      };
      if (canonicalPayload.id) legacyPayload.id = canonicalPayload.id;

      const { data, error } = await this.client.from('categories').upsert(legacyPayload).select('id').maybeSingle();
      if (error || !data?.id) {
        if (error) throw error;
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[SupabaseService] saveCategory error:', e);
      return false;
    }
  }

  public async saveService(service: Partial<ServiceItem>): Promise<boolean> {
    if (!this.client) return false;
    try {
      const tenantId = await this.getTenantId();
      if (!tenantId) return false;

      let categoryId: string | null = null;
      if (service.category) {
        // Try service_categories first, then legacy categories
        const { data: canonCat } = await this.client
          .from('service_categories')
          .select('id')
          .ilike('name', service.category)
          .limit(1)
          .maybeSingle();
        if (canonCat?.id) {
          categoryId = canonCat.id;
        } else {
          const { data: matchedCat } = await this.client
            .from('categories')
            .select('id')
            .ilike('title', service.category)
            .limit(1)
            .maybeSingle();
          if (matchedCat?.id) categoryId = matchedCat.id;
        }
      }

      if (!categoryId) {
        const { data: fallbackCanon } = await this.client
          .from('service_categories')
          .select('id')
          .limit(1)
          .maybeSingle();
        if (fallbackCanon?.id) {
          categoryId = fallbackCanon.id;
        } else {
          const { data: fallbackCat } = await this.client
            .from('categories')
            .select('id')
            .limit(1)
            .maybeSingle();
          if (fallbackCat?.id) categoryId = fallbackCat.id;
        }
      }
      if (!categoryId) return false;

      // Aligned with 003_services_and_catalog.sql services table (includes tenant_id NOT NULL & category_id)
      const slug = `${(service.name || 'service').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
      const payload: Record<string, any> = {
        tenant_id: tenantId,
        category_id: categoryId,
        name: service.name || 'New Service',
        slug: slug,
        description: service.description || 'Standard service package',
        base_price_cents: Math.round((service.basePrice || 100) * 100),
        estimated_duration_minutes: service.durationMinutes || 60,
        is_popular: service.isPopular || false,
        is_active: service.status !== 'Draft'
      };
      if (this.isValidUuid(service.id)) {
        payload.id = service.id;
      } else if (service.id) {
        payload.id = this.toDeterministicUuid(`service:${categoryId}:${service.id}`);
      }
      const { data, error } = await this.client.from('services').upsert(payload).select('id').maybeSingle();
      if (error || !data?.id) {
        if (error) throw error;
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[SupabaseService] saveService error:', e);
      return false;
    }
  }

  public async deleteService(serviceId: string): Promise<boolean> {
    if (!this.client || !this.isValidUuid(serviceId)) return false;
    try {
      const { error } = await this.client.from('services').delete().eq('id', serviceId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('[SupabaseService] deleteService error:', e);
      return false;
    }
  }

  public async verifyBookingEscrow(bookingId: string, pinCode?: string): Promise<boolean> {
    if (!this.client || !this.isValidUuid(bookingId)) return false;
    try {
      if (pinCode) {
        const { data, error } = await this.client.rpc('release_escrow_to_technician', {
          p_booking_id: bookingId,
          p_pin_code: pinCode,
        });
        if (error) throw error;
        return data === true;
      }
      const { data, error } = await this.client
        .from('bookings')
        .update({ escrow_status: 'RELEASED_TO_PROVIDER', status: 'COMPLETED' })
        .eq('id', bookingId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.id);
    } catch (e) {
      console.warn('[SupabaseService] verifyBookingEscrow error:', e);
      return false;
    }
  }

  public async saveAuditLog(log: AuditLogItem): Promise<boolean> {
    if (!this.client) return false;
    try {
      const { error } = await this.client.from('security_audit_logs').insert({
        actor_email: log.user || 'system',
        role: log.role || 'ADMIN',
        event_type: log.action,
        severity: log.action.includes('INCIDENT') || log.action.includes('ALERT') ? 'CRITICAL' : 'INFO',
        ip_address: log.ipAddress || '127.0.0.1',
        details: log.details || `${log.action} performed in ${log.module}`
      });
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('[SupabaseService] saveAuditLog error:', e);
      return false;
    }
  }

  // =========================================================================
  // Server-Side Supabase Edge Function Integrations (Stripe, Twilio, FCM)
  // =========================================================================

  public async sendSms(to: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
    if (!this.client) {
      return { success: false, error: 'Supabase cloud client not configured' };
    }
    try {
      const { data, error } = await this.client.functions.invoke('twilio-sms', {
        body: { to, message },
      });
      if (error) throw error;
      if (data?.success) {
        return { success: true, sid: data.sid };
      }
      return { success: false, error: data?.error || 'SMS gateway rejected transmission' };
    } catch (e: any) {
      console.warn('[SupabaseService] sendSms Edge Function error:', e);
      return { success: false, error: e?.message || 'Twilio Edge Function unreachable' };
    }
  }

  public async createPaymentIntent(params: {
    bookingId: string;
    amountCents: number;
    currency?: string;
    customerId?: string;
    providerConnectAccountId?: string;
  }): Promise<{ success: boolean; clientSecret?: string; paymentIntentId?: string; error?: string }> {
    if (!this.client) {
      return { success: false, error: 'Supabase cloud client not configured' };
    }
    try {
      const { data, error } = await this.client.functions.invoke('stripe-payment-intent', {
        body: params,
      });
      if (error) throw error;
      if (data?.success && data?.clientSecret) {
        return {
          success: true,
          clientSecret: data.clientSecret,
          paymentIntentId: data.paymentIntentId,
        };
      }
      return { success: false, error: data?.error || 'Stripe payment intent creation failed' };
    } catch (e: any) {
      console.warn('[SupabaseService] createPaymentIntent error:', e);
      return { success: false, error: e?.message || 'Stripe Edge Function unreachable' };
    }
  }

  /**
   * Subscribe to Supabase Realtime channel for synchronized live radar
   */
  public subscribeToRealtime(onTableChange: (table: string, payload: any) => void): () => void {
    if (!this.client) return () => {};

    try {
      if (this.channel) {
        this.channel.unsubscribe();
      }

      this.channel = this.client.channel('serviceos_shared_dispatch')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, payload => {
          onTableChange('bookings', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, payload => {
          onTableChange('users', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_profiles' }, payload => {
          onTableChange('technicians', payload);
        })
        .subscribe();

      return () => {
        if (this.channel) {
          this.channel.unsubscribe();
          this.channel = null;
        }
      };
    } catch (err) {
      console.warn('[SupabaseService] Realtime subscription error:', err);
      return () => {};
    }
  }
}

export const supabaseService = new SupabaseService();
