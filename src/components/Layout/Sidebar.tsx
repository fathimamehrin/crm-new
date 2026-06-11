import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  UserCog, Activity, Menu,
  LogOut, UserCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';


interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, mobileOpen, onCloseMobile }) => {
  const { userRole, logout } = useAuth();
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
      onClick={onCloseMobile}
    >
      <Icon className="link-icon" size={20} />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );

  return (
    <>
      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="admin-sidebar-overlay"
          style={{ display: 'block', zIndex: 140 }}
          onClick={onCloseMobile}
        />
      )}

      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>

        {/* Toggle button at top */}
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px ' }}>
          <button className="sidebar-toggle" onClick={() => mobileOpen ? onCloseMobile?.() : onToggle()} aria-label="Toggle sidebar">
            <Menu size={20} />
          </button>
          {!collapsed && (
            <span style={{
              fontWeight: 600,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              fontSize: '1rem',
              opacity: 0.9
            }}>
              Admin Control
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">


          {userRole === 'admin' && (
            <>
              <NavItem to="/admin/agents" icon={UserCheck} label="Agents" />
              <NavItem to="/admin/admins" icon={UserCog} label="Admins" />
              <NavItem to="/admin/activity" icon={Activity} label="Activity Logs" />
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <button
            className="sidebar-link"
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut className="link-icon" size={20} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
