import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

// Crea el usuario desde Admin SDK para no cambiar la sesión del administrador
// y para que el perfil /users/{uid} pueda escribirse pese al deny-by-default.
export async function createUserWithoutLogout(email, password, profile) {
  const createOperarioUser = httpsCallable(functions, "createOperarioUser");
  const result = await createOperarioUser({ email, password, ...profile });
  return result.data;
}
