import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import AppLayout from '../components/Layout/AppLayout';
import AdminLayout from '../components/Layout/AdminLayout';
import ProtectedRoute from '../components/ProtectedRoute';

// Pages
import LoginPage from '../pages/LoginPage';
import DashboardPage from '../pages/DashboardPage';
import NewClientFormPage from '../pages/NewClientFormPage';
import ClientDetailsPage from '../pages/ClientDetailsPage';
import AddSummaryPage from '../pages/AddSummaryPage';
import AdminManagementPage from '../pages/admin/AdminManagementPage';
import AgentManagementPage from '../pages/admin/AgentManagementPage';
import AgentDetailsPage from '../pages/admin/AgentDetailsPage';
import ActivityLogPage from '../pages/admin/ActivityLogPage';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/clients', element: <DashboardPage /> },
          { path: '/clients/new', element: <NewClientFormPage /> },
          { path: '/clients/:id', element: <ClientDetailsPage /> },
          { path: '/clients/:id/summary', element: <AddSummaryPage /> },
          {
            element: <ProtectedRoute requiredRole="admin" />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  { path: '/admin/admins', element: <AdminManagementPage /> },
                  { path: '/admin/agents', element: <AgentManagementPage /> },
                  { path: '/admin/agents/:id', element: <AgentDetailsPage /> },
                  { path: '/admin/activity', element: <ActivityLogPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

const AppRouter: React.FC = () => <RouterProvider router={router} />;

export default AppRouter;
