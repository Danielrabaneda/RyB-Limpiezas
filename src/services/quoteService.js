import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { functions, storage } from "../config/firebase";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";
import { createInvoice } from "./invoiceService";
import { createCommunityTask } from "./taskService";

const COLLECTION = "quotes";

export async function getQuotes(companyId) {
  const snap = await getDocs(tenantCollection(db, companyId, COLLECTION));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function getQuote(companyId, quoteId) {
  const snap = await getDoc(tenantDoc(db, companyId, COLLECTION, quoteId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getNextQuoteNumber(companyId, year = new Date().getFullYear()) {
  const snap = await getDocs(
    query(tenantCollection(db, companyId, COLLECTION), where("year", "==", year)),
  );
  const highest = snap.docs.reduce(
    (max, item) => Math.max(max, Number(item.data().sequence) || 0),
    0,
  );
  return { sequence: highest + 1, number: `PRE-${year}-${String(highest + 1).padStart(4, "0")}` };
}

export async function createQuote(companyId, data, user) {
  const numbering = await getNextQuoteNumber(companyId, data.year);
  const ref = await addDoc(tenantCollection(db, companyId, COLLECTION), {
    ...data,
    ...numbering,
    status: "draft",
    version: 1,
    createdBy: { uid: user?.uid || "", name: user?.displayName || user?.email || "" },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    activity: [{ type: "created", label: "Presupuesto creado", at: new Date().toISOString(), by: user?.email || "" }],
  });
  return ref.id;
}

export async function updateQuote(companyId, quoteId, data, user) {
  const ref = tenantDoc(db, companyId, COLLECTION, quoteId);
  const current = await getDoc(ref);
  if (!current.exists()) throw new Error("El presupuesto no existe.");
  const previous = current.data();
  let version = previous.version || 1;
  if (previous.status !== "draft" && data.contentChanged) {
    await addDoc(tenantCollection(db, companyId, "quoteVersions"), {
      quoteId,
      version,
      snapshot: previous,
      createdAt: serverTimestamp(),
      createdBy: user?.uid || "",
    });
    version += 1;
  }
  const { contentChanged, ...safeData } = data;
  await updateDoc(ref, {
    ...safeData,
    version,
    updatedBy: { uid: user?.uid || "", name: user?.displayName || user?.email || "" },
    updatedAt: serverTimestamp(),
  });
}

export async function setQuoteStatus(companyId, quote, status, user, extra = {}) {
  const label = {
    sent: "Presupuesto enviado",
    viewed: "Visto por el cliente",
    accepted: "Aceptado por el cliente",
    rejected: "Rechazado por el cliente",
    expired: "Presupuesto caducado",
    converted_service: "Convertido a servicio",
    converted_invoice: "Convertido a factura",
  }[status] || "Estado actualizado";
  await updateDoc(tenantDoc(db, companyId, COLLECTION, quote.id), {
    status,
    ...extra,
    activity: [...(quote.activity || []), { type: status, label, at: new Date().toISOString(), by: user?.email || "" }],
    updatedAt: serverTimestamp(),
  });
  if (quote.opportunityId && ["sent", "accepted", "rejected", "converted_service"].includes(status)) {
    const opportunityStage = { sent: "quote_sent", accepted: "won", rejected: "lost", converted_service: "won" }[status];
    const opportunityRef = tenantDoc(db, companyId, "opportunities", quote.opportunityId);
    const opportunitySnap = await getDoc(opportunityRef);
    if (opportunitySnap.exists()) {
      const opportunity = opportunitySnap.data();
      await updateDoc(opportunityRef, {
        stage: opportunityStage,
        quoteId: quote.id,
        lastActivityAt: new Date().toISOString(),
        activities: [...(opportunity.activities || []), { type: "quote", title: label, quoteId: quote.id, at: new Date().toISOString(), by: user?.email || "" }],
        updatedAt: serverTimestamp(),
      });
    }
  }
}

export async function duplicateQuote(companyId, quote, user) {
  const { id, number, sequence, createdAt, updatedAt, activity, ...copy } = quote;
  return createQuote(companyId, {
    ...copy,
    title: `${copy.title || "Presupuesto"} (copia)`,
    issueDate: new Date().toISOString().slice(0, 10),
  }, user);
}

export async function deleteDraftQuote(companyId, quoteId) {
  const ref = tenantDoc(db, companyId, COLLECTION, quoteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (snap.data().status !== "draft") {
    throw new Error("Solo se pueden eliminar presupuestos en borrador.");
  }
  await deleteDoc(ref);
}

export async function convertQuoteToInvoice(companyId, quote) {
  const now = new Date();
  const invoiceId = await createInvoice(companyId, {
    quoteId: quote.id,
    clientType: "community",
    selectedCommunityId: quote.clientId,
    clientName: quote.clientName,
    clientCif: quote.clientTaxId || "",
    clientAddress: quote.clientAddress || "",
    clientEmail: quote.clientEmail || "",
    paymentMethod: quote.paymentTerms || "transferencia",
    items: quote.pricingMode === "global"
      ? (quote.priceItems || []).map((item) => ({ description: `${item.concept}${item.description ? ` - ${item.description}` : ""}`, quantity: item.quantity, price: item.unitPrice, total: item.total }))
      : (quote.lines || []).map((line) => ({ description: line.concept, quantity: line.quantity, price: line.unitPrice, total: line.total })),
    taxRate: 21,
    subtotal: quote.subtotal,
    tax: quote.taxTotal,
    total: quote.total,
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  return invoiceId;
}

export async function convertQuoteToService(companyId, quote) {
  if (quote.clientMode === "new" || !quote.clientId) throw new Error("Da de alta al nuevo cliente antes de convertir el presupuesto en servicio.");
  const created = [];
  for (const line of quote.lines || []) {
    if (!line.concept) continue;
    const task = await createCommunityTask(companyId, {
      communityId: quote.clientId,
      taskName: line.concept,
      frequencyType: line.frequency || quote.frequency || "weekly",
      frequencyValue: 1,
      weekDays: quote.weekDays?.length ? quote.weekDays : [1],
      startDate: quote.serviceStartDate || new Date().toISOString().slice(0, 10),
      assignedUserId: quote.assignedUserId || null,
      quoteId: quote.id,
    });
    created.push(task.id);
  }
  return created;
}

export async function uploadQuotePdf(companyId, quoteId, pdfBlob, filename) {
  const storagePath = `companies/${companyId}/quotes/${quoteId}/${filename}`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, pdfBlob, { contentType: "application/pdf" });
  const pdfUrl = await getDownloadURL(fileRef);
  await updateDoc(tenantDoc(db, companyId, COLLECTION, quoteId), { pdfStoragePath: storagePath, pdfUrl, updatedAt: serverTimestamp() });
  return { storagePath, pdfUrl };
}

export async function sendQuoteEmail(companyId, quoteId, options = {}) {
  const fn = httpsCallable(functions, "sendQuoteEmail");
  const result = await fn({ companyId, quoteId, ...options });
  return result.data;
}
