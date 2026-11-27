import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { buildScheduledStartIso } from '../utils/formatters';
import {
  mapBookingDto,
  mapCategoryDto,
  mapCustomerDto,
  mapInvoiceDto,
  mapReviewDto,
  mapServiceDto,
  mapStaffDto,
  mapTechnicianDto,
  mapTicketDto,
} from './mappers';
import type {
  AuditLogItem,
  Booking,
  BookingStatus,
  Customer,
  CustomerReview,
  Incident,
  Invoice,
  PricingConfig,
  ServiceCategory,
  ServiceItem,
  StaffMember,
  SupportTicket,
  Technician,
  TenantConfig,
  UserRole,
} from '../types';
import type { AuthSession, CMSConfig, MutationResult, Toast } from './types';

export function useOperationsData(
  session: AuthSession | null,
  currentRole: UserRole,
  tenantConfig: TenantConfig,
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
  ) => Promise<MutationResult>,
  addToast: (title: string, type?: Toast['type']) => void
) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false);

  const [cmsConfig, setCmsConfig] = useState<CMSConfig>({
    heroHeading: 'Your Service, Our Priority',
    heroSubheading:
      'Book certified, on-demand home service professionals with upfront pricing and escrow guarantee.',
    searchPlaceholder: 'Search certified home services...',
    promoCoupon: '',
    promoDiscount: 0,
    heroGraphicName: 'serviceos_master_ui.jpg',
    heroGraphicDesc: 'Hero banner configuration synced from tenant_cms_configs',
  });

  const pricingConfig: PricingConfig = {
    commissionRate: Number(((tenantConfig.commissionBps || 1500) / 100).toFixed(2)),
    surgeMultiplier: Number(tenantConfig.pricingConfig?.surgeMultiplier ?? 1.0),
    minCalloutFee: Number(tenantConfig.pricingConfig?.minCalloutFee ?? 20),
    nightSurcharge: Number(tenantConfig.pricingConfig?.nightSurcharge ?? 0),
    surgeActive: Boolean(tenantConfig.pricingConfig?.surgeActive ?? false),
  };

  const refreshOperationsData = useCallback(async () => {
    if (!session?.token) return;
    setIsDataLoading(true);
    try {
      const hubLat = tenantConfig.defaultMapLat ?? 25.2048;
      const hubLng = tenantConfig.defaultMapLng ?? 55.2708;

      const requests: Array<Promise<any>> = [
        apiClient.getBookings({ limit: 100 }),
        apiClient.getServices(),
        apiClient.getCategories(),
        apiClient.getCustomers({ limit: 100 }),
        apiClient.getTechnicians({ limit: 100 }),
        apiClient.getTickets({ limit: 100 }),
        apiClient.getReviews(),
        apiClient.getCmsConfig(),
        currentRole === 'ADMIN' ? apiClient.getInvoices({ limit: 100 }) : Promise.resolve(null),
        apiClient.getIncidents(),
        currentRole === 'ADMIN' ? apiClient.getAuditLogs({ limit: 50 }) : Promise.resolve(null),
        apiClient.getStaff(),
      ];

      const [
        bookingsRes,
        servicesRes,
        categoriesRes,
        customersRes,
        techsRes,
        ticketsRes,
        reviewsRes,
        cmsRes,
        invoicesRes,
        incidentsRes,
        auditLogsRes,
        staffRes,
      ] = await Promise.allSettled(requests);

      if (bookingsRes.status === 'fulfilled' && bookingsRes.value?.success && Array.isArray(bookingsRes.value.data)) {
        setBookings(bookingsRes.value.data.map((b: any) => mapBookingDto(b, hubLat, hubLng)));
      }

      if (servicesRes.status === 'fulfilled' && servicesRes.value?.success && Array.isArray(servicesRes.value.data)) {
        setServices(servicesRes.value.data.map(mapServiceDto));
      }

      if (categoriesRes.status === 'fulfilled' && categoriesRes.value?.success && Array.isArray(categoriesRes.value.data)) {
        setCategories(categoriesRes.value.data.map(mapCategoryDto));
      }

      if (customersRes.status === 'fulfilled' && customersRes.value?.success && Array.isArray(customersRes.value.data)) {
        setCustomers(customersRes.value.data.map(mapCustomerDto));
      }

      if (techsRes.status === 'fulfilled' && techsRes.value?.success && Array.isArray(techsRes.value.data)) {
        setTechnicians(techsRes.value.data.map((t: any) => mapTechnicianDto(t, hubLat, hubLng)));
      }

      if (ticketsRes.status === 'fulfilled' && ticketsRes.value?.success && Array.isArray(ticketsRes.value.data)) {
        setTickets(ticketsRes.value.data.map(mapTicketDto));
      }

      if (reviewsRes.status === 'fulfilled' && reviewsRes.value?.success && Array.isArray(reviewsRes.value.data)) {
        setReviews(reviewsRes.value.data.map(mapReviewDto));
      }

      if (cmsRes.status === 'fulfilled' && cmsRes.value?.success && cmsRes.value.data) {
        const c = cmsRes.value.data;
        setCmsConfig((prev) => ({
          ...prev,
          heroHeading: c.heroHeading || prev.heroHeading,
          heroSubheading: c.heroSubheading || prev.heroSubheading,
          searchPlaceholder: c.searchPlaceholder || prev.searchPlaceholder,
          promoCoupon: c.promoCouponCode || '',
          promoDiscount: Number(c.promoDiscountPercent ?? 0),
        }));
      }

      if (
        invoicesRes.status === 'fulfilled' &&
        invoicesRes.value?.success &&
        Array.isArray(invoicesRes.value.data)
      ) {
        setInvoices(invoicesRes.value.data.map(mapInvoiceDto));
      }

      if (
        incidentsRes.status === 'fulfilled' &&
        incidentsRes.value?.success &&
        Array.isArray(incidentsRes.value.data)
      ) {
        const mapSeverity = (s: unknown): Incident['severity'] => {
          const up = String(s || '').toUpperCase();
          if (up === 'CRITICAL' || up === 'URGENT') return 'Critical';
          if (up === 'HIGH') return 'High';
          return 'Moderate';
        };
        setIncidents(
          incidentsRes.value.data.map((inc: any): Incident => ({
            id: String(inc.id),
            severity: mapSeverity(inc.severity || inc.priority),
            category: 'Safety',
            title: String(inc.title || inc.subject || 'Operational Incident'),
            description: String(inc.description || inc.subject || ''),
            timestamp: inc.createdAt ? new Date(inc.createdAt).toLocaleString() : '',
            bookingNo: String(inc.bookingReference || inc.ticketNumber || inc.bookingId || 'N/A'),
            customerName: inc.customerName || undefined,
            resolved: ['RESOLVED', 'CLOSED'].includes(String(inc.status || '').toUpperCase()),
          }))
        );
      }

      if (
        auditLogsRes.status === 'fulfilled' &&
        auditLogsRes.value?.success &&
        Array.isArray(auditLogsRes.value.data)
      ) {
        setAuditLogs(
          auditLogsRes.value.data.map((a: any): AuditLogItem => ({
            id: String(a.id),
            timestamp: a.createdAt ? new Date(a.createdAt).toLocaleString() : '',
            user: String(a.actorId || a.actorRole || 'System'),
            role: String(a.actorRole || 'SYSTEM'),
            action: String(a.action || ''),
            module: String(a.resourceType || 'System'),
            details: a.diffPayload ? JSON.stringify(a.diffPayload) : String(a.resourceId || ''),
            ipAddress: String(a.ipAddress || 'Internal'),
          }))
        );
      }

      if (
        staffRes.status === 'fulfilled' &&
        staffRes.value?.success &&
        Array.isArray(staffRes.value.data)
      ) {
        setStaffMembers(staffRes.value.data.map(mapStaffDto));
      }
    } catch (err) {
      console.warn('[useOperationsData] Live API sync error:', err);
    } finally {
      setIsDataLoading(false);
    }
  }, [session?.token, currentRole, tenantConfig.defaultMapLat, tenantConfig.defaultMapLng]);

  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void refreshOperationsData();
    });
    return () => {
      cancelled = true;
    };
  }, [session?.token, refreshOperationsData]);

  const appendLocalAudit = useCallback(
    (action: string, module: string, details: string) => {
      setAuditLogs((prev) => [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          user: session?.user?.name || session?.user?.email || currentRole,
          role: currentRole,
          action,
          module,
          details,
          ipAddress: 'Active API Session',
        },
        ...prev,
      ]);
    },
    [session?.user?.name, session?.user?.email, currentRole]
  );

  // BOOKING MUTATIONS
  const createBooking = useCallback(
    async (newBooking: Partial<Booking>): Promise<MutationResult> => {
      const targetService =
        services.find((s) => s.id === newBooking.serviceId) ||
        services.find((s) => s.name === newBooking.serviceName) ||
        services[0];

      if (!targetService) {
        const msg = 'No active service selected. Please create a service in the Catalog first.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }

      const targetCustomer =
        customers.find((c) => c.id === newBooking.customerId) ||
        customers.find((c) => c.name.toLowerCase() === (newBooking.customerName || '').toLowerCase());

      const priorityMap: Record<string, 'STANDARD' | 'URGENT' | 'EMERGENCY'> = {
        Critical: 'EMERGENCY',
        High: 'URGENT',
        Medium: 'STANDARD',
        Low: 'STANDARD',
      };

      const res = await apiClient.createBooking({
        serviceId: targetService.id,
        ...(targetCustomer ? { customerId: targetCustomer.id } : {}),
        addressText: newBooking.customerAddress || 'Customer Service Address',
        latitude: Number.isFinite(Number(newBooking.lat))
          ? Number(newBooking.lat)
          : tenantConfig.defaultMapLat ?? 25.2048,
        longitude: Number.isFinite(Number(newBooking.lng))
          ? Number(newBooking.lng)
          : tenantConfig.defaultMapLng ?? 55.2708,
        accessInstructions: newBooking.notes,
        scheduledStart:
          newBooking.scheduledStartIso ||
          buildScheduledStartIso(newBooking.scheduleDate || '', newBooking.scheduleTime),
        priority: priorityMap[newBooking.priority || 'Medium'] || 'STANDARD',
      });

      if (!res.success || !res.data?.bookingId) {
        const msg = res.error?.message || 'Failed to create booking on server.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }

      if (newBooking.technicianId) {
        const assignRes = await apiClient.assignBooking(res.data.bookingId, newBooking.technicianId);
        if (!assignRes.success) {
          addToast(
            `Booking ${res.data.bookingReference} created, but technician assignment failed: ${assignRes.error?.message}`,
            'warning'
          );
        }
      }

      appendLocalAudit('BOOKING_CREATED', 'Bookings & Dispatch', `Created order ${res.data.bookingReference}`);
      await refreshOperationsData();
      addToast(`Booking ${res.data.bookingReference} created and synced to server.`, 'success');
      return { ok: true };
    },
    [services, customers, tenantConfig, addToast, appendLocalAudit, refreshOperationsData]
  );

  const rescheduleBooking = useCallback(
    async (
      bookingId: string,
      newDateOrIso: string,
      newSlotOrReason?: string,
      reason?: string
    ): Promise<MutationResult> => {
      const isIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(newDateOrIso);
      const scheduledStart = isIso
        ? buildScheduledStartIso(newDateOrIso)
        : buildScheduledStartIso(newDateOrIso, newSlotOrReason);
      const finalReason = isIso ? newSlotOrReason : reason;

      const res = await apiClient.rescheduleBooking(bookingId, {
        scheduledStart,
        reason: finalReason,
      });

      if (!res.success) {
        const msg = res.error?.message || 'Failed to reschedule booking.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }

      appendLocalAudit('BOOKING_RESCHEDULED', 'Scheduling Desk', `Rescheduled booking ${bookingId}`);
      await refreshOperationsData();
      addToast('Booking appointment rescheduled and saved.', 'success');
      return { ok: true };
    },
    [addToast, appendLocalAudit, refreshOperationsData]
  );

  const assignTechnician = useCallback(
    async (bookingId: string, technicianId: string, reason?: string): Promise<MutationResult> => {
      const res = await apiClient.assignBooking(bookingId, technicianId, reason);
      if (!res.success) {
        const msg = res.error?.message || 'Failed to assign technician.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }

      appendLocalAudit(
        'BOOKING_ASSIGNED',
        'Dispatch',
        `Assigned technician ${res.data?.providerName || technicianId} to booking ${bookingId}`
      );
      await refreshOperationsData();
      addToast(`Technician ${res.data?.providerName || ''} assigned and dispatched.`, 'success');
      return { ok: true };
    },
    [addToast, appendLocalAudit, refreshOperationsData]
  );

  const emergencyHandover = useCallback(
    async (bookingId: string, newTechnicianId: string, reason: string): Promise<MutationResult> => {
      const res = await apiClient.triggerHandover(bookingId, newTechnicianId, reason);
      if (!res.success) {
        const msg = res.error?.message || 'Emergency handover failed.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }

      appendLocalAudit('EMERGENCY_HANDOVER', 'Dispatch', `Handover executed on ${bookingId}: ${reason}`);
      await refreshOperationsData();
      addToast('Emergency handover completed with new security PIN issued.', 'success');
      return { ok: true };
    },
    [addToast, appendLocalAudit, refreshOperationsData]
  );

  const updateBookingStatus = useCallback(
    async (bookingId: string, status: BookingStatus, reason?: string): Promise<MutationResult> => {
      if (status === 'Cancelled') {
        const res = await apiClient.cancelBooking(bookingId, reason || 'Cancelled via operations portal');
        if (!res.success) {
          const msg = res.error?.message || 'Cancellation rejected by server.';
          addToast(msg, 'error');
          return { ok: false, error: msg };
        }
        appendLocalAudit('BOOKING_CANCELLED', 'Bookings', `Cancelled booking ${bookingId}`);
        await refreshOperationsData();
        addToast('Booking cancelled and authorization voided.', 'success');
        return { ok: true };
      }

      if (status === 'Scheduled') {
        const res = await apiClient.triggerAutoDispatch(bookingId);
        if (!res.success) {
          const msg = res.error?.message || 'Auto-dispatch broadcast failed.';
          addToast(msg, 'error');
          return { ok: false, error: msg };
        }
        appendLocalAudit('DISPATCH_BROADCAST', 'Dispatch', `Auto-dispatch wave triggered for booking ${bookingId}`);
        await refreshOperationsData();
        addToast('Dispatch wave broadcasted to nearby verified technicians.', 'success');
        return { ok: true };
      }

      if (status === 'Completed') {
        const res = await apiClient.completeBooking(bookingId, {
          workSummaryNotes: reason || 'Completed via operations desk',
        });
        if (!res.success) {
          const msg = res.error?.message || 'Work order completion rejected by server.';
          addToast(msg, 'error');
          return { ok: false, error: msg };
        }
        appendLocalAudit('BOOKING_COMPLETED', 'Bookings', `Completed booking ${bookingId}`);
        await refreshOperationsData();
        addToast('Work order completed and escrow settlement recorded.', 'success');
        return { ok: true };
      }

      const msg = `Status transitions are enforced by dispatch workflow (requested: ${status}).`;
      addToast(msg, 'info');
      return { ok: false, error: msg };
    },
    [addToast, appendLocalAudit, refreshOperationsData]
  );

  const verifyBooking = useCallback(
    (_bookingId: string) => {
      addToast(
        'Escrow release & completion must be finalized through verified server completion or Admin payout workflow.',
        'warning'
      );
    },
    [addToast]
  );

  // CATALOG MUTATIONS
  const addCategory = useCallback(
    async (newCat: Partial<ServiceCategory>): Promise<ServiceCategory | null> => {
      const res = await apiClient.createCategory({
        name: newCat.name || 'New Service Category',
        iconName: newCat.iconName || 'wrench',
        bannerUrl: newCat.bannerUrl ?? undefined,
        displayOrder: newCat.displayOrder ?? 0,
      });
      if (!res.success || !res.data) {
        addToast(res.error?.message || 'Failed to create category.', 'error');
        return null;
      }
      const mapped = mapCategoryDto(res.data);
      await refreshOperationsData();
      addToast(`Category "${mapped.name}" created.`, 'success');
      return mapped;
    },
    [addToast, refreshOperationsData]
  );

  const updateCategory = useCallback(
    async (id: string, updates: Partial<ServiceCategory>): Promise<MutationResult> => {
      const res = await apiClient.updateCategory(id, {
        name: updates.name,
        iconName: updates.iconName,
        bannerUrl: updates.bannerUrl,
        displayOrder: updates.displayOrder,
      });
      if (!res.success) {
        const msg = res.error?.message || 'Failed to update category.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast('Service category updated.', 'success');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  const deleteCategory = useCallback(
    async (id: string): Promise<MutationResult> => {
      const res = await apiClient.deleteCategory(id);
      if (!res.success) {
        const msg = res.error?.message || 'Failed to delete category.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast('Service category archived.', 'info');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  const addService = useCallback(
    async (service: Partial<ServiceItem>): Promise<ServiceItem | null> => {
      const matchedCat =
        categories.find((c) => c.id === service.categoryId) ||
        categories.find((c) => c.name.toLowerCase() === (service.category || '').toLowerCase()) ||
        categories[0];

      if (!matchedCat) {
        addToast('Create at least one Service Category before adding services.', 'error');
        return null;
      }

      const res = await apiClient.createService({
        categoryId: matchedCat.id,
        name: service.name || 'New Service',
        description: service.description || '',
        basePriceCents: Math.max(0, Math.round((service.basePrice ?? 0) * 100)),
        estimatedDurationMinutes: Math.max(15, Number(service.durationMinutes ?? 60)),
        isPopular: Boolean(service.isPopular),
      });

      if (!res.success || !res.data) {
        addToast(res.error?.message || 'Failed to create service.', 'error');
        return null;
      }
      const mapped = mapServiceDto(res.data);
      await refreshOperationsData();
      addToast(`Service "${mapped.name}" published to catalog.`, 'success');
      return mapped;
    },
    [categories, addToast, refreshOperationsData]
  );

  const updateService = useCallback(
    async (id: string, updates: Partial<ServiceItem>): Promise<MutationResult> => {
      const matchedCat = updates.categoryId
        ? categories.find((c) => c.id === updates.categoryId)
        : updates.category
          ? categories.find((c) => c.name.toLowerCase() === updates.category!.toLowerCase())
          : undefined;

      const res = await apiClient.updateService(id, {
        ...(matchedCat ? { categoryId: matchedCat.id } : {}),
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.basePrice !== undefined
          ? { basePriceCents: Math.max(0, Math.round(updates.basePrice * 100)) }
          : {}),
        ...(updates.durationMinutes !== undefined
          ? { estimatedDurationMinutes: Math.max(15, Number(updates.durationMinutes)) }
          : {}),
        ...(updates.isPopular !== undefined ? { isPopular: updates.isPopular } : {}),
        ...(updates.status !== undefined ? { isActive: updates.status === 'Active' } : {}),
      });

      if (!res.success) {
        const msg = res.error?.message || 'Failed to update service.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast('Service catalog item updated.', 'success');
      return { ok: true };
    },
    [categories, addToast, refreshOperationsData]
  );

  const deleteService = useCallback(
    async (id: string): Promise<MutationResult> => {
      const res = await apiClient.deleteService(id);
      if (!res.success) {
        const msg = res.error?.message || 'Failed to remove service.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast('Service deactivated from catalog.', 'info');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  // CRM MUTATIONS
  const addCustomer = useCallback(
    async (newCust: Partial<Customer>): Promise<Customer | null> => {
      if (!newCust.email || !newCust.name) {
        addToast('Customer full name and email are required.', 'error');
        return null;
      }
      const res = await apiClient.createCustomer({
        email: newCust.email.trim(),
        fullName: newCust.name.trim(),
        phone: newCust.phone?.trim() || undefined,
        defaultAddress: newCust.address?.trim() || undefined,
        courtesyCreditCents: newCust.courtesyCreditCents ?? 0,
      });
      if (!res.success || !res.data) {
        addToast(res.error?.message || 'Failed to register customer.', 'error');
        return null;
      }
      const mapped = mapCustomerDto(res.data);
      await refreshOperationsData();
      addToast(`Customer ${mapped.name} registered in CRM.`, 'success');
      return mapped;
    },
    [addToast, refreshOperationsData]
  );

  const updateCustomer = useCallback(
    async (id: string, updates: Partial<Customer>): Promise<MutationResult> => {
      const res = await apiClient.updateCustomer(id, {
        ...(updates.name !== undefined ? { fullName: updates.name } : {}),
        ...(updates.phone !== undefined ? { phone: updates.phone || null } : {}),
        ...(updates.address !== undefined ? { defaultAddress: updates.address || null } : {}),
        ...(updates.courtesyCreditCents !== undefined
          ? { courtesyCreditCents: updates.courtesyCreditCents }
          : {}),
        ...(updates.status !== undefined ? { isActive: updates.status !== 'Suspended' } : {}),
      });
      if (!res.success) {
        const msg = res.error?.message || 'Failed to update customer profile.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast('Customer profile updated.', 'success');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  const addTechnician = useCallback(
    async (newTech: Partial<Technician>): Promise<Technician | null> => {
      if (!newTech.email || !newTech.name) {
        addToast('Technician full name and email are required.', 'error');
        return null;
      }
      const res = await apiClient.createTechnician({
        email: newTech.email.trim(),
        fullName: newTech.name.trim(),
        phone: newTech.phone?.trim() || undefined,
        tradeCategory: newTech.specialization || 'General',
        licenseNumber: newTech.licenseNumber || undefined,
        hourlyRateCents: Math.max(0, Math.round((newTech.hourlyRate ?? 0) * 100)),
        vehicleMakeModel: newTech.vehicleMakeModel || undefined,
        vehicleLicensePlate: newTech.vehicleLicensePlate || undefined,
        isVerified: newTech.isVerified ?? true,
      });
      if (!res.success || !res.data) {
        addToast(res.error?.message || 'Failed to onboard technician.', 'error');
        return null;
      }
      const mapped = mapTechnicianDto(res.data);
      await refreshOperationsData();
      addToast(`Technician ${mapped.name} onboarded to fleet.`, 'success');
      return mapped;
    },
    [addToast, refreshOperationsData]
  );

  const updateTechnician = useCallback(
    async (id: string, updates: Partial<Technician>): Promise<MutationResult> => {
      const hasProfileFields =
        updates.name !== undefined ||
        updates.phone !== undefined ||
        updates.specialization !== undefined ||
        updates.hourlyRate !== undefined ||
        updates.licenseNumber !== undefined ||
        updates.vehicleMakeModel !== undefined ||
        updates.vehicleLicensePlate !== undefined ||
        updates.isVerified !== undefined ||
        updates.isActive !== undefined;

      if (!hasProfileFields && updates.status !== undefined) {
        const res = await apiClient.updateTechnician(id, {
          isActive: updates.status !== 'Offline' && updates.status !== 'On Leave',
        });
        if (!res.success) {
          addToast(res.error?.message || 'Failed to update technician status.', 'error');
          return { ok: false, error: res.error?.message };
        }
        await refreshOperationsData();
        addToast('Technician fleet status updated.', 'success');
        return { ok: true };
      }

      const res = await apiClient.updateTechnician(id, {
        ...(updates.name !== undefined ? { fullName: updates.name } : {}),
        ...(updates.phone !== undefined ? { phone: updates.phone || null } : {}),
        ...(updates.specialization !== undefined ? { tradeCategory: updates.specialization } : {}),
        ...(updates.licenseNumber !== undefined ? { licenseNumber: updates.licenseNumber || null } : {}),
        ...(updates.hourlyRate !== undefined
          ? { hourlyRateCents: Math.max(0, Math.round(updates.hourlyRate * 100)) }
          : {}),
        ...(updates.vehicleMakeModel !== undefined
          ? { vehicleMakeModel: updates.vehicleMakeModel || null }
          : {}),
        ...(updates.vehicleLicensePlate !== undefined
          ? { vehicleLicensePlate: updates.vehicleLicensePlate || null }
          : {}),
        ...(updates.isVerified !== undefined ? { isVerified: updates.isVerified } : {}),
        ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
      });

      if (!res.success) {
        const msg = res.error?.message || 'Failed to update technician profile.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast('Technician profile updated.', 'success');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  const verifyTechnician = useCallback(
    async (id: string, isVerified: boolean, notes?: string): Promise<MutationResult> => {
      const res = await apiClient.verifyTechnician(id, isVerified, notes);
      if (!res.success) {
        const msg = res.error?.message || 'Failed to verify technician.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast(`Technician verification ${isVerified ? 'approved' : 'revoked'}.`, 'success');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  const updateTechnicianDutyStatus = useCallback(
    async (
      id: string,
      dutyStatus: 'ONLINE' | 'OFFLINE' | 'ON_JOB' | 'EN_ROUTE'
    ): Promise<MutationResult> => {
      const res = await apiClient.updateTechnicianDutyStatus(id, dutyStatus);
      if (!res.success) {
        const msg = res.error?.message || 'Failed to update technician duty status.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast(`Technician duty status updated to ${dutyStatus}.`, 'success');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  const createStaffMember = useCallback(
    async (payload: {
      email: string;
      fullName: string;
      phone?: string;
      department?: string;
      assignedTerritory?: string;
      shiftHours?: string;
      password?: string;
    }): Promise<MutationResult> => {
      const res = await apiClient.createStaff(payload);
      if (!res.success) {
        const msg = res.error?.message || 'Failed to create staff member.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast(`Staff account ${payload.fullName} created.`, 'success');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  const updateStaffMember = useCallback(
    async (
      id: string,
      updates: {
        fullName?: string;
        phone?: string | null;
        department?: string | null;
        assignedTerritory?: string | null;
        shiftHours?: string | null;
        isActive?: boolean;
      }
    ): Promise<MutationResult> => {
      const res = await apiClient.updateStaff(id, updates);
      if (!res.success) {
        const msg = res.error?.message || 'Failed to update staff member.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast('Staff member profile updated.', 'success');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  // SUPPORT, REVIEWS & CMS MUTATIONS
  const updateTicketStatus = useCallback(
    async (ticketId: string, status: SupportTicket['status']) => {
      const apiStatus = status === 'Resolved' ? 'RESOLVED' : status === 'In Progress' ? 'IN_PROGRESS' : 'OPEN';
      const res = await apiClient.updateTicketStatus(ticketId, { status: apiStatus });
      if (!res.success) {
        addToast(res.error?.message || 'Failed to update ticket status.', 'error');
        return;
      }
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status, rawStatus: apiStatus } : t)));
      addToast(`Ticket status updated to ${status}.`, 'success');
    },
    [addToast]
  );

  const moderateReview = useCallback(
    async (reviewId: string, isPublic: boolean, moderationFlagged: boolean): Promise<MutationResult> => {
      const res = await apiClient.moderateReview(reviewId, { isPublic, moderationFlagged });
      if (!res.success) {
        const msg = res.error?.message || 'Failed to moderate review.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      await refreshOperationsData();
      addToast('Review moderation status updated.', 'success');
      return { ok: true };
    },
    [addToast, refreshOperationsData]
  );

  const updateCmsConfig = useCallback(
    async (updates: Partial<CMSConfig>): Promise<MutationResult> => {
      const next: CMSConfig = { ...cmsConfig, ...updates };
      const res = await apiClient.updateCmsConfig({
        heroHeading: next.heroHeading,
        heroSubheading: next.heroSubheading,
        searchPlaceholder: next.searchPlaceholder || 'Search certified home services...',
        promoCouponCode: next.promoCoupon || undefined,
        promoDiscountPercent: Number.isFinite(Number(next.promoDiscount)) ? Number(next.promoDiscount) : 0,
      });
      if (!res.success) {
        const msg = res.error?.message || 'Failed to save CMS settings.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }
      setCmsConfig(next);
      addToast('Website & Mobile CMS settings saved to server.', 'success');
      return { ok: true };
    },
    [cmsConfig, addToast]
  );

  const updatePricingConfig = useCallback(
    async (updates: Partial<PricingConfig>) => {
      const nextPricing = {
        surgeMultiplier: updates.surgeMultiplier ?? pricingConfig.surgeMultiplier,
        minCalloutFee: updates.minCalloutFee ?? pricingConfig.minCalloutFee,
        nightSurcharge: updates.nightSurcharge ?? pricingConfig.nightSurcharge,
        surgeActive: updates.surgeActive ?? pricingConfig.surgeActive,
      };
      await updateSystemConfig({
        ...(updates.commissionRate !== undefined
          ? { commissionBps: Math.round(updates.commissionRate * 100) }
          : {}),
        pricingConfig: nextPricing,
      });
    },
    [
      pricingConfig.minCalloutFee,
      pricingConfig.nightSurcharge,
      pricingConfig.surgeActive,
      pricingConfig.surgeMultiplier,
      updateSystemConfig,
    ]
  );

  const addInvoice = useCallback(
    async (newInv: Partial<Invoice> & { bookingId?: string; subtotalAmount?: number }): Promise<MutationResult> => {
      const matchedBooking =
        (newInv.bookingId ? bookings.find((b) => b.id === newInv.bookingId || b.jobNo === newInv.bookingId) : undefined) ||
        (newInv.customerName
          ? bookings.find((b) => b.customerName.toLowerCase() === newInv.customerName!.trim().toLowerCase())
          : undefined);

      if (!matchedBooking) {
        const msg = 'Please select an existing booking for this invoice.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }

      const subtotalDollars = Number(newInv.subtotalAmount ?? newInv.amount ?? 0);
      const apiStatus = newInv.status === 'Paid' ? 'PAID' : 'DRAFT';

      const res = await apiClient.createInvoice({
        bookingId: matchedBooking.id,
        laborSubtotalCents: Math.max(0, Math.round(subtotalDollars * 100)),
        status: apiStatus,
      });

      if (!res.success || !res.data) {
        const msg = res.error?.message || 'Failed to persist invoice to PostgreSQL.';
        addToast(msg, 'error');
        return { ok: false, error: msg };
      }

      appendLocalAudit('INVOICE_CREATED', 'Finances', `Issued invoice ${res.data.invoiceNumber || res.data.id}`);
      await refreshOperationsData();
      addToast(`Invoice ${res.data.invoiceNumber || ''} persisted to database.`, 'success');
      return { ok: true };
    },
    [bookings, addToast, appendLocalAudit, refreshOperationsData]
  );

  const resolveIncident = useCallback(
    async (id: string, resolutionNotes?: string) => {
      const res = await apiClient.resolveIncidentApi(id, resolutionNotes);
      if (!res.success) {
        addToast(res.error?.message || 'Failed to resolve incident on server.', 'error');
        return;
      }
      setIncidents((prev) => prev.map((inc) => (inc.id === id ? { ...inc, resolved: true } : inc)));
      appendLocalAudit('RESOLVE_INCIDENT', 'Safety & Compliance', `Incident #${id} resolved`);
      addToast('Incident marked as Resolved in PostgreSQL.', 'success');
    },
    [appendLocalAudit, addToast]
  );

  const acknowledgeAllIncidents = useCallback(async () => {
    const unresolved = incidents.filter((i) => !i.resolved);
    if (unresolved.length === 0) return;
    const results = await Promise.allSettled(
      unresolved.map((inc) => apiClient.resolveIncidentApi(inc.id, 'Batch acknowledged by dispatcher'))
    );
    const resolvedCount = results.filter((r) => r.status === 'fulfilled' && r.value?.success).length;
    await refreshOperationsData();
    appendLocalAudit('ACKNOWLEDGE_ALL_INCIDENTS', 'Safety & Compliance', `${resolvedCount} alerts resolved`);
    addToast(`${resolvedCount} incident(s) marked resolved on server.`, resolvedCount > 0 ? 'success' : 'warning');
  }, [incidents, appendLocalAudit, addToast, refreshOperationsData]);

  const hasSession = Boolean(session?.token);

  return {
    bookings: hasSession ? bookings : [],
    technicians: hasSession ? technicians : [],
    customers: hasSession ? customers : [],
    services: hasSession ? services : [],
    categories: hasSession ? categories : [],
    invoices: hasSession ? invoices : [],
    tickets: hasSession ? tickets : [],
    reviews: hasSession ? reviews : [],
    auditLogs: hasSession ? auditLogs : [],
    incidents: hasSession ? incidents : [],
    staffMembers,
    isDataLoading,
    refreshOperationsData,
    pricingConfig,
    updatePricingConfig,
    cmsConfig,
    updateCmsConfig,
    resolveIncident,
    acknowledgeAllIncidents,
    updateTicketStatus,
    moderateReview,
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
    updateTechnicianDutyStatus,
    verifyTechnician,
    createStaffMember,
    updateStaffMember,
    addService,
    updateService,
    deleteService,
    addCategory,
    updateCategory,
    deleteCategory,
    addInvoice,
  };
}
