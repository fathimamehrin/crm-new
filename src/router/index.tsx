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
import AdminClientsPage from '../pages/admin/AdminClientsPage';
import EditRequestsPage from '../pages/admin/EditRequestsPage';
import AdminTagsPage from '../pages/admin/AdminTagsPage';

import StaffDurationPage from '../pages/admin/StaffDurationPage';
import RevenueAnalyticsPage from '../pages/admin/RevenueAnalyticsPage';
import LeadAnalyticsPage from '../pages/admin/LeadAnalyticsPage';

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
                  { path: '/admin/clients', element: <AdminClientsPage /> },
                  { path: '/admin/clients/:id', element: <ClientDetailsPage /> },
                  { path: '/admin/clients/:id/summary', element: <AddSummaryPage /> },
                  { path: '/admin/requests', element: <EditRequestsPage /> },
                  { path: '/admin/tags', element: <AdminTagsPage /> },

                  { path: '/admin/duration', element: <StaffDurationPage /> },
                  { path: '/admin/revenue', element: <RevenueAnalyticsPage /> },
                  { path: '/admin/analytics', element: <LeadAnalyticsPage /> },
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
