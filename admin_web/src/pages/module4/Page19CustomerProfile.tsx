import React from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { EntityProfileView } from '../../components/profile/EntityProfileView';

export const Page19CustomerProfile: React.FC = () => {
  const { selectedCustomerId } = useAdmin();
  return <EntityProfileView entityType="customer" entityId={selectedCustomerId || undefined} />;
};
