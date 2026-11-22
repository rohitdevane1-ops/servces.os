import React, { useState, useEffect, useRef } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { apiClient } from '../../services/apiClient';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Star, 
  Calendar, 
  FileText, 
  Camera, 
  Edit3, 
  CheckCircle2, 
  Truck,
  Award,
  Activity
} from 'lucide-react';

export interface EntityProfileViewProps {
  entityType: 'customer' | 'technician' | 'staff' | 'admin';
  entityId?: string;
}

function isRealImageUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/api/v1/uploads/') ||
    trimmed.startsWith('data:image/')
  );
}

export const EntityProfileView: React.FC<EntityProfileViewProps> = ({
  entityType,
  entityId
}) => {
  const {
    customers,
    technicians,
    staffMembers,
    userProfile,
    bookings,
    invoices,
    reviews,
    auditLogs,
    selectedCustomerId,
    selectedTechnicianId,
    activeProfileTarget,
    navigateToPage,
    openUniversalEditModal,
    openSMSModal,
    formatCurrency,
    updateCustomer,
    updateTechnician,
    updateUserProfile,
    addToast
  } = useAdmin();

  const resolvedType = entityType || activeProfileTarget.type || 'admin';
  const resolvedId =
    entityId ||
    activeProfileTarget.id ||
    (resolvedType === 'customer'
      ? selectedCustomerId || customers[0]?.id
      : resolvedType === 'technician'
      ? selectedTechnicianId || technicians[0]?.id
      : staffMembers[0]?.id);

  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'invoices' | 'reviews' | 'audit'>('overview');
  const [customerAddresses, setCustomerAddresses] = useState<Array<{ id: string; label?: string; addressLine1?: string; city?: string }>>([]);
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [uploadingField, setUploadingField] = useState<'avatar' | 'cover' | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const customer = resolvedType === 'customer' ? (customers.find(c => c.id === resolvedId) || customers[0]) : undefined;
  const technician = resolvedType === 'technician' ? (technicians.find(t => t.id === resolvedId) || technicians[0]) : undefined;
  const staff = resolvedType === 'staff' ? (staffMembers.find(s => s.id === resolvedId) || staffMembers[0]) : undefined;

  useEffect(() => {
    let active = true;
    if (resolvedType === 'customer' && customer?.id) {
      apiClient.getCustomer(customer.id).then(res => {
        if (!active || !res.success || !res.data) return;
        const data = res.data as Record<string, unknown>;
        const addrs = Array.isArray(data.addresses) ? data.addresses : [];
        setCustomerAddresses(
          addrs.map((a: Record<string, unknown>) => ({
            id: String(a.id || ''),
            label: String(a.label || 'Primary Address'),
            addressLine1: String(a.addressLine1 || a.address_line1 || ''),
            city: String(a.city || '')
          }))
        );
      }).catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [resolvedType, customer?.id]);

  const displayName =
    resolvedType === 'customer'
      ? customer?.name || 'Customer Record'
      : resolvedType === 'technician'
      ? technician?.name || 'Technician Record'
      : resolvedType === 'staff'
      ? staff?.name || userProfile.name
      : userProfile.name;

  const displayEmail =
    resolvedType === 'customer'
      ? customer?.email || ''
      : resolvedType === 'technician'
      ? technician?.email || ''
      : resolvedType === 'staff'
      ? staff?.email || userProfile.email
      : userProfile.email;

  const displayPhone =
    resolvedType === 'customer'
      ? customer?.phone || ''
      : resolvedType === 'technician'
      ? technician?.phone || ''
      : resolvedType === 'staff'
      ? staff?.phone || userProfile.phone
      : userProfile.phone;

  const displaySubtitle =
    resolvedType === 'customer'
      ? `${customer?.city || 'Service Area'} â€¢ ${customer?.status || 'Active'}`
      : resolvedType === 'technician'
      ? `${technician?.specialization || 'Field Specialist'} â€¢ ${technician?.status || 'Available'}`
      : resolvedType === 'staff'
      ? `${staff?.role || 'Operations Coordinator'} â€¢ ${staff?.department || 'Dispatch Hub'}`
      : `${userProfile.title} â€¢ ${userProfile.department}`;

  const avatarUrl =
    resolvedType === 'customer'
      ? customer?.photo
      : resolvedType === 'technician'
      ? technician?.photo
      : resolvedType === 'staff'
      ? staff?.photo || userProfile.avatar
      : userProfile.avatar;

  // Strictly scope bookings and invoices to the viewed entity
  const scopedBookings = bookings.filter(b => {
    if (resolvedType === 'customer' && customer) {
      return (
        (b.customerId && b.customerId === customer.id) ||
        b.customerName.toLowerCase() === customer.name.toLowerCase()
      );
    }
    if (resolvedType === 'technician' && technician) {
      return (
        b.technicianId === technician.id ||
        b.technicianName.toLowerCase() === technician.name.toLowerCase()
      );
    }
    return true;
  });

  const scopedBookingIds = new Set(scopedBookings.map(b => b.id));
  const scopedJobNos = new Set(scopedBookings.map(b => b.jobNo));

  const scopedInvoices = invoices.filter(inv => {
    if (resolvedType === 'customer' && customer) {
      return (
        (inv.customerId && inv.customerId === customer.id) ||
        (inv.bookingId && (scopedBookingIds.has(inv.bookingId) || scopedJobNos.has(inv.bookingId))) ||
        inv.customerName.toLowerCase() === customer.name.toLowerCase()
      );
    }
    if (resolvedType === 'technician') {
      return Boolean(inv.bookingId && (scopedBookingIds.has(inv.bookingId) || scopedJobNos.has(inv.bookingId)));
    }
    return true;
  });

  const scopedReviews = reviews.filter(r => {
    if (resolvedType === 'customer' && customer) {
      return r.customerName.toLowerCase() === customer.name.toLowerCase();
    }
    if (resolvedType === 'technician' && technician) {
      return (r.providerName || '').toLowerCase() === technician.name.toLowerCase();
    }
    return true;
  });

  const handlePhotoUpload = async (field: 'avatar' | 'cover', file?: File) => {
    if (!file) return;
    setUploadingField(field);
    const res = await apiClient.uploadFile(file);
    setUploadingField(null);

    if (!res.success || !res.data?.url) {
      addToast(res.error?.message || 'Failed to upload image', 'error');
      return;
    }

    const signedUrl = res.data.url;
    if (field === 'cover') {
      setCoverUrl(signedUrl);
      addToast('Cover photo uploaded', 'success');
      return;
    }

    if (resolvedType === 'customer' && customer) {
      await updateCustomer(customer.id, { photo: signedUrl });
    } else if (resolvedType === 'technician' && technician) {
      await updateTechnician(technician.id, { photo: signedUrl });
    } else {
      updateUserProfile({ avatar: signedUrl });
    }
    addToast('Profile image uploaded and signed URL saved', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() =>
            navigateToPage(
              resolvedType === 'customer' ? 18 : resolvedType === 'technician' ? 22 : 1
            )
          }
          className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-2 shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>
            Back to {resolvedType === 'customer' ? 'Customer Directory' : resolvedType === 'technician' ? 'Technician Fleet' : 'Dashboard'}
          </span>
        </button>

        <div className="flex items-center gap-2">
          {displayPhone && (
            <button
              onClick={() =>
                openSMSModal({
                  name: displayName,
                  phone: displayPhone,
                  role: resolvedType.toUpperCase(),
                  type: resolvedType === 'admin' ? 'staff' : resolvedType
                })
              }
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Direct SMS</span>
            </button>
          )}
          <button
            onClick={() => openUniversalEditModal({ type: resolvedType, id: resolvedId })}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Dossier</span>
          </button>
        </div>
      </div>

      {/* Cover Banner & Identity Header */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="relative h-44 w-full bg-gradient-to-r from-[#0C3832] via-[#134E45] to-emerald-800">
          {isRealImageUrl(coverUrl) ? (
            <img
              src={coverUrl}
              alt={`${displayName} cover`}
              className="w-full h-full object-cover"
            />
          ) : coverUrl && coverUrl.startsWith('linear-gradient') ? (
            <div className="w-full h-full" style={{ background: coverUrl }} />
          ) : null}

          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={e => handlePhotoUpload('cover', e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingField === 'cover'}
            className="absolute bottom-3 right-4 px-3 py-1.5 bg-slate-900/75 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 backdrop-blur-xs cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{uploadingField === 'cover' ? 'Uploading...' : 'Change Cover'}</span>
          </button>
        </div>

        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 relative z-10">
            <div className="flex items-end gap-4">
              <div className="relative">
                {isRealImageUrl(avatarUrl) ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-24 h-24 rounded-2xl object-cover ring-4 ring-white shadow-md bg-white"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-emerald-700 text-white font-black text-3xl flex items-center justify-center ring-4 ring-white shadow-md">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => handlePhotoUpload('avatar', e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingField === 'avatar'}
                  className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-slate-900 text-white hover:bg-emerald-600 shadow-xs cursor-pointer"
                  title="Upload new profile photo"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-black text-slate-900">{displayName}</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {resolvedType}
                  </span>
                  {resolvedType === 'technician' && technician?.isVerified !== false && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Verified Pro
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{displaySubtitle}</p>
              </div>
            </div>

            {/* Key KPI Strip */}
            <div className="flex items-center gap-3 flex-wrap">
              {resolvedType === 'customer' && customer && (
                <>
                  <div className="px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Lifetime Spend</span>
                    <span className="text-sm font-black text-emerald-700">{formatCurrency(customer.lifetimeSpend)}</span>
                  </div>
                  <div className="px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Orders</span>
                    <span className="text-sm font-black text-slate-900">{customer.totalBookings}</span>
                  </div>
                  <div className="px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Rating</span>
                    <span className="text-sm font-black text-amber-600">â˜… {customer.rating}</span>
                  </div>
                </>
              )}

              {resolvedType === 'technician' && technician && (
                <>
                  <div className="px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Completed</span>
                    <span className="text-sm font-black text-slate-900">{technician.jobsCompleted} Jobs</span>
                  </div>
                  <div className="px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Hourly Rate</span>
                    <span className="text-sm font-black text-emerald-700">{formatCurrency(technician.hourlyRate || 85)}/hr</span>
                  </div>
                  <div className="px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200/80 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Rating</span>
                    <span className="text-sm font-black text-amber-600">â˜… {technician.rating}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sub-navigation Tabs */}
          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100 overflow-x-auto">
            {(['overview', 'bookings', 'invoices', 'reviews', 'audit'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                  activeTab === tab
                    ? 'bg-[#0C3832] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab === 'bookings'
                  ? `Bookings (${scopedBookings.length})`
                  : tab === 'invoices'
                  ? `Invoices (${scopedInvoices.length})`
                  : tab === 'reviews'
                  ? `Reviews (${scopedReviews.length})`
                  : tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" />
              <span>Contact &amp; Verification Details</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Email Address</span>
                  <span className="font-mono font-bold text-slate-800">{displayEmail || 'Not provided'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Phone Number</span>
                  <span className="font-mono font-bold text-slate-800">{displayPhone || 'Not provided'}</span>
                </div>
              </div>

              {resolvedType === 'customer' && customer && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-400 block">Registered Service Address</span>
                    <span className="font-bold text-slate-800">{customer.address || customer.city || 'No address on file'}</span>
                  </div>
                </div>
              )}

              {resolvedType === 'technician' && technician && (
                <>
                  <div className="flex items-center gap-2.5">
                    <Award className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block">Trade License &amp; Hourly Rate</span>
                      <span className="font-bold text-slate-800">
                        {technician.licenseNumber || 'Verified Trade Credential'} â€¢ {formatCurrency(technician.hourlyRate || 85)}/hr
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block">Assigned Fleet Vehicle</span>
                      <span className="font-bold text-slate-800">
                        {technician.vehicleMakeModel || 'Service Fleet Vehicle'}{' '}
                        {technician.vehicleLicensePlate ? `(${technician.vehicleLicensePlate})` : ''}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Recent Service Orders ({scopedBookings.length})</span>
            </h2>

            {scopedBookings.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No service bookings recorded for this profile yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {scopedBookings.slice(0, 6).map(b => (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{b.jobNo} â€¢ {b.serviceName}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Customer: {b.customerName} â€¢ Tech: {b.technicianName} â€¢ {b.scheduleDate} {b.scheduleTime}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-slate-900 block">{formatCurrency(b.estimate)}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {b.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {resolvedType === 'customer' && customerAddresses.length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
                  Saved Property Locations ({customerAddresses.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {customerAddresses.map(addr => (
                    <div key={addr.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
                      <div className="font-bold text-slate-900">{addr.label}</div>
                      <div className="text-slate-600 text-[11px] mt-0.5">
                        {[addr.addressLine1, addr.city].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <h2 className="text-sm font-extrabold text-slate-900">Complete Booking History ({scopedBookings.length})</h2>
          {scopedBookings.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No bookings found for this record.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {scopedBookings.map(b => (
                <div key={b.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900">{b.jobNo} â€” {b.serviceName}</div>
                    <div className="text-slate-500 text-[11px]">
                      {b.customerAddress} â€¢ {b.scheduleDate} at {b.scheduleTime}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-slate-900">{formatCurrency(b.estimate)}</div>
                    <div className="text-[10px] font-bold text-emerald-700">{b.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>Scoped Invoices ({scopedInvoices.length})</span>
          </h2>
          {scopedInvoices.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No invoices linked to this profile.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {scopedInvoices.map(inv => (
                <div key={inv.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900">{inv.invoiceNo || inv.id} â€¢ {inv.serviceName}</div>
                    <div className="text-slate-500 text-[11px]">
                      Issued: {inv.date} {inv.bookingReference ? `â€¢ Ref: ${inv.bookingReference}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-slate-900">{formatCurrency(inv.amount)}</div>
                    <div className="text-[10px] font-bold text-emerald-700">{inv.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" />
            <span>Verified Customer Feedback ({scopedReviews.length})</span>
          </h2>
          {scopedReviews.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No verified reviews logged for this profile yet.</p>
          ) : (
            <div className="space-y-3">
              {scopedReviews.map(rev => (
                <div key={rev.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      {rev.customerName} {rev.providerName ? `â†’ ${rev.providerName}` : ''}
                    </span>
                    <span className="font-black text-amber-600">â˜… {rev.rating}</span>
                  </div>
                  <p className="text-slate-700">{rev.comment}</p>
                  <div className="text-[10px] text-slate-400">{rev.serviceName} â€¢ {rev.date}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>Recent Audit Trail</span>
          </h2>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No audit events recorded in current session.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditLogs.slice(0, 15).map(log => (
                <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{log.action}</span>
                    <span className="text-slate-500 ml-2">{log.details}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{log.timestamp}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
