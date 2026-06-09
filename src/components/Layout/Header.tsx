import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, Menu, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import NotificationPanel from '../NotificationPanel';
import { useNotifications } from '../../hooks/useNotifications';

interface HeaderProps {
  onMenuClick: () => void;
  pageTitle?: string;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, pageTitle }) => {
  const { userProfile, userRole, logout } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const roleColor = userRole === 'admin' ? 'var(--color-accent)' : 'var(--color-success)';
  const roleLabel = userRole === 'admin' ? 'Admin' : 'Agent';

  return (
    <header className="app-header">
      {/* Mobile menu toggle */}
      <button className="btn btn-ghost btn-icon" onClick={onMenuClick} style={{ display: 'none' }}
        id="mobile-menu-btn">
        <Menu size={20} />
      </button>

      {pageTitle && (
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {pageTitle}
        </h1>
      )}

      <div style={{ flex: 1 }} />

      {/* Notification bell */}
      <div className="dropdown" ref={notifRef}>
        <button
          className="btn btn-ghost btn-icon"
          style={{ position: 'relative' }}
          onClick={() => {
            setShowNotifications((v) => !v);
            if (!showNotifications) markAllRead();
          }}
          aria-label="Notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 4,
              width: 18, height: 18,
              background: 'var(--color-danger)',
              borderRadius: '50%',
              fontSize: '0.625rem',
              fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
              border: '2px solid var(--color-bg-secondary)',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        {showNotifications && (
          <NotificationPanel
            notifications={notifications}
            onClose={() => setShowNotifications(false)}
          />
        )}
      </div>

      {/* User badge */}
      {userProfile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
          {userRole === 'admin' && !isAdminPage && (
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
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
              <span className="text-sm font-semibold">{userProfile.name}</span>
              <span style={{ fontSize: '0.7rem', color: roleColor, fontWeight: 600, textTransform: 'uppercase' }}>
                {roleLabel}
              </span>
            </div>
            <div className="avatar avatar-md" style={{ cursor: 'default' }}>
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

