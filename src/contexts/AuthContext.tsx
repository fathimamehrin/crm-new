import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getUserById } from '../lib/firestore';
import { logActivity } from '../lib/firestore';
import type { User, UserRole } from '../types';

interface AuthContextValue {
  currentUser: FirebaseUser | null;
  userProfile: User | null;
  userRole: UserRole | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setCurrentUser(firebaseUser);
      if (firebaseUser) {
        const profile = await getUserById(firebaseUser.uid);
        setUserProfile(profile);
        setUserRole(profile?.role ?? null);
      } else {
        setUserProfile(null);
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getUserById(cred.user.uid);
    if (profile) {
      await logActivity({
        userId: cred.user.uid,
        userName: profile.name,
        action: 'user_login',
        entityType: 'user',
        entityId: cred.user.uid,
        entityName: profile.name,
      });
    }
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
    <AuthContext.Provider value={{ currentUser, userProfile, userRole, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
