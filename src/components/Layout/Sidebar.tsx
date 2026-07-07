import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  UserCog,
  LogOut, UserCheck, Users, ClipboardList,
  Clock, DollarSign, X, MoreHorizontal, Tag, BarChart3,
  Sliders, Share2, Calendar
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
  className?: string;
}

const NavItem: React.FC<NavItemProps> = ({
  to,
  icon: Icon,
  label,
  collapsed,
  onCloseMobile,
  className = '',
}) => (
  <NavLink
    to={to}
    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''} ${className}`}
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
  const [showMore, setShowMore] = useState(false);

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
                <NavItem to="/admin/clients" icon={Users} label="Clients" collapsed={collapsed} onCloseMobile={onCloseMobile} />
                <NavItem to="/admin/calendar" icon={Calendar} label="Calendar" collapsed={collapsed} onCloseMobile={onCloseMobile} />
                <NavItem to="/admin/agents" icon={UserCheck} label="Agents" collapsed={collapsed} onCloseMobile={onCloseMobile} className="desktop-only-nav" />
                <NavItem to="/admin/admins" icon={UserCog} label="Admins" collapsed={collapsed} onCloseMobile={onCloseMobile} className="desktop-only-nav" />
                <NavItem to="/admin/tags" icon={Tag} label="Tags" collapsed={collapsed} onCloseMobile={onCloseMobile} className="desktop-only-nav" />
                <NavItem to="/admin/statuses" icon={Sliders} label="Statuses" collapsed={collapsed} onCloseMobile={onCloseMobile} className="desktop-only-nav" />
                <NavItem to="/admin/sources" icon={Share2} label="Lead Sources" collapsed={collapsed} onCloseMobile={onCloseMobile} className="desktop-only-nav" />
                <NavItem to="/admin/requests" icon={ClipboardList} label="Edit Requests" collapsed={collapsed} onCloseMobile={onCloseMobile} />
                <NavItem to="/tasks" icon={ClipboardList} label="Tasks" collapsed={collapsed} onCloseMobile={onCloseMobile} />
                <NavItem to="/admin/revenue" icon={DollarSign} label="Revenue Analytics" collapsed={collapsed} onCloseMobile={onCloseMobile} />
                <NavItem to="/admin/analytics" icon={BarChart3} label="Lead Analytics" collapsed={collapsed} onCloseMobile={onCloseMobile} className="desktop-only-nav" />
                <NavItem to="/admin/duration" icon={Clock} label="Staff Durations" collapsed={collapsed} onCloseMobile={onCloseMobile} className="desktop-only-nav" />
                
                {/* More button visible on mobile bottom nav only */}
                <button
                  type="button"
                  className="sidebar-link mobile-only-nav"
                  onClick={() => setShowMore(true)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', width: 'auto', margin: 0 }}
                  title="More Options"
                >
                  <MoreHorizontal className="link-icon" size={20} />
                  <span className="link-text">More</span>
                </button>
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

      {/* Mobile bottom drawer overlay */}
      {showMore && (
        <div className="mobile-drawer-overlay" onClick={() => setShowMore(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <span className="mobile-drawer-title">More Options</span>
              <button type="button" className="mobile-drawer-close" onClick={() => setShowMore(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="mobile-drawer-body">
              <NavLink 
                to="/admin/calendar" 
                className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setShowMore(false)}
              >
                <Calendar size={18} />
                <span>Lead Calendar</span>
              </NavLink>

              <NavLink 
                to="/admin/agents" 
                className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setShowMore(false)}
              >
                <UserCheck size={18} />
                <span>Agent Management</span>
              </NavLink>
              
              <NavLink 
                to="/admin/admins" 
                className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setShowMore(false)}
              >
                <UserCog size={18} />
                <span>Admin Management</span>
              </NavLink>

              <NavLink 
                to="/admin/tags" 
                className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setShowMore(false)}
              >
                <Tag size={18} />
                <span>Tag Management</span>
              </NavLink>
              
              <NavLink 
                to="/admin/duration" 
                className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setShowMore(false)}
              >
                <Clock size={18} />
                <span>Staff Durations</span>
              </NavLink>

              <NavLink 
                to="/admin/analytics" 
                className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setShowMore(false)}
              >
                <BarChart3 size={18} />
                <span>Lead Analytics</span>
              </NavLink>
              
              <button 
                type="button"
                className="mobile-drawer-link logout" 
                onClick={() => {
                  setShowMore(false);
                  handleLogout();
                }}
              >
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
