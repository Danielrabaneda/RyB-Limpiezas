import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  where,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { tenantCollection } from "../utils/tenantFirestore";

export async function createAdminUser(companyId, email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const profile = {
    uid: cred.user.uid,
    name,
    email,
    phone: "",
    role: "admin",
    active: true,
    companyId: companyId,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, "users", cred.user.uid), profile);
  return profile;
}

export async function getOperarios(companyId) {
  if (!companyId) {
    console.warn("getOperarios invocado sin companyId. Retornando vacío sin consultar Firestore.");
    return [];
  }
  const q = query(collection(db, "users"), where("companyId", "==", companyId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        ...data,
        legacyUid: data.uid && data.uid !== d.id ? data.uid : null,
        uid: d.id,
      };
    })
    .filter((u) => u.role === "operario" || u.isOperario === true);
}

export async function getAllUsers(companyId) {
  if (!companyId) {
    console.warn("getAllUsers invocado sin companyId. Retornando vacío sin consultar Firestore.");
    return [];
  }
  const q = query(collection(db, "users"), where("companyId", "==", companyId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      legacyUid: data.uid && data.uid !== d.id ? data.uid : null,
      uid: d.id,
    };
  });
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, "users", uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function toggleUserActive(uid, active) {
  await updateDoc(doc(db, "users", uid), { active });
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Elimina un operario y limpia todos sus datos asociados en Firestore.
 *
 * ── Proceso de borrado ──────────────────────────────────────────────
 *
 * SIEMPRE se borra (no depende de opciones):
 *
 *  1. Asignaciones (assignments)
 *     → Cada entrada que vincula al operario con una comunidad.
 *       Sin esto, la comunidad seguiría mostrando al operario asignado.
 *
 *  2. Servicios programados pendientes (scheduledServices, status "pending")
 *     → Solo los que aún no se han realizado. Los completados se mantienen
 *       como histórico (salvo que se active la opción deleteHistory).
 *
 *  3. Notificaciones del sistema (systemNotifications)
 *     → Todas las notificaciones dirigidas al operario.
 *
 *  4. Traspasos pendientes (transfers, status "pending")
 *     → Tanto los que envía (fromUserId) como los que recibe (toUserId).
 *       Los traspasos ya completados/rechazados se conservan.
 *
 * OPCIONAL (según checkboxes del modal):
 *
 *  5. Historial de trabajo (si options.deleteHistory = true)
 *     - checkIns    → Todos los fichajes de entrada/salida del operario.
 *     - workdays    → Jornadas laborales registradas (horas, pausas…).
 *     - dailyMileage → Registros de kilometraje diario.
 *
 *  6. Solicitudes de materiales (si options.deleteMaterials = true)
 *     - materialRequests → Historial de pedidos de productos.
 *
 *  7. Informes enviados (si options.deleteReports = true)
 *     - evidenceReports → Incidencias y partes de trabajo con fotos.
 *
 * SIEMPRE al final:
 *
 *  8. Documento de usuario (/users/{uid})
 *     → El perfil del operario: nombre, email, rol, companyId, etc.
 *       Este es el documento raíz del usuario en Firestore.
 *       ⚠️  Nota: esto NO elimina la cuenta de Firebase Auth (login).
 *       El usuario no podrá acceder porque su doc de perfil ya no existe
 *       y las reglas de seguridad lo bloquearán, pero la cuenta Auth
 *       seguirá existiendo (se puede limpiar desde la consola de Firebase
 *       o con una Cloud Function).
 *
 * Todo se ejecuta en batches de máximo 500 operaciones (límite de Firestore).
 * ─────────────────────────────────────────────────────────────────────
 *
 * @param {string} companyId - ID de la empresa a la que pertenece el operario
 * @param {string} uid - ID del usuario (document ID en /users)
 * @param {object} options
 * @param {boolean} options.deleteHistory - Si true, borra fichajes, jornadas y kilometraje.
 * @param {boolean} options.deleteMaterials - Si true, borra sus solicitudes de materiales.
 * @param {boolean} options.deleteReports - Si true, borra sus informes/incidencias enviados.
 */
export async function deleteOperario(companyId, uid, options = {}) {
  const BATCH_LIMIT = 500;
  const refsToDelete = [];

  // ── Paso 1: Asignaciones a comunidades ──
  // Borra cada doc de /companies/{companyId}/assignments donde userId == uid.
  // Esto desvincula al operario de todas las comunidades que tenía asignadas.
  const assignSnap = await getDocs(
    query(tenantCollection(db, companyId, "assignments"), where("userId", "==", uid)),
  );
  assignSnap.docs.forEach((d) => refsToDelete.push(d.ref));

  // ── Paso 2: Servicios programados pendientes ──
  // Borra solo los servicios con status "pending" asignados a este operario.
  // Los servicios ya completados ("done") NO se tocan.
  const svcSnap = await getDocs(
    query(
      tenantCollection(db, companyId, "scheduledServices"),
      where("assignedUserId", "==", uid),
      where("status", "==", "pending"),
    ),
  );
  svcSnap.docs.forEach((d) => refsToDelete.push(d.ref));

  // ── Paso 3: Notificaciones del sistema ──
  // Elimina todas las notificaciones internas dirigidas al operario.
  const notifSnap = await getDocs(
    query(tenantCollection(db, companyId, "systemNotifications"), where("userId", "==", uid)),
  );
  notifSnap.docs.forEach((d) => refsToDelete.push(d.ref));

  // ── Paso 4: Traspasos pendientes (entrantes y salientes) ──
  // Borra los traspasos de comunidades aún sin resolver.
  // - fromUserId: traspasos que el operario inició.
  // - toUserId: traspasos que el operario debía aceptar.
  const transFromSnap = await getDocs(
    query(
      tenantCollection(db, companyId, "transfers"),
      where("fromUserId", "==", uid),
      where("status", "==", "pending"),
    ),
  );
  const transToSnap = await getDocs(
    query(
      tenantCollection(db, companyId, "transfers"),
      where("toUserId", "==", uid),
      where("status", "==", "pending"),
    ),
  );
  transFromSnap.docs.forEach((d) => refsToDelete.push(d.ref));
  transToSnap.docs.forEach((d) => refsToDelete.push(d.ref));

  // ── Paso 5 (opcional): Historial de trabajo ──
  // Borra fichajes (checkIns), jornadas (workdays) y kilometraje (dailyMileage).
  if (options.deleteHistory) {
    const [cSnap, wSnap, mSnap] = await Promise.all([
      getDocs(query(tenantCollection(db, companyId, "checkIns"), where("userId", "==", uid))),
      getDocs(query(tenantCollection(db, companyId, "workdays"), where("userId", "==", uid))),
      getDocs(
        query(tenantCollection(db, companyId, "dailyMileage"), where("userId", "==", uid)),
      ),
    ]);
    cSnap.docs.forEach((d) => refsToDelete.push(d.ref));
    wSnap.docs.forEach((d) => refsToDelete.push(d.ref));
    mSnap.docs.forEach((d) => refsToDelete.push(d.ref));
  }

  // ── Paso 6 (opcional): Solicitudes de materiales ──
  // Borra el historial de pedidos de productos del operario.
  if (options.deleteMaterials) {
    const matSnap = await getDocs(
      query(tenantCollection(db, companyId, "materialRequests"), where("userId", "==", uid)),
    );
    matSnap.docs.forEach((d) => refsToDelete.push(d.ref));
  }

  // ── Paso 7 (opcional): Informes enviados ──
  // Borra incidencias y partes de trabajo con evidencia fotográfica.
  if (options.deleteReports) {
    const repSnap = await getDocs(
      query(tenantCollection(db, companyId, "evidenceReports"), where("userId", "==", uid)),
    );
    repSnap.docs.forEach((d) => refsToDelete.push(d.ref));
  }

  // ── Paso 8: Eliminar el documento de perfil del usuario ──
  // Borra /users/{uid} — el documento raíz con nombre, email, rol, etc.
  // ⚠️ La cuenta de Firebase Auth (login) sigue existiendo.
  refsToDelete.push(doc(db, "users", uid));

  // ── Ejecución: commit en bloques de 500 (límite de Firestore) ──
  for (let i = 0; i < refsToDelete.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = refsToDelete.slice(i, i + BATCH_LIMIT);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}
