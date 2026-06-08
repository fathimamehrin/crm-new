import { useState, useEffect } from 'react';
import { onSnapshot, query, orderBy, limit, where, Timestamp, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ActivityLog } from '../types';

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
  user_login: 'User logged in',
  user_logout: 'User logged out',
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

  useEffect(() => {
    if (!db) return; // Firebase not configured
    // Listen to last 20 activity logs in real-time
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days
    const q = query(
      collection(db, 'activityLogs'),
      where('createdAt', '>=', Timestamp.fromDate(since)),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      const items: NotificationItem[] = snap.docs.map((d) => {
        const log = d.data() as ActivityLog & { createdAt: Timestamp };
        return {
          id: d.id,
          title: ACTION_LABELS[log.action] ?? log.action,
          message: log.entityName
            ? `${log.userName ?? 'Someone'} → ${log.entityName}`
            : `By ${log.userName ?? 'Unknown'}`,
          read: readIds.has(d.id),
          createdAt: log.createdAt instanceof Timestamp ? log.createdAt.toDate() : new Date(),
        };
      });
      setNotifications(items);
    });

    return unsub;
  }, [readIds]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markAllRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  };

  return { notifications, unreadCount, markAllRead };
};
