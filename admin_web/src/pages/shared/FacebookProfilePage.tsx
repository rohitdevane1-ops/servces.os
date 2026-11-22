import React from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { EntityProfileView } from '../../components/profile/EntityProfileView';

export const FacebookProfilePage: React.FC = () => {
  const { activeProfileTarget } = useAdmin();
  return (
    <EntityProfileView
      entityType={activeProfileTarget.type}
      entityId={activeProfileTarget.id}
    />
  );
};
