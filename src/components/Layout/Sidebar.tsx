import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCog, Activity, ChevronLeft,
  ChevronRight, LogOut, Shield, UserCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const Sidebar: React.FC<{ collapsed: boolean; onToggle: () => void }> = ({ collapsed, onToggle }) => {
  const { userRole, logout, userProfile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const NavItem = ({
    to, icon: Icon, label,
  }: { to: string; icon: React.ElementType; label: string }) => (
    <NavLink
      to={to}
      className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
      title={collapsed ? label : undefined}
    >
      <Icon className="link-icon" size={18} />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Shield size={18} />
        </div>
        {!collapsed && <span className="sidebar-logo-text">VN CRM</span>}
      </div>

      {/* Toggle button */}
      <button className="sidebar-toggle" onClick={onToggle} aria-label="Toggle sidebar">
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Nav */}
      <nav className="sidebar-nav">
        {!collapsed && <span className="sidebar-section-label">Main</span>}
        <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
        <NavItem to="/clients" icon={Users} label="Clients" />

        {userRole === 'admin' && (
          <>
            {!collapsed && <span className="sidebar-section-label" style={{ marginTop: 'var(--space-3)' }}>Admin</span>}
            <NavItem to="/admin/agents" icon={UserCheck} label="Agents" />
            <NavItem to="/admin/admins" icon={UserCog} label="Admins" />
            <NavItem to="/admin/activity" icon={Activity} label="Activity Logs" />
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {!collapsed && userProfile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: 'var(--space-3)', marginBottom: 'var(--space-2)',
          }}>
            <div className="avatar avatar-sm">
              {userProfile.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div className="text-sm font-semibold truncate">{userProfile.name}</div>
              <div className="text-xs text-muted truncate">{userProfile.role}</div>
            </div>
          </div>
        )}
        <button
          className="sidebar-link"
          onClick={handleLogout}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="link-icon" size={18} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
