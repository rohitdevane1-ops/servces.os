import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Modal } from '../common/Modal';
import { 
  User, 
  Camera, 
  Save, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  ShieldCheck,
  Award
} from 'lucide-react';

export const EditUniversalEntityModal: React.FC = () => {
  const { 
    isUniversalEditModalOpen, 
    closeUniversalEditModal, 
    universalEditTarget,
    userProfile,
    updateUserProfile,
    customers,
    updateCustomer,
    technicians,
    updateTechnician,
    staffMembers,
    currentRole,
    tenantConfig,
    addToast
  } = useAdmin();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [titleOrTrade, setTitleOrTrade] = useState('');
  const [address, setAddress] = useState('');
  const [bioOrNotes, setBioOrNotes] = useState('');
  const [avatar, setAvatar] = useState('');
  const [status, setStatus] = useState('Active');
  const [hourlyRate, setHourlyRate] = useState<number>(85);
  const [tier, setTier] = useState('Standard');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isUniversalEditModalOpen) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;

    if (universalEditTarget.type === 'admin' || universalEditTarget.type === 'staff') {
      const isViewingSelf = universalEditTarget.type.toUpperCase() === currentRole;
      if (isViewingSelf) {
        setName(userProfile.name);
        setEmail(userProfile.email);
        setPhone(userProfile.phone);
        setTitleOrTrade(userProfile.title);
        setAddress(userProfile.territory);
        setBioOrNotes(userProfile.bio);
        setAvatar(userProfile.avatar);
        setStatus('Active');
      } else {
        const staff = staffMembers.find(s => s.id === universalEditTarget.id) || staffMembers[0];
        if (staff) {
          setName(staff.name);
          setEmail(staff.email);
          setPhone(staff.phone);
          setTitleOrTrade(staff.role);
          setAddress(staff.department || 'Operations Hub');
          setBioOrNotes(`Shift: ${staff.shiftHours || 'Day'} â€¢ Orders handled: ${staff.totalOrdersHandled || 0}`);
          setAvatar(staff.photo || '');
          setStatus(staff.status || 'Active');
        }
      }
    } else if (universalEditTarget.type === 'customer') {
      const cust = customers.find(c => c.id === universalEditTarget.id) || customers[0];
      if (cust) {
        setName(cust.name);
        setEmail(cust.email);
        setPhone(cust.phone);
        setTitleOrTrade('Registered Customer');
        setAddress(cust.address);
        setBioOrNotes(`Registered Customer â€¢ ${cust.totalBookings} orders placed`);
        setAvatar(cust.photo || '');
        setStatus(cust.status);
        setTier('Standard');
      }
    } else if (universalEditTarget.type === 'technician') {
      const tech = technicians.find(t => t.id === universalEditTarget.id) || technicians[0];
      if (tech) {
        setName(tech.name);
        setEmail(tech.email || '');
        setPhone(tech.phone);
        setTitleOrTrade(tech.specialization);
        setAddress('Field Fleet');
        setBioOrNotes(`Verified ${tech.specialization} Pro â€¢ Rating ${tech.rating}â˜… (${tech.jobsCompleted} jobs)`);
        setAvatar(tech.photo || '');
        setStatus(tech.status);
        setHourlyRate(tech.hourlyRate || 85);
      }
    }
    });
    return () => {
      active = false;
    };
  }, [isUniversalEditModalOpen, universalEditTarget, userProfile, currentRole, customers, technicians, staffMembers]);

  if (!isUniversalEditModalOpen) return null;

  const isForbiddenForStaff =
    currentRole !== 'ADMIN' &&
    (universalEditTarget.type === 'customer' ||
      universalEditTarget.type === 'technician' ||
      universalEditTarget.type === 'admin');

  if (isForbiddenForStaff) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    if (universalEditTarget.type === 'admin' || universalEditTarget.type === 'staff') {
      const isViewingSelf = universalEditTarget.type.toUpperCase() === currentRole;
      if (isViewingSelf) {
        updateUserProfile({
          name,
          email,
          phone,
          title: titleOrTrade,
          territory: address,
          bio: bioOrNotes,
          avatar
        });
      } else {
        addToast('Staff account metadata updated.', 'info');
      }
    } else if (universalEditTarget.type === 'customer') {
      const custId = universalEditTarget.id || customers[0]?.id;
      if (custId) {
        await updateCustomer(custId, {
          name,
          email,
          phone,
          address,
          photo: avatar,
          status: status === 'Suspended' ? 'Suspended' : 'Active'
        });
      }
    } else if (universalEditTarget.type === 'technician') {
      const techId = universalEditTarget.id || technicians[0]?.id;
      if (techId) {
        const mappedStatus =
          status === 'On Job' || status === 'Busy' || status === 'On Leave' || status === 'Offline'
            ? status
            : 'Available';
        await updateTechnician(techId, {
          name,
          email,
          phone,
          specialization: titleOrTrade,
          hourlyRate,
          photo: avatar,
          status: mappedStatus
        });
      }
    }

    setIsSaving(false);
    closeUniversalEditModal();
  };

  return (
    <Modal
      isOpen={isUniversalEditModalOpen}
      onClose={closeUniversalEditModal}
      title={`Edit ${universalEditTarget.type.toUpperCase()} Dossier`}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSave} className="overflow-y-auto max-h-[78vh] p-6 space-y-5">
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-emerald-600" />
            <span>Profile Photo / Avatar URL</span>
          </div>
          <div className="flex items-center gap-4">
            {avatar ? (
              <img 
                src={avatar} 
                alt="Avatar Preview" 
                className="w-14 h-14 rounded-full object-cover ring-2 ring-emerald-500/50 shadow-sm"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-lg ring-2 ring-slate-300">
                {name ? name.charAt(0).toUpperCase() : <User className="w-6 h-6 text-slate-400" />}
              </div>
            )}
            <div className="flex-1 space-y-2">
              <input 
                type="text" 
                value={avatar} 
                onChange={e => setAvatar(e.target.value)} 
                placeholder="https://example.com/photo.jpg" 
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Full Legal Name</span>
            </label>
            <input 
              type="text" 
              required 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              <span>{universalEditTarget.type === 'technician' ? 'Trade Specialization' : 'Role Title'}</span>
            </label>
            <input 
              type="text" 
              value={titleOrTrade} 
              onChange={e => setTitleOrTrade(e.target.value)} 
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>Phone Number</span>
            </label>
            <input 
              type="text" 
              required 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>Email Address</span>
            </label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>Primary Address / Dispatch Territory</span>
          </label>
          <input 
            type="text" 
            value={address} 
            onChange={e => setAddress(e.target.value)} 
            placeholder="Street address, district, city"
            className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {universalEditTarget.type === 'technician' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-slate-400" />
                <span>Standard Hourly Billing Rate ({tenantConfig.currencyCode}/hr)</span>
              </label>
              <input 
                type="number" 
                value={hourlyRate} 
                onChange={e => setHourlyRate(Number(e.target.value))} 
                className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {universalEditTarget.type === 'customer' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-slate-400" />
                <span>Customer Account Tier</span>
              </label>
              <select 
                value={tier} 
                onChange={e => setTier(e.target.value)} 
                className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="Standard">Standard Residential</option>
                <option value="VIP">VIP Priority Care</option>
                <option value="Commercial">Commercial Portfolio</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              <span>Account / Duty Status</span>
            </label>
            <select 
              value={status} 
              onChange={e => setStatus(e.target.value)} 
              className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="Active">Active &amp; Operational</option>
              <option value="Available">Available for Dispatch</option>
              <option value="On Job">On Active Job</option>
              <option value="Off Duty">Off Duty (Rest Period)</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Public Bio / Operational Notes
          </label>
          <textarea 
            rows={3}
            value={bioOrNotes}
            onChange={e => setBioOrNotes(e.target.value)}
            placeholder="Special instructions or certified work credentials..."
            className="w-full text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={closeUniversalEditModal}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save & Update Record'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
