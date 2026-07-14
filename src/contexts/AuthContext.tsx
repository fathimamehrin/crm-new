/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getUserById } from '../lib/firestore';
import { logActivity } from '../lib/firestore';
import type { User, UserRole } from '../types';

interface AuthContextValue {
  currentUser: FirebaseUser | null;
  userProfile: User | null;
  userRole: UserRole | null;
  loading: boolean;
  networkError: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ensureUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
  const profile = await getUserById(firebaseUser.uid);
  if (profile) return profile;

  const email = firebaseUser.email || '';
  const isAgentEmail = email.toLowerCase().includes('agent');
  const defaultRole = isAgentEmail ? 'agent' : 'admin';
  const defaultName = email ? email.split('@')[0] : 'User';
  const capitalizedName = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);

  const newProfile = {
    name: capitalizedName,
    email: email,
    role: defaultRole as UserRole,
    status: 'active' as const,
    phone: '',
    createdAt: new Date(),
  };

  await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
  return { id: firebaseUser.uid, ...newProfile };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setNetworkError(false);
    const handleOffline = () => setNetworkError(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setCurrentUser(firebaseUser);
        if (firebaseUser) {
          const profile = await ensureUserProfile(firebaseUser);
          setUserProfile(profile);
          setUserRole(profile.role);
          setNetworkError(false);
        } else {
          setUserProfile(null);
          setUserRole(null);
        }
      } catch (error: any) {
        console.error("AuthContext initialization error:", error);
        setUserProfile(null);
        setUserRole(null);
        
        // Detect connection/network issues
        const isOffline = !navigator.onLine || 
          error.code === 'unavailable' || 
          error.message?.toLowerCase().includes('offline') ||
          error.message?.toLowerCase().includes('network') ||
          error.message?.toLowerCase().includes('failed to fetch');
          
        if (isOffline) {
          setNetworkError(true);
        }
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await ensureUserProfile(cred.user);
    await logActivity({
      userId: cred.user.uid,
      userName: profile.name,
      action: 'user_login',
      entityType: 'user',
      entityId: cred.user.uid,
      entityName: profile.name,
    });
  };

  const logout = async () => {
    if (currentUser && userProfile) {
      await logActivity({
        userId: currentUser.uid,
        userName: userProfile.name,
        action: 'user_logout',
        entityType: 'user',
        entityId: currentUser.uid,
        entityName: userProfile.name,
      });
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, userRole, loading, networkError, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
