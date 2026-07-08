import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Settings, Menu, ClipboardList } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import logo from '../../assets/logo.png';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface HeaderProps {
  onMenuClick: () => void;
  pageTitle?: string;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, pageTitle }) => {
  const { currentUser, userProfile, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');
  const isTasksPage = location.pathname === '/tasks';

  const [isScrolled, setIsScrolled] = useState(false);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);


  // Listen to pending tasks for agents
  useEffect(() => {
    if (!db || !currentUser || userRole !== 'agent') return;
    const q = query(
      collection(db, 'tasks'),
      where('assignedTo', '==', currentUser.uid),
      where('status', 'in', ['pending_acceptance', 'accepted', 'pending_reassignment'])
    );

    const unsub = onSnapshot(q, (snap) => {
      setPendingTasksCount(snap.size);
    });

    return () => unsub();
  }, [currentUser, userRole]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const roleColor = userRole === 'admin' ? 'var(--color-accent)' : 'var(--color-success)';
  const roleLabel = userRole === 'admin' ? 'Admin' : 'Agent';

  return (
    <header className={`app-header ${isScrolled ? 'scrolled' : ''}`}>
      {/* Menu Toggle Button for Desktop */}
      {userRole === 'admin' && (
        <button
          className="btn btn-ghost btn-icon menu-toggle-btn desktop-only"
          onClick={onMenuClick}
          style={{ marginRight: '8px' }}
          aria-label="Toggle Sidebar"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Logo */}
      <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img 
          src={logo} 
          alt="VN CRM Logo" 
          style={{ width: 48, height: 48, objectFit: 'contain' }} 
        />
        <span className="desktop-only" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Venture Navigator
        </span>  
      </div>

      {pageTitle && (
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {pageTitle}
        </h1>
      )}

      <div style={{ flex: 1 }} />



      {/* User badge */}
      {userProfile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          {userRole === 'agent' && (
            <button
              onClick={() => navigate('/tasks')}
              className={`btn btn-secondary btn-sm ${location.pathname === '/tasks' ? 'btn-primary' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <ClipboardList size={15} />
              <span>Tasks {pendingTasksCount > 0 ? `(${pendingTasksCount})` : ''}</span>
            </button>
          )}

          {userRole === 'admin' && !isAdminPage && !isTasksPage && (
            <button
              onClick={() => navigate('/admin/agents')}
              className="btn btn-primary btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <Settings size={16} />
              <span>Admin Panel</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div className="header-user-info" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
              <span className="text-xs font-semibold">{userProfile.name}</span>
              <span style={{ fontSize: '0.7rem', color: roleColor, fontWeight: 600, textTransform: 'uppercase' }}>
                {roleLabel}
              </span>
            </div>
            <div className="avatar avatar-sm" style={{ cursor: 'default' }}>
              {userProfile.name.charAt(0).toUpperCase()}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={logout}
            title="Logout"
            style={{ color: 'var(--color-danger)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)' }}
            aria-label="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </header>
  );
};

export default Header;

