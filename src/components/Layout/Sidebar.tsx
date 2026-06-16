import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  UserCog, Activity,
  LogOut, UserCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';


interface SidebarProps {
  collapsed: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  collapsed: boolean;
  onCloseMobile?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({
  to,
  icon: Icon,
  label,
  collapsed,
  onCloseMobile,
}) => (
  <NavLink
    to={to}
    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
    title={collapsed ? label : undefined}
    onClick={onCloseMobile}
  >
    <Icon className="link-icon" size={20} />
    <span className="link-text">{label}</span>
  </NavLink>
);

const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  mobileOpen,
  onCloseMobile,
}) => {
  const { userRole, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

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

      <aside
        className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      >
        <div className="sidebar-inner">
          {/* Title at top */}
          <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px ' }}>
            <span className="sidebar-title" style={{
              fontWeight: 600,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              fontSize: '1rem',
              opacity: 0.9
            }}>
              Admin Control
            </span>
          </div>

          {/* Nav */}
          <nav className="sidebar-nav">


            {userRole === 'admin' && (
              <>
                <NavItem to="/admin/agents" icon={UserCheck} label="Agents" collapsed={collapsed} onCloseMobile={onCloseMobile} />
                <NavItem to="/admin/admins" icon={UserCog} label="Admins" collapsed={collapsed} onCloseMobile={onCloseMobile} />
                <NavItem to="/admin/activity" icon={Activity} label="Activity Logs" collapsed={collapsed} onCloseMobile={onCloseMobile} />
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
              <span className="link-text">Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
