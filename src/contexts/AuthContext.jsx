import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { createUserWithoutLogout } from "../services/adminAuthService";

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
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    let profile = null;
    if (snap.exists()) {
      profile = { uid: cred.user.uid, ...snap.data() };
      setUserProfile(profile);
    }
    if (!profile || profile.active === false) {
      await signOut(auth);
      setUserProfile(null);
      throw new Error("Su cuenta está inactiva o ha sido dada de baja.");
    }
    return { user: cred.user, profile };
  }, []);

  const logout = useCallback(async () => {
    setUserProfile(null);
    return signOut(auth);
  }, []);

  const createOperario = useCallback(
    async (email, password, name, phone, allowDirectTransfers = false) => {
      // We create the user via secondary app to avoid logging out the admin
      const user = await createUserWithoutLogout(email, password);
      const profile = {
        uid: user.uid,
        name,
        email,
        phone: phone || "",
        role: "operario",
        active: true,
        allowDirectTransfers: !!allowDirectTransfers,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", user.uid), profile);
      return profile;
    },
    [],
  );

  const signup = useCallback(async (email, password, name) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const profile = {
      uid: cred.user.uid,
      name,
      email,
      role: "operario",
      active: true,
      allowDirectTransfers: false,
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, "users", cred.user.uid), profile);

    // Esperar reactivamente a que la Cloud Function asigne los claims
    let claimConfirmed = false;
    let attempts = 5;
    let delay = 300; // ms inicial

    for (let i = 0; i < attempts; i++) {
      try {
        console.log(
          `signup: Verificando claims (intento ${i + 1}/${attempts})...`,
        );
        const tokenResult = await cred.user.getIdTokenResult(true);
        if (tokenResult.claims && tokenResult.claims.role) {
          console.log(
            "signup: Claims asignados con éxito:",
            tokenResult.claims,
          );
          claimConfirmed = true;
          break;
        }
      } catch (err) {
        console.error(
          `signup: Error en intento ${i + 1} de refresco de token:`,
          err,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // retraso exponencial
    }

    if (!claimConfirmed) {
      console.warn(
        "signup: La Cloud Function tardó demasiado en aplicar los claims. Se prosigue con el flujo.",
      );
    }

    setUserProfile(profile);
    return { user: cred.user, profile };
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribeProfile = null;

    // Safety timeout to prevent startup hangs
    const safetyTimer = setTimeout(() => {
      if (active) {
        setLoading((prev) => {
          if (prev) {
            console.warn(
              "AuthContext safety timeout reached - forcing loading to false",
            );
            return false;
          }
          return prev;
        });
      }
    }, 10000); // 10 seconds

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed:", user ? "Logged in" : "Logged out");

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!active) return;

      setCurrentUser(user);
      if (user) {
        // Escuchar el perfil en Firestore en tiempo real para reaccionar a cambios al instante
        unsubscribeProfile = onSnapshot(
          doc(db, "users", user.uid),
          async (snap) => {
            if (!active) return;

            if (snap.exists()) {
              const profile = { uid: user.uid, ...snap.data() };

              // Si el operario o administrador es desactivado, forzar deslogueo inmediato
              if (profile.active === false) {
                console.warn(
                  "AuthContext: User profile inactive. Forcing logout.",
                );
                if (unsubscribeProfile) {
                  unsubscribeProfile();
                  unsubscribeProfile = null;
                }
                await signOut(auth);
                if (active) {
                  setUserProfile(null);
                  setCurrentUser(null);
                  setLoading(false);
                  clearTimeout(safetyTimer);
                }
                return;
              }

              // Sincronización proactiva de Claims
              try {
                const tokenResult = await user.getIdTokenResult();
                const currentClaimRole = tokenResult.claims.role;
                const currentClaimActive = tokenResult.claims.active;

                // Si los claims locales no coinciden con la base de datos de Firestore, forzar refresco
                if (
                  currentClaimRole !== profile.role ||
                  currentClaimActive !== profile.active
                ) {
                  console.log(
                    "AuthContext: Claims locales desincronizados. Refrescando token...",
                  );
                  await user.getIdToken(true);
                  console.log(
                    "AuthContext: Token de autenticación refrescado exitosamente.",
                  );
                }
              } catch (err) {
                console.error(
                  "Error al comprobar o refrescar claims en el cliente:",
                  err,
                );
              }

              if (active) {
                setUserProfile(profile);
              }
            } else {
              console.warn(
                "AuthContext: User profile not found. Forcing logout.",
              );
              if (unsubscribeProfile) {
                unsubscribeProfile();
                unsubscribeProfile = null;
              }
              await signOut(auth);
              if (active) {
                setUserProfile(null);
                setCurrentUser(null);
              }
            }

            if (active) {
              setLoading(false);
              clearTimeout(safetyTimer);
            }
          },
          (err) => {
            console.error("Error en el snapshot del perfil de usuario:", err);
            if (active) {
              setLoading(false);
              clearTimeout(safetyTimer);
            }
          },
        );
      } else {
        if (active) {
          setUserProfile(null);
          setLoading(false);
          clearTimeout(safetyTimer);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
      clearTimeout(safetyTimer);
    };
  }, []);

  const value = useMemo(
    () => ({
      currentUser,
      userProfile,
      loading,
      login,
      logout,
      signup,
      createOperario,
      isAdmin: userProfile?.role === "admin",
      isOperario:
        userProfile?.role === "operario" || userProfile?.isOperario === true,
    }),
    [currentUser, userProfile, loading, login, logout, signup, createOperario],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
