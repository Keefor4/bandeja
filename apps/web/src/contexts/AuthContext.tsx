import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { BandejaUser, UserRole } from '@bandeja/shared';

interface AuthContextValue {
  user: User | null;
  profile: BandejaUser | null;
  role: UserRole | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<BandejaUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const ref = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProfile(snap.data() as BandejaUser);
        } else {
          // First login — create viewer profile (admin promotes later)
          const newProfile: Omit<BandejaUser, 'uid'> = {
            email: firebaseUser.email ?? '',
            displayName: firebaseUser.displayName ?? firebaseUser.email ?? 'Unknown',
            role: 'viewer',
            createdAt: serverTimestamp() as any,
          };
          await setDoc(ref, { uid: firebaseUser.uid, ...newProfile });
          setProfile({ uid: firebaseUser.uid, ...newProfile } as BandejaUser);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, role: profile?.role ?? null, loading, loginWithEmail, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
