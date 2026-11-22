/**
 * ServiceOS / ServicePro OS — Universal Formatting, Tax & Geospatial Helpers
 * All monetary, tax, distance, and coordinate outputs derive from active TenantConfig.
 */

export function formatMoney(
  amount: number,
  currencyCode: string = 'AED',
  currencySymbol?: string
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sym = (currencySymbol || '').trim();
  if (sym && sym !== currencyCode && sym.length <= 2) {
    return `${sym}${formatted}`;
  }
  return `${(currencyCode || 'AED').toUpperCase()} ${formatted}`;
}

export function formatMoneyCents(
  cents: number | string | null | undefined,
  currencyCode: string = 'AED',
  currencySymbol?: string
): string {
  const numericCents = Number(cents ?? 0);
  const safeCents = Number.isFinite(numericCents) ? numericCents : 0;
  return formatMoney(safeCents / 100, currencyCode, currencySymbol);
}

/**
 * Single non-compounding server-aligned tax calculation.
 * Never compounds taxes on top of already-taxed subtotals.
 */
export function calculateSingleTax(
  subtotal: number,
  taxRateBps: number = 500
): {
  subtotal: number;
  taxRatePercent: number;
  taxAmount: number;
  total: number;
} {
  const safeSub = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  const safeBps = Number.isFinite(taxRateBps) ? Math.max(0, Math.min(5000, taxRateBps)) : 500;
  const taxRatePercent = Number((safeBps / 100).toFixed(2));
  const taxAmount = Number(((safeSub * safeBps) / 10000).toFixed(2));
  const total = Number((safeSub + taxAmount).toFixed(2));
  return {
    subtotal: Number(safeSub.toFixed(2)),
    taxRatePercent,
    taxAmount,
    total,
  };
}

/**
 * Format latitude/longitude with accurate N/S and E/W hemispheres.
 */
export function formatCoordinates(
  lat: number,
  lng: number,
  precision: number = 4
): string {
  const safeLat = Number.isFinite(lat) ? lat : 0;
  const safeLng = Number.isFinite(lng) ? lng : 0;
  const latHem = safeLat >= 0 ? 'N' : 'S';
  const lngHem = safeLng >= 0 ? 'E' : 'W';
  return `${Math.abs(safeLat).toFixed(precision)}° ${latHem}, ${Math.abs(safeLng).toFixed(precision)}° ${lngHem}`;
}

export function formatDistance(km: number, unit: 'km' | 'mi' = 'km'): string {
  const safeKm = Number.isFinite(km) ? Math.max(0, km) : 0;
  if (unit === 'mi') {
    return `${(safeKm * 0.621371).toFixed(1)} mi`;
  }
  return `${safeKm.toFixed(1)} km`;
}

export function formatSpeed(kmh: number, unit: 'km' | 'mi' = 'km'): string {
  const safeKmh = Number.isFinite(kmh) ? Math.max(0, kmh) : 0;
  if (unit === 'mi') {
    return `${Math.round(safeKmh * 0.621371)} MPH`;
  }
  return `${Math.round(safeKmh)} KM/H`;
}

/**
 * Converts a YYYY-MM-DD (or natural date) + optional time slot ("02:00 PM - 04:00 PM")
 * into a guaranteed-future ISO-8601 timestamp string for PATCH /bookings/:id/reschedule.
 */
export function buildScheduledStartIso(dateInput: string, slotText?: string): string {
  const trimmed = (dateInput || '').trim();
  // If already a valid ISO timestamp with time component, preserve if in future
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      if (parsed > Date.now() + 60_000) return new Date(parsed).toISOString();
      return new Date(Date.now() + 15 * 60_000).toISOString();
    }
  }

  let baseDate: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    baseDate = new Date(y, m - 1, d, 9, 0, 0, 0);
  } else {
    const parsed = Date.parse(trimmed);
    baseDate = Number.isNaN(parsed) ? new Date() : new Date(parsed);
  }

  if (slotText) {
    const firstPart = slotText.split('-')[0]?.trim() || '';
    const m = firstPart.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (m) {
      let hours = parseInt(m[1], 10);
      const mins = parseInt(m[2], 10);
      const ampm = m[3]?.toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      baseDate.setHours(hours, mins, 0, 0);
    }
  }

  if (baseDate.getTime() <= Date.now() + 60_000) {
    return new Date(Date.now() + 30 * 60_000).toISOString();
  }
  return baseDate.toISOString();
}
