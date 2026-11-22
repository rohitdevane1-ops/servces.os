import {
  Booking,
  Customer,
  CustomerReview,
  Invoice,
  ServiceCategory,
  ServiceItem,
  SupportTicket,
  Technician,
} from '../types';

export function mapBookingDto(b: any, fallbackLat = 25.2048, fallbackLng = 55.2708): Booking {
  const rawStatus = String(b.status || '').toUpperCase();
  const mappedStatus: Booking['status'] =
    rawStatus === 'COMPLETED'
      ? 'Completed'
      : rawStatus === 'CANCELLED'
        ? 'Cancelled'
        : rawStatus === 'ON_SITE' || rawStatus === 'IN_PROGRESS' || rawStatus === 'EN_ROUTE'
          ? 'In Progress'
          : rawStatus === 'REQUESTED' || rawStatus === 'BROADCASTING'
            ? 'Pending'
            : 'Scheduled';

  const rawPay = String(b.payment_status || b.paymentStatus || b.escrowStatus || '').toUpperCase();
  const mappedPay: Booking['paymentStatus'] =
    rawPay === 'PAID' || rawPay === 'PARTIALLY_REFUNDED' || rawPay === 'RELEASED_TO_PROVIDER'
      ? 'Paid'
      : rawPay === 'VOID' || rawPay === 'REFUNDED'
        ? 'Unpaid'
        : 'Pending';

  const scheduledRaw = b.scheduled_start || b.scheduledStart || null;
  const parsedDate = scheduledRaw ? new Date(scheduledRaw) : null;
  const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
  const totalCents = Number(b.total_amount_cents ?? b.totalAuthorizedCents ?? b.base_price_cents ?? 0);

  return {
    id: String(b.id),
    jobNo: b.booking_reference || b.bookingReference || `JOB-${String(b.id).substring(0, 6)}`,
    customerName: b.customer_name || b.customerName || 'Customer',
    customerPhone: b.customer_phone || b.customerPhone || '',
    customerAddress: b.customer_address || b.addressText || '',
    serviceName: b.service_name || b.serviceName || 'Service',
    category: b.category_name || b.categoryName || 'General',
    technicianName: b.technician_name || b.providerName || 'Unassigned',
    technicianId: b.assigned_provider_id || b.providerId || '',
    technicianPhone: b.technician_phone || b.technicianPhone || '',
    scheduleDate: validDate ? validDate.toLocaleDateString() : 'Scheduled',
    scheduleTime: validDate
      ? validDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Flexible',
    scheduledStartIso: validDate ? validDate.toISOString() : undefined,
    estimate: Number((totalCents / 100).toFixed(2)),
    paymentStatus: mappedPay,
    status: mappedStatus,
    rawStatus,
    priority:
      String(b.priority || '').toUpperCase() === 'EMERGENCY'
        ? 'Critical'
        : String(b.priority || '').toUpperCase() === 'URGENT'
          ? 'High'
          : 'Medium',
    lat: Number.isFinite(Number(b.latitude)) ? Number(b.latitude) : fallbackLat,
    lng: Number.isFinite(Number(b.longitude)) ? Number(b.longitude) : fallbackLng,
    customerId: b.customer_id || b.customerId || undefined,
    serviceId: b.service_id || b.serviceId || undefined,
    safetyPin: b.customer_safety_pin || undefined,
    notes: b.access_instructions || b.accessInstructions || '',
  };
}

export function mapCustomerDto(c: any): Customer {
  const rawAddr = c.defaultAddress || c.default_address_text || '';
  const derivedCity =
    c.city ||
    (rawAddr.includes(',') ? rawAddr.split(',').slice(-1)[0]?.trim() : '') ||
    '';

  return {
    id: String(c.id),
    name: c.fullName || c.full_name || c.email || 'Customer',
    email: c.email || '',
    phone: c.phoneNumber || c.phone || '',
    city: derivedCity,
    address: rawAddr,
    totalBookings: Number(c.totalBookings ?? c.total_bookings ?? 0),
    lifetimeSpend: Number((Number(c.totalSpentCents ?? c.lifetimeSpendCents ?? 0) / 100).toFixed(2)),
    courtesyCreditCents: Number(c.courtesyCreditCents ?? 0),
    rating: Number(c.rating ?? 5.0),
    status: c.isActive === false ? 'Suspended' : 'Active',
    isActive: c.isActive !== false,
  };
}

export function mapTechnicianDto(t: any, fallbackLat = 25.2048, fallbackLng = 55.2708): Technician {
  const duty = String(t.dutyStatus || t.duty_status || '').toUpperCase();
  const status: Technician['status'] =
    duty === 'ONLINE'
      ? 'Available'
      : duty === 'ON_JOB' || duty === 'EN_ROUTE'
        ? 'On Job'
        : 'Offline';

  return {
    id: String(t.id),
    name: t.fullName || t.full_name || t.email || 'Technician',
    email: t.email || '',
    photo: '',
    phone: t.phoneNumber || t.phone || '',
    specialization: t.tradeCategory || t.trade_category || 'General',
    status,
    rating: Number(t.averageRating ?? t.currentRating ?? 5.0),
    jobsCompleted: Number(t.completedJobsCount ?? t.totalCompletedJobs ?? 0),
    onTimeRate: t.isVerified === false ? 0 : 98,
    currentJobsCount: duty === 'ON_JOB' || duty === 'EN_ROUTE' ? 1 : 0,
    workingHours: '08:00 AM - 06:00 PM',
    lat: Number.isFinite(Number(t.latitude)) ? Number(t.latitude) : fallbackLat,
    lng: Number.isFinite(Number(t.longitude)) ? Number(t.longitude) : fallbackLng,
    hourlyRate: Number((Number(t.hourlyRateCents ?? 0) / 100).toFixed(2)),
    licenseNumber: t.licenseNumber || undefined,
    vehicleMakeModel: t.vehicleMakeModel || undefined,
    vehicleLicensePlate: t.vehicleLicensePlate || undefined,
    isVerified: Boolean(t.isVerified),
    isActive: t.isActive !== false,
  };
}

export function mapServiceDto(s: any): ServiceItem {
  return {
    id: String(s.id),
    categoryId: s.category_id || s.categoryId || undefined,
    slug: s.slug || undefined,
    name: s.name || 'Service',
    category: s.category_name || s.categoryName || 'General',
    basePrice: Number((Number(s.base_price_cents ?? s.basePriceCents ?? 0) / 100).toFixed(2)),
    durationMinutes: Number(s.estimated_duration_minutes ?? s.estimatedDurationMinutes ?? 60),
    isPopular: Boolean(s.is_popular ?? s.isPopular ?? false),
    status: (s.is_active ?? s.isActive ?? true) ? 'Active' : 'Draft',
    description: s.description || '',
  };
}

export function mapCategoryDto(c: any): ServiceCategory {
  return {
    id: String(c.id),
    slug: c.slug || undefined,
    name: c.name || 'Category',
    iconName: c.icon_name || c.iconName || 'Wrench',
    bannerUrl: c.banner_url ?? c.bannerUrl ?? null,
    displayOrder: Number(c.display_order ?? c.displayOrder ?? 0),
    serviceCount: Number(c.service_count ?? c.servicesCount ?? 0),
    color: '#6366F1',
  };
}

export function mapInvoiceDto(inv: any): Invoice {
  const rawStatus = String(inv.status || '').toUpperCase();
  const status: Invoice['status'] =
    rawStatus === 'PAID' || rawStatus === 'PARTIALLY_REFUNDED'
      ? 'Paid'
      : rawStatus === 'VOID' || rawStatus === 'OVERDUE'
        ? 'Overdue'
        : 'Pending';

  const totalCents = Number(inv.totalAmountCents ?? inv.total_amount_cents ?? 0);
  const issuedRaw = inv.issuedAt || inv.issued_at;

  return {
    id: String(inv.id),
    invoiceNo: inv.invoiceNumber || inv.invoice_number || String(inv.id).slice(0, 8),
    bookingId: inv.bookingId || inv.booking_id || undefined,
    bookingReference: inv.bookingReference || inv.booking_reference || undefined,
    customerId: inv.customerId || inv.customer_id || undefined,
    customerName: inv.customerName || inv.customer_name || 'Customer',
    providerName: inv.providerName || inv.provider_name || undefined,
    serviceName: inv.serviceName || inv.service_name || 'Service Invoice',
    amount: Number((totalCents / 100).toFixed(2)),
    laborSubtotalCents: Number(inv.laborSubtotalCents ?? inv.labor_subtotal_cents ?? 0),
    partsSubtotalCents: Number(inv.partsSubtotalCents ?? inv.parts_subtotal_cents ?? 0),
    taxTotalCents: Number(inv.taxTotalCents ?? inv.tax_total_cents ?? 0),
    totalAmountCents: totalCents,
    refundedAmountCents: Number(inv.refundedAmountCents ?? inv.refunded_amount_cents ?? 0),
    rawStatus,
    date: issuedRaw ? new Date(issuedRaw).toLocaleDateString() : 'Today',
    paidAt: inv.paidAt || inv.paid_at || null,
    status,
  };
}

export function mapTicketDto(tk: any): SupportTicket {
  const rawStatus = String(tk.status || '').toUpperCase();
  const rawPriority = String(tk.priority || '').toUpperCase();
  return {
    id: String(tk.id),
    ticketNo: tk.ticketNumber || tk.ticket_number || String(tk.id).slice(0, 8),
    customerId: tk.customerId || tk.customer_id || undefined,
    customerName: tk.customerName || tk.customer_name || 'Customer',
    customerEmail: tk.customerEmail || tk.customer_email || undefined,
    assignedStaffName: tk.assignedStaffName || tk.assigned_staff_name || undefined,
    bookingId: tk.bookingId || tk.booking_id || undefined,
    bookingReference: tk.bookingReference || tk.booking_reference || undefined,
    subject: tk.subject || 'Support Request',
    category: tk.category || 'General Support',
    priority: rawPriority === 'URGENT' ? 'Urgent' : rawPriority === 'HIGH' ? 'High' : 'Normal',
    status:
      rawStatus === 'RESOLVED' || rawStatus === 'CLOSED'
        ? 'Resolved'
        : rawStatus === 'IN_PROGRESS'
          ? 'In Progress'
          : 'Open',
    rawStatus,
    createdAt: tk.createdAt ? new Date(tk.createdAt).toLocaleDateString() : 'Today',
    lastReply: tk.updatedAt
      ? new Date(tk.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Just now',
  };
}

export function mapReviewDto(r: any): CustomerReview {
  const isPublic = r.isPublic !== false;
  const moderationFlagged = Boolean(r.moderationFlagged);
  return {
    id: String(r.id),
    bookingId: r.bookingId || undefined,
    customerName: r.customerName || 'Verified Customer',
    providerName: r.providerName || undefined,
    serviceName: r.serviceName || 'Completed Service',
    rating: Number(r.rating ?? 5),
    comment: r.comment || '',
    date: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : 'Today',
    isVerified: isPublic && !moderationFlagged,
    isPublic,
    moderationFlagged,
    providerResponse: r.providerResponse || null,
  };
}
