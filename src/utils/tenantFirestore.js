import { collection, doc } from "firebase/firestore";

function validateCompanyId(companyId) {
  if (companyId === undefined || companyId === null || companyId === "") {
    throw new Error("tenantFirestore: companyId is missing or empty.");
  }
}

function validateSegments(segments) {
  if (!segments || segments.length === 0) {
    throw new Error("tenantFirestore: path segments are missing.");
  }
  for (const segment of segments) {
    if (segment === undefined || segment === null || segment === "") {
      throw new Error(`tenantFirestore: invalid path segment encountered: ${segment}`);
    }
  }
}

/**
 * Retorna la referencia a una colección hija del tenant.
 * @param {import("firebase/firestore").Firestore} db - La instancia de Firestore
 * @param {string} companyId - El ID del tenant activo
 * @param {...string} segments - La ruta relativa de la colección
 * @returns {import("firebase/firestore").CollectionReference}
 */
export function tenantCollection(db, companyId, ...segments) {
  validateCompanyId(companyId);
  validateSegments(segments);
  
  // collection() espera un número impar de argumentos de ruta, ej: collection(db, 'companies', 'rayba', 'communities')
  if (segments.length % 2 !== 1) {
    throw new Error(`tenantCollection expects an odd number of segments, got ${segments.length}`);
  }
  
  return collection(db, "companies", companyId, ...segments);
}

/**
 * Retorna la referencia a un documento hijo del tenant.
 * @param {import("firebase/firestore").Firestore} db - La instancia de Firestore
 * @param {string} companyId - El ID del tenant activo
 * @param {...string} segments - La ruta relativa del documento
 * @returns {import("firebase/firestore").DocumentReference}
 */
export function tenantDoc(db, companyId, ...segments) {
  validateCompanyId(companyId);
  validateSegments(segments);

  // doc() espera un número par de argumentos de ruta, ej: doc(db, 'companies', 'rayba', 'communities', 'comm1')
  if (segments.length % 2 !== 0) {
    throw new Error(`tenantDoc expects an even number of segments, got ${segments.length}`);
  }

  return doc(db, "companies", companyId, ...segments);
}
