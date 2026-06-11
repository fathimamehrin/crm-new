import React from 'react';
import { Outlet } from 'react-router-dom';

const AdminLayout: React.FC = () => {
  return (
    <>
      <Outlet />
    </>
  );
};

export default AdminLayout;
