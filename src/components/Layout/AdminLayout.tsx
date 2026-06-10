import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { UserCheck, UserCog, Activity, ArrowLeft, Menu } from 'lucide-react';

const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-layout-container">
      {/* Admin Sidebar Backdrop Overlay for Mobile */}
      {sidebarOpen && (
        <div 
          className="admin-sidebar-overlay" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Admin Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ 
          fontSize: 'var(--font-size-xs)', 
          fontWeight: 700, 
          color: 'var(--color-text-muted)', 
          textTransform: 'uppercase', 
          padding: '0 var(--space-3)', 
          marginBottom: 'var(--space-3)',
          letterSpacing: '0.05em'
        }}>
          Admin Control
        </div>
        
        <NavLink
          to="/admin/agents"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          onClick={() => setSidebarOpen(false)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 'var(--space-3)', 
            padding: '0.75rem var(--space-4)', 
            borderRadius: 'var(--radius-md)', 
            fontSize: 'var(--font-size-sm)', 
            fontWeight: 500 
          }}
        >
          <UserCheck size={18} />
          <span>Agents</span>
        </NavLink>

        <NavLink
          to="/admin/admins"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          onClick={() => setSidebarOpen(false)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 'var(--space-3)', 
            padding: '0.75rem var(--space-4)', 
            borderRadius: 'var(--radius-md)', 
            fontSize: 'var(--font-size-sm)', 
            fontWeight: 500 
          }}
        >
          <UserCog size={18} />
          <span>Admins</span>
        </NavLink>

        <NavLink
          to="/admin/activity"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          onClick={() => setSidebarOpen(false)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 'var(--space-3)', 
            padding: '0.75rem var(--space-4)', 
            borderRadius: 'var(--radius-md)', 
            fontSize: 'var(--font-size-sm)', 
            fontWeight: 500 
          }}
        >
          <Activity size={18} />
          <span>Activity Logs</span>
        </NavLink>

        <div style={{ flex: 1 }} />

        <NavLink
          to="/"
          className="sidebar-link"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 'var(--space-3)', 
            padding: '0.75rem var(--space-4)', 
            borderRadius: 'var(--radius-md)', 
            fontSize: 'var(--font-size-sm)', 
            fontWeight: 500,
            color: 'var(--color-danger)',
            marginTop: 'auto'
          }}
        >
          <ArrowLeft size={18} />
          <span>Exit Admin</span>
        </NavLink>
      </aside>

      {/* Admin Content Area */}
      <main className="admin-main">
        {/* Mobile menu toggle bar */}
        <div className="admin-mobile-toggle">
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => setSidebarOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Menu size={16} /> Admin Menu
          </button>
        </div>

        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
