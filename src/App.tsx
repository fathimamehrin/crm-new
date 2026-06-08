import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import AppRouter from './router';
import { isFirebaseConfigured } from './lib/firebase';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

// Setup screen shown when Firebase env vars are missing
const SetupScreen: React.FC = () => (
  <div style={{
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--color-bg-primary)', padding: '2rem',
  }}>
    <div style={{
      background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-xl)', padding: '3rem', maxWidth: 560, width: '100%',
      boxShadow: 'var(--shadow-lg)',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--color-warning-light)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1.5rem', fontSize: '2rem',
      }}>⚙️</div>
      <h1 style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.5rem' }}>Firebase Setup Required</h1>
      <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Your <code style={{ background: 'var(--color-bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>.env</code> file
        is missing or empty. Follow these steps to connect Firebase:
      </p>
      <ol style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: 2, paddingLeft: '1.25rem' }}>
        <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-accent)' }}>console.firebase.google.com</a> and create a project</li>
        <li>Enable <strong>Authentication</strong> → Email/Password</li>
        <li>Enable <strong>Firestore Database</strong></li>
        <li>Enable <strong>Storage</strong> (Blaze plan for file uploads)</li>
        <li>Go to Project Settings → copy your config values</li>
        <li>Create <code style={{ background: 'var(--color-bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>.env</code> from <code style={{ background: 'var(--color-bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>.env.example</code> and fill in the values</li>
        <li>Restart the dev server with <code style={{ background: 'var(--color-bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>npm run dev</code></li>
      </ol>
      <div style={{
        marginTop: '2rem', padding: '1rem', background: 'var(--color-bg-elevated)',
        borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '0.75rem',
        color: 'var(--color-text-secondary)', lineHeight: 1.8,
        border: '1px solid var(--color-border)',
      }}>
        VITE_FIREBASE_API_KEY=your_key<br />
        VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com<br />
        VITE_FIREBASE_PROJECT_ID=your_project_id<br />
        VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com<br />
        VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id<br />
        VITE_FIREBASE_APP_ID=your_app_id
      </div>
      <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
        See <strong>README.md</strong> for the complete setup guide including how to create your first admin.
      </p>
    </div>
  </div>
);

const App: React.FC = () => {
  if (!isFirebaseConfigured) {
    return <SetupScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRouter />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1e2740',
              color: '#f1f5f9',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#1e2740' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#1e2740' },
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;

