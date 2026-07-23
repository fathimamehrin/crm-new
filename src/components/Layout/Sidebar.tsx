import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  UserCog,
  LogOut, UserCheck, Users, ClipboardList,
  Clock, DollarSign, X, MoreHorizontal, Tag, BarChart3,
  Sliders, Share2, Calendar, Package2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';

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
  badge?: number;
}

const NavItem: React.FC<NavItemProps> = ({
  to,
  icon: Icon,
  label,
  collapsed,
  onCloseMobile,
  className = '',
  badge,
}) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showFloatingBadge = badge !== undefined && badge > 0 && collapsed && !isMobile;
  const showTextCount = badge !== undefined && badge > 0 && (!collapsed || isMobile);

  return (
    <NavLink
      to={to}
      className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''} ${className}`}
      title={collapsed ? label : undefined}
      onClick={onCloseMobile}
      style={{ position: 'relative' }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Icon className="link-icon" size={20} />
        {showFloatingBadge && (
          <span style={{
            position: 'absolute',
            top: -6,
            right: -8,
            background: 'var(--color-accent, #2563eb)',
            color: '#ffffff',
            borderRadius: '100px',
            fontSize: '9px',
            fontWeight: 800,
            padding: '1px 5px',
            minWidth: '14px',
            textAlign: 'center',
            lineHeight: '11px',
            boxShadow: '0 0 0 1.5px rgba(255, 255, 255, 0.25)',
          }}>
            {badge}
          </span>
        )}
      </div>
      <span className="link-text">
        {label} {showTextCount ? `(${badge})` : ''}
      </span>
    </NavLink>
  );
};

const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  mobileOpen,
  onCloseMobile,
}) => {
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const [showMore, setShowMore] = useState(false);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Listen to pending tasks
  useEffect(() => {
    if (!db || !currentUser) return;
    let q;
    if (userRole === 'admin') {
      q = query(
        collection(db, 'tasks'),
        where('status', 'in', ['pending_acceptance', 'accepted', 'pending_reassignment', 'completed'])
      );
    } else {
      q = query(
        collection(db, 'tasks'),
        where('assignedTo', '==', currentUser.uid),
        where('status', 'in', ['pending_acceptance', 'accepted', 'pending_reassignment'])
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      setPendingTasksCount(snap.size);
    });

    return () => unsub();
  }, [currentUser, userRole]);

  // Listen to pending requests
  useEffect(() => {
    if (!db || !currentUser || userRole !== 'admin') return;
    
    const q1 = query(collection(db, 'editRequests'), where('status', '==', 'pending'));
    const q2 = query(collection(db, 'clientEditRequests'), where('status', '==', 'pending'));

    let count1 = 0;
    let count2 = 0;

    const unsub1 = onSnapshot(q1, (snap) => {
      count1 = snap.size;
      setPendingRequestsCount(count1 + count2);
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      count2 = snap.size;
      setPendingRequestsCount(count1 + count2);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [currentUser, userRole]);

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
                <NavItem to="/admin/packages" icon={Package2} label="Packages" collapsed={collapsed} onCloseMobile={onCloseMobile} className="desktop-only-nav" />
                <NavItem to="/admin/requests" icon={ClipboardList} label="Edit Requests" collapsed={collapsed} onCloseMobile={onCloseMobile} badge={pendingRequestsCount} />
                <NavItem to="/tasks" icon={ClipboardList} label="Tasks" collapsed={collapsed} onCloseMobile={onCloseMobile} badge={pendingTasksCount} />
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
            {userRole === 'agent' && (
              <>
                <NavItem to="/clients" icon={Users} label="Clients" collapsed={collapsed} onCloseMobile={onCloseMobile} />
                <NavItem to="/tasks" icon={ClipboardList} label="Tasks" collapsed={collapsed} onCloseMobile={onCloseMobile} badge={pendingTasksCount} />
                <NavItem to="/packages" icon={Package2} label="Packages" collapsed={collapsed} onCloseMobile={onCloseMobile} />
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
                <span>Calendar</span>
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
                to="/admin/statuses" 
                className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setShowMore(false)}
              >
                <Sliders size={18} />
                <span>Status Management</span>
              </NavLink>

              <NavLink 
                to="/admin/sources" 
                className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setShowMore(false)}
              >
                <Share2 size={18} />
                <span>Lead Source Management</span>
              </NavLink>

              <NavLink 
                to="/admin/packages" 
                className={({ isActive }) => `mobile-drawer-link ${isActive ? 'active' : ''}`}
                onClick={() => setShowMore(false)}
              >
                <Package2 size={18} />
                <span>Packages</span>
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
