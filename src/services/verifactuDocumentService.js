import { ref, uploadBytes, list, getMetadata, getBytes } from "firebase/storage";
import { storage } from "../config/firebase";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const SIGNATURES = ["none", "handwritten"];

export function documentFolder(companyId) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(companyId || "")) throw new Error("Empresa no válida.");
  return `companies/${companyId}/verifactuDocuments`;
}

export async function validateDocument(file, title, signatureKind) {
  if (!file || !/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) {
    throw new Error("Selecciona un archivo PDF.");
  }
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) throw new Error("El PDF debe ocupar como máximo 10 MB.");
  if (!title?.trim() || title.trim().length > 120) throw new Error("Escribe un título de hasta 120 caracteres.");
  if (!SIGNATURES.includes(signatureKind)) throw new Error("Indica el tipo de firma.");
  const header = await file.slice(0, 5).text();
  if (header !== "%PDF-") throw new Error("El archivo no tiene un formato PDF válido.");
}

export async function uploadVerifactuDocument(companyId, { file, title, signatureKind }) {
  const folder = documentFolder(companyId);
  await validateDocument(file, title, signatureKind);
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const target = ref(storage, `${folder}/${crypto.randomUUID()}.pdf`);
  // Preserve the original bytes; never re-render, flatten or modify a signed PDF.
  await uploadBytes(target, bytes, {
    contentType: "application/pdf",
    cacheControl: "private, no-store",
    customMetadata: {
      title: title.trim(), signatureKind, sha256,
      purpose: "test_evidence",
      originalName: file.name.slice(0, 200),
    },
  });
  return target.fullPath;
}

export async function listVerifactuDocuments(companyId, pageToken) {
  const result = await list(ref(storage, documentFolder(companyId)), {
    maxResults: 50, ...(pageToken ? { pageToken } : {}),
  });
  const documents = await Promise.all(result.items.map(async (item) => {
    const meta = await getMetadata(item);
    return { path: item.fullPath, name: item.name, createdAt: meta.timeCreated,
      title: meta.customMetadata?.title || item.name,
      signatureKind: meta.customMetadata?.signatureKind || "none",
      sha256: meta.customMetadata?.sha256 || "", size: meta.size };
  }));
  return { documents, nextPageToken: result.nextPageToken };
}

export async function downloadVerifactuDocument(companyId, path) {
  const prefix = `${documentFolder(companyId)}/`;
  if (!path?.startsWith(prefix) || !/^[a-zA-Z0-9_-]+\.pdf$/.test(path.slice(prefix.length))) {
    throw new Error("Documento no válido para esta empresa.");
  }
  // Authenticated download: do not generate or expose permanent public URLs.
  return getBytes(ref(storage, path), MAX_DOCUMENT_BYTES);
}
