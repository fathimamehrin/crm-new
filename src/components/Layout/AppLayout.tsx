import React, { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import SessionWarningModal from '../SessionWarningModal';
import { useAuth } from '../../contexts/AuthContext';
import { useInactivity } from '../../hooks/useInactivity';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const { logout, currentUser, userProfile, userRole } = useAuth();
  const prevTasksRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!currentUser || !db) return;

    const q = query(collection(db, 'tasks'));
    const unsub = onSnapshot(q, (snapshot) => {
      const currentMap: Record<string, string> = {};
      const prevMap = prevTasksRef.current;

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const id = doc.id;
        const status = data.status;
        const title = data.title;
        const createdBy = data.createdBy;
        const assignedTo = data.assignedTo;

        currentMap[id] = status;

        const oldStatus = prevMap[id];
        
        const isRecent = data.createdAt ? (Date.now() - new Date(data.createdAt).getTime() < 15000) : false;

        if (oldStatus !== status) {
          if (oldStatus !== undefined || isRecent) {
            // Action required gates:
            if (status === 'completed' && createdBy === currentUser.uid) {
              toast.custom(
                (t) => (
                  <div className={`toast-custom toast-success ${t.visible ? 'animate-enter' : 'animate-leave'}`} style={{
                    padding: '12px 16px', background: '#1e293b', border: '1px solid var(--color-success)',
                    borderRadius: '8px', color: '#fff', display: 'flex', flexDirection: 'column', gap: '4px',
                    boxShadow: 'var(--shadow-lg)', zIndex: 9999
                  }}>
                    <strong style={{ color: 'var(--color-success)', fontSize: '13px' }}>Task Completed! Action Required</strong>
                    <span style={{ fontSize: '12px' }}>"{title}" is completed. Please verify and close.</span>
                  </div>
                ),
                { id: `verify-${id}`, duration: 5000 }
              );
            } else if (status === 'pending_reassignment' && createdBy === currentUser.uid) {
              toast.custom(
                (t) => (
                  <div className={`toast-custom toast-warning ${t.visible ? 'animate-enter' : 'animate-leave'}`} style={{
                    padding: '12px 16px', background: '#1e293b', border: '1px solid var(--color-warning)',
                    borderRadius: '8px', color: '#fff', display: 'flex', flexDirection: 'column', gap: '4px',
                    boxShadow: 'var(--shadow-lg)', zIndex: 9999
                  }}>
                    <strong style={{ color: 'var(--color-warning)', fontSize: '13px' }}>Reassignment Request!</strong>
                    <span style={{ fontSize: '12px' }}>"{title}" has a transfer request awaiting your approval.</span>
                  </div>
                ),
                { id: `reassign-${id}`, duration: 5000 }
              );
            } else if (status === 'pending_acceptance' && assignedTo === currentUser.uid) {
              toast.custom(
                (t) => (
                  <div className={`toast-custom toast-info ${t.visible ? 'animate-enter' : 'animate-leave'}`} style={{
                    padding: '12px 16px', background: '#1e293b', border: '1px solid var(--color-accent)',
                    borderRadius: '8px', color: '#fff', display: 'flex', flexDirection: 'column', gap: '4px',
                    boxShadow: 'var(--shadow-lg)', zIndex: 9999
                  }}>
                    <strong style={{ color: 'var(--color-accent)', fontSize: '13px' }}>New Task Assigned!</strong>
                    <span style={{ fontSize: '12px' }}>You have been assigned: "{title}". Please claim it.</span>
                  </div>
                ),
                { id: `assign-${id}`, duration: 5000 }
              );
            }
          }
        }
      });

      prevTasksRef.current = currentMap;
    });

    return () => unsub();
  }, [currentUser]);

  const handleMenuClick = () => {
    setSidebarOpen((prev) => !prev);
  };

  const { reset } = useInactivity({
    warningMs: 9 * 60 * 1000,
    timeoutMs: 10 * 60 * 1000,
    onWarn: () => setShowSessionWarning(true),
    onTimeout: () => {
      setShowSessionWarning(false);
      logout();
    },
  });

  const handleStay = () => {
    setShowSessionWarning(false);
    reset();
  };

  const handleLogout = () => {
    setShowSessionWarning(false);
    logout();
  };

  return (
    <div className="app-layout">
      {userRole === 'admin' && (
        <Sidebar
          collapsed={!sidebarOpen && !mobileOpen}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
      )}
      <main className={`app-main ${userRole === 'admin' && !sidebarOpen && !mobileOpen ? 'sidebar-collapsed' : ''}`}>
        <Header
          onMenuClick={handleMenuClick}
        />
        <div className="app-content">
          {currentUser && !userProfile && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
              color: 'var(--color-text-primary)',
            }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: '#f87171', margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-base)' }}>
                ⚠️ Firestore User Profile Missing
              </h3>
              <p style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 var(--space-4) 0', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                You are authenticated via Firebase Auth, but no corresponding profile document exists in the <strong>users</strong> Firestore collection. Without this, your role (admin/agent) is unset, and Firestore security rules will block your operations.
              </p>
              <div style={{ background: 'var(--color-bg-elevated)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-xs)', fontFamily: 'monospace', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--color-text-primary)', display: 'block', marginBottom: 'var(--space-2)' }}>How to fix this:</strong>
                1. Go to your <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-accent)', textDecoration: 'underline' }}>Firebase Console</a> → <strong>Firestore Database</strong>.<br />
                2. Click <strong>Start Collection</strong> → Name it <code>users</code>.<br />
                3. Set the <strong>Document ID</strong> to this exact UID:<br />
                <span style={{ display: 'inline-block', background: 'rgba(99,102,241,0.2)', padding: '2px 8px', borderRadius: 4, margin: '6px 0', color: '#a5b4fc', fontWeight: 'bold' }}>{currentUser.uid}</span><br />
                4. Add the following fields to this document:<br />
                &nbsp;&nbsp;• <code>name</code> (string): <code>Your Name</code><br />
                &nbsp;&nbsp;• <code>email</code> (string): <code>{currentUser.email}</code><br />
                &nbsp;&nbsp;• <code>role</code> (string): <code>admin</code> (or <code>agent</code>)<br />
                &nbsp;&nbsp;• <code>status</code> (string): <code>active</code><br />
                &nbsp;&nbsp;• <code>createdAt</code> (timestamp): Select type <strong>timestamp</strong> and set to current time.<br />
                <br />
                Once created, the database rules will authorize your requests and this message will disappear!
              </div>
            </div>
          )}
          <Outlet />
        </div>
      </main>

      {showSessionWarning && (
        <SessionWarningModal
          onStay={handleStay}
          onLogout={handleLogout}
          secondsLeft={60}
        />
      )}
    </div>
  );
};

export default AppLayout;
