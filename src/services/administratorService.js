import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";

const COLLECTION = "administrators";

export async function getAdministrators(companyId) {
  const q = query(
    tenantCollection(db, companyId, COLLECTION),
    where("active", "==", true),
    orderBy("name", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createAdministrator(companyId, data) {
  const docData = {
    name: data.name || "",
    email: data.email || "",
    phone: data.phone || "",
    contactPerson: data.contactPerson || "",
    active: true,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(tenantCollection(db, companyId, COLLECTION), docData);
  return { id: ref.id, ...docData };
}

export async function updateAdministrator(companyId, id, data) {
  const ref = tenantDoc(db, companyId, COLLECTION, id);
  await updateDoc(ref, {
    name: data.name,
    email: data.email,
    phone: data.phone,
    contactPerson: data.contactPerson,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAdministrator(companyId, id) {
  const ref = tenantDoc(db, companyId, COLLECTION, id);
  // Soft delete: set active to false
  await updateDoc(ref, {
    active: false,
    updatedAt: serverTimestamp(),
  });
}
