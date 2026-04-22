import { createContext, useContext, useState, useEffect } from 'react';
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

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await fetchUserProfile(cred.user.uid);
    return { user: cred.user, profile };
  }

  async function logout() {
    setUserProfile(null);
    return signOut(auth);
  }

  async function createOperario(email, password, name, phone) {
    // We create the user via secondary app to avoid logging out the admin
    const user = await createUserWithoutLogout(email, password);
    const profile = {
      uid: user.uid,
      name,
      email,
      phone: phone || '',
      role: 'operario',
      active: true,
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', user.uid), profile);
    return profile;
  }

  async function signup(email, password, name) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const profile = {
      uid: cred.user.uid,
      name,
      email,
      role: 'operario',
      active: true,
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    setUserProfile(profile);
    return { user: cred.user, profile };
  }

  async function fetchUserProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const profile = { uid, ...snap.data() };
      setUserProfile(profile);
      return profile;
    }
    return null;
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchUserProfile(user.uid);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userProfile,
    loading,
    login,
    logout,
    signup,
    createOperario,
    isAdmin: userProfile?.role === 'admin',
    isOperario: userProfile?.role === 'operario',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
