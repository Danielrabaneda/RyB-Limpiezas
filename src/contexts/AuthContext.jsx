import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { createUserWithoutLogout } from '../services/adminAuthService';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = useCallback(async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    let profile = null;
    if (snap.exists()) {
      profile = { uid: cred.user.uid, ...snap.data() };
      setUserProfile(profile);
    }
    if (!profile || profile.active === false) {
      await signOut(auth);
      setUserProfile(null);
      throw new Error('Su cuenta está inactiva o ha sido dada de baja.');
    }
    return { user: cred.user, profile };
  }, []);

  const logout = useCallback(async () => {
    setUserProfile(null);
    return signOut(auth);
  }, []);

  const createOperario = useCallback(async (email, password, name, phone, allowDirectTransfers = false) => {
    // We create the user via secondary app to avoid logging out the admin
    const user = await createUserWithoutLogout(email, password);
    const profile = {
      uid: user.uid,
      name,
      email,
      phone: phone || '',
      role: 'operario',
      active: true,
      allowDirectTransfers: !!allowDirectTransfers,
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', user.uid), profile);
    return profile;
  }, []);

  const signup = useCallback(async (email, password, name) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const profile = {
      uid: cred.user.uid,
      name,
      email,
      role: 'operario',
      active: true,
      allowDirectTransfers: false,
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    setUserProfile(profile);
    return { user: cred.user, profile };
  }, []);

  useEffect(() => {
    let active = true;

    // Safety timeout to prevent startup hangs
    const safetyTimer = setTimeout(() => {
      if (active) {
        setLoading(prev => {
          if (prev) {
            console.warn('AuthContext safety timeout reached - forcing loading to false');
            return false;
          }
          return prev;
        });
      }
    }, 10000); // 10 seconds

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user ? 'Logged in' : 'Logged out');
      if (!active) return;

      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (!active) return;

          if (snap.exists()) {
            const profile = { uid: user.uid, ...snap.data() };
            if (profile.active === false) {
              console.warn('AuthContext: User profile inactive. Forcing logout.');
              await signOut(auth);
              if (active) {
                setUserProfile(null);
                setCurrentUser(null);
              }
            } else {
              setUserProfile(profile);
            }
          } else {
            console.warn('AuthContext: User profile not found. Forcing logout.');
            await signOut(auth);
            if (active) {
              setUserProfile(null);
              setCurrentUser(null);
            }
          }
        } catch (err) {
          console.error('Error fetching user profile during init:', err);
        }
      } else {
        setUserProfile(null);
      }
      
      if (active) {
        setLoading(false);
        clearTimeout(safetyTimer);
      }
    });

    return () => {
      active = false;
      unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  const value = useMemo(() => ({
    currentUser,
    userProfile,
    loading,
    login,
    logout,
    signup,
    createOperario,
    isAdmin: userProfile?.role === 'admin',
    isOperario: userProfile?.role === 'operario' || userProfile?.isOperario === true,
  }), [currentUser, userProfile, loading, login, logout, signup, createOperario]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
