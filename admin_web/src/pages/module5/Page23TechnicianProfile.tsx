import React from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { EntityProfileView } from '../../components/profile/EntityProfileView';

export const Page23TechnicianProfile: React.FC = () => {
  const { selectedTechnicianId } = useAdmin();
  return <EntityProfileView entityType="technician" entityId={selectedTechnicianId || undefined} />;
};
