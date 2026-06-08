import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { X, Bell } from 'lucide-react';
import type { NotificationItem } from '../hooks/useNotifications';

interface NotificationPanelProps {
  notifications: NotificationItem[];
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ notifications, onClose }) => {
  return (
    <div className="notification-panel">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-4) var(--space-5)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Bell size={16} style={{ color: 'var(--color-text-accent)' }} />
          <span className="font-semibold text-sm">Notifications</span>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ width: 28, height: 28 }}>
          <X size={14} />
        </button>
      </div>

      {notifications.length === 0 ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <Bell size={32} style={{ margin: '0 auto var(--space-3)', opacity: 0.4 }} />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {notifications.map((n) => (
            <div key={n.id} className={`notification-item ${!n.read ? 'unread' : ''}`}>
              {!n.read && <div className="notification-dot" />}
              {n.read && <div style={{ width: 8 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="text-sm font-medium truncate">{n.title}</div>
                <div className="text-xs text-muted truncate">{n.message}</div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                  {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationPanel;
