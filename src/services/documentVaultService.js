import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";

/**
 * Registra un nuevo documento o guía en la biblioteca digital.
 */
export async function uploadDocument(companyId, {
  title,
  category,
  communityId = null,
  fileUrl,
}) {
  const docRef = tenantCollection(db, companyId, "documentVault");
  const docData = {
    title,
    category, // 'safety_sheet' (Fichas químicas) | 'community_guide' (Instrucciones) | 'general_doc'
    communityId, // Opcional, para enlazar a un portal específico
    fileUrl, // URL del PDF o imagen subido a Storage
    uploadedAt: serverTimestamp(),
  };
  const response = await addDoc(docRef, docData);
  return { id: response.id, ...docData };
}

/**
 * Obtiene documentos por su categoría.
 */
export async function getDocumentsByCategory(companyId, category) {
  const q = query(
    tenantCollection(db, companyId, "documentVault"),
    where("category", "==", category),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Obtiene instrucciones específicas para una comunidad en concreto.
 */
export async function getCommunityGuides(companyId, communityIdParam) {
  const q = query(
    tenantCollection(db, companyId, "documentVault"),
    where("category", "==", "community_guide"),
    where("communityId", "==", communityIdParam),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Elimina un documento de la biblioteca.
 */
export async function deleteDocument(companyId, documentId) {
  const ref = tenantDoc(db, companyId, "documentVault", documentId);
  await deleteDoc(ref);
}
