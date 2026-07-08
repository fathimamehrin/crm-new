import { useState, useEffect } from 'react';
import { onSnapshot, query, orderBy, limit, where, Timestamp, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ActivityLog } from '../types';
import { useAuth } from '../contexts/AuthContext';

const ACTION_LABELS: Record<string, string> = {
  client_created: 'New client added',
  client_updated: 'Client updated',
  client_assigned: 'Client assigned to agent',
  summary_added: 'New summary added',
  payment_updated: 'Payment updated',
  agent_created: 'New agent created',
  agent_updated: 'Agent updated',
  agent_enabled: 'Agent enabled',
  agent_disabled: 'Agent disabled',
  admin_created: 'New admin created',
  task_created: 'New task created',
  task_accepted: 'Task accepted',
  task_rejected: 'Task rejected',
  task_completed: 'Task completed',
  task_verified: 'Task verified & closed',
  task_reassign_requested: 'Task reassignment requested',
  task_reassigned: 'Task reassigned & transferred',
  task_reassign_rejected: 'Task reassignment rejected',
};

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!db || !currentUser) return; // Firebase not configured or user not logged in
    // Listen to last 20 activity logs in real-time
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days
    const q = query(
      collection(db, 'activityLogs'),
      where('createdAt', '>=', Timestamp.fromDate(since)),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      const items: NotificationItem[] = snap.docs
        .map((d) => {
          const log = d.data() as ActivityLog & { userId: string; createdAt: Timestamp };
          
          // Exclude self-actions and non-labeled actions
          if (log.userId === currentUser.uid) return null;
          if (!ACTION_LABELS[log.action]) return null;

          return {
            id: d.id,
            title: ACTION_LABELS[log.action],
            message: log.entityName
              ? `${log.userName ?? 'Someone'} → ${log.entityName}`
              : `By ${log.userName ?? 'Unknown'}`,
            read: readIds.has(d.id),
            createdAt: log.createdAt instanceof Timestamp ? log.createdAt.toDate() : new Date(),
          };
        })
        .filter(Boolean) as NotificationItem[];
      setNotifications(items);
    }, (error) => {
      console.error("Notifications snapshot error:", error);
    });

    return unsub;
  }, [readIds, currentUser]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markAllRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  };

  return { notifications, unreadCount, markAllRead };
};
