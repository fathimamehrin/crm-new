import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
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
import TasksPage from '../pages/TasksPage';
import AdminCalendarPage from '../pages/admin/AdminCalendarPage';
import AdminStatusesPage from '../pages/admin/AdminStatusesPage';
import AdminSourcesPage from '../pages/admin/AdminSourcesPage';
import AdminPackagesPage from '../pages/admin/AdminPackagesPage';

// Root layout: wraps the entire router tree inside AuthProvider so every
// page — including /login — has access to useAuth().
const AuthRoot: React.FC = () => (
  <AuthProvider>
    <Outlet />
  </AuthProvider>
);

const router = createBrowserRouter([
  {
    element: <AuthRoot />,
    children: [
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
          { path: '/tasks', element: <TasksPage /> },
          { path: '/packages', element: <AdminPackagesPage /> },
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
                  { path: '/admin/calendar', element: <AdminCalendarPage /> },
                  { path: '/admin/tags', element: <AdminTagsPage /> },
                  { path: '/admin/statuses', element: <AdminStatusesPage /> },
                  { path: '/admin/sources', element: <AdminSourcesPage /> },

                  { path: '/admin/duration', element: <StaffDurationPage /> },
                  { path: '/admin/revenue', element: <RevenueAnalyticsPage /> },
                  { path: '/admin/analytics', element: <LeadAnalyticsPage /> },
                  { path: '/admin/packages', element: <AdminPackagesPage /> },
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
    ]
  }
]);

const AppRouter: React.FC = () => <RouterProvider router={router} />;

export default AppRouter;
