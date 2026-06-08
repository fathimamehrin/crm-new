import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { UserCheck, UserCog, Activity, ArrowLeft } from 'lucide-react';

const AdminLayout: React.FC = () => {
  return (
    <div style={{ display: 'flex', width: '100%', minHeight: 'calc(100vh - var(--header-height))', background: 'var(--color-bg-primary)' }}>
      {/* Admin Sidebar */}
      <aside style={{
        width: 240,
        background: 'var(--color-bg-secondary)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-4)',
        gap: 'var(--space-2)',
        flexShrink: 0,
      }}>
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
            color: 'var(--color-text-secondary)',
            borderTop: '1px solid var(--color-border)',
            paddingTop: 'var(--space-4)',
            marginTop: 'var(--space-4)',
            borderRadius: 0
          }}
        >
          <ArrowLeft size={18} />
          <span>Dashboard</span>
        </NavLink>
      </aside>

      {/* Admin Content Area */}
      <main style={{ flex: 1, padding: 'var(--space-6)', overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
