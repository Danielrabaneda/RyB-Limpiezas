import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { firebaseConfig } from '../config/firebase';

// Esta utilidad permite crear usuarios sin cerrar la sesión del admin actual
// creando una instancia temporal de Firebase en memoria.
export async function createUserWithoutLogout(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
  const secondaryAuth = getAuth(secondaryApp);
  
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    // Una vez creado, cerramos la sesión en la instancia secundaria y la eliminamos
    await signOut(secondaryAuth);
    await secondaryApp.delete();
    return cred.user;
  } catch (error) {
    await secondaryApp.delete();
    throw error;
  }
}
