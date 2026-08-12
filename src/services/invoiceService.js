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
  limit,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, storage, functions } from "../config/firebase";
import { getCommunities } from "./communityService";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";

const COLLECTION = "invoices";

// ==================== VERIFACTU: HASH ENCADENADO ====================
/**
 * Calcula la huella/hash de un "registro de facturación de alta" según
 * las especificaciones técnicas de la AEAT (VERI*FACTU v0.1.2).
 * Verificado contra los 3 casos de ejemplo del documento oficial
 * (Veri-Factu_especificaciones_huella_hash_registros.pdf, sección 6).
 * NO MODIFICAR el orden de concatenación ni el .toUpperCase() final.
 *
 * Versión asíncrona compatible con navegador (Web Crypto API).
 */
export async function computeInvoiceHash({
  idEmisorFactura,
  numSerieFactura,
  fechaExpedicionFactura,
  tipoFactura,
  cuotaTotal,
  importeTotal,
  huellaAnterior,
  fechaHoraHusoGenRegistro,
}) {
  const cadena =
    `IDEmisorFactura=${idEmisorFactura}` +
    `&NumSerieFactura=${numSerieFactura}` +
    `&FechaExpedicionFactura=${fechaExpedicionFactura}` +
    `&TipoFactura=${tipoFactura}` +
    `&CuotaTotal=${cuotaTotal}` +
    `&ImporteTotal=${importeTotal}` +
    `&Huella=${huellaAnterior || ""}` +
    `&FechaHoraHusoGenRegistro=${fechaHoraHusoGenRegistro}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(cadena);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// ==================== BILLING SETTINGS ====================
const DEFAULT_SETTINGS = {
  companyName: "",
  nif: "",
  address: "",
  phone: "",
  contactPerson: "",
  inscriptionText: "",
  logoBase64: "",
  logoWidth: 45,
  logoHeight: 20,
  bankAccount: "",
  nextInvoiceSeq: 1,
  invoiceNumberFormat: "numeric", // 'numeric' (59, 60...) or 'formatted' (F-2026-0059...)
  fileNamePattern: "Factura_{numero}_{comunidad}",
  useSaveAsDialog: false,
  seqMode: "manual",
  issueDateMode: "today",
  customIssueDate: "",
  verifactuEnabled: false,
  verifactuMode: "disabled",
  aeatConnection: {
    channel: "disabled",
    environment: "test",
    adviserName: "",
    adviserTaxId: "",
    adviserEmail: "",
    connectorName: "",
    productionEnabled: false,
    credentialsStored: false,
    schemaValidationStatus: "pending_official_xsd",
  },
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  smtpEmail: "",
  smtpPassword: "",
  emailSubjectTemplate: "Factura {numero} - RyB Limpiezas",
  emailBodyTemplate:
    "<p>Hola,</p><p>Le adjuntamos la factura <strong>{numero}</strong> correspondiente al servicio de limpieza de la comunidad <strong>{comunidad}</strong>.</p><p>Atentamente,<br/>RyB Limpiezas</p>",
  sepaSuffix: "000",
};

export async function getBillingSettings(companyId) {
  const ref = tenantDoc(db, companyId, "settings", "billing");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // Save defaults
    await setDoc(ref, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...snap.data() };
}

export async function saveBillingSettings(companyId, data) {
  const ref = tenantDoc(db, companyId, "settings", "billing");
  await setDoc(ref, data, { merge: true });
}

export async function setVerifactuMode(companyId, enabled) {
  await saveBillingSettings(companyId, {
    verifactuEnabled: enabled === true,
    verifactuMode: enabled === true ? "test" : "disabled",
    verifactuModeUpdatedAt: serverTimestamp(),
  });
}

export async function configureAeatConnection(profile, verifactuEnabled) {
  const fn = httpsCallable(functions, "configureAeatConnection");
  const result = await fn({ profile, verifactuEnabled });
  return result.data;
}

export async function getAeatSubmissions(companyId) {
  const q = query(
    tenantCollection(db, companyId, "aeatSubmissions"),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

export async function getVerifactuEvents(companyId) {
  const q = query(
    tenantCollection(db, companyId, "verifactuEvents"),
    orderBy("createdAt", "desc"),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

export async function prepareAeatSubmissions(invoiceIds) {
  const fn = httpsCallable(functions, "prepareAeatSubmissions");
  const result = await fn({ invoiceIds });
  return result.data;
}

export async function getAeatSubmissionPackage(submissionId) {
  const fn = httpsCallable(functions, "getAeatSubmissionPackage");
  const result = await fn({ submissionId });
  return result.data;
}

export async function recordAeatTestResult(
  submissionId,
  status,
  response = {},
) {
  const fn = httpsCallable(functions, "recordAeatTestResult");
  const result = await fn({ submissionId, status, response });
  return result.data;
}

// ==================== INVOICE CRUD ====================
export async function getInvoices(companyId, year, month) {
  let q = query(
    tenantCollection(db, companyId, COLLECTION),
    where("year", "==", parseInt(year)),
    where("month", "==", parseInt(month)),
    orderBy("createdAt", "desc"),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createInvoice(companyId, data) {
  if (data.status && data.status !== "draft") {
    throw new Error(
      "Las facturas nuevas deben guardarse como borrador antes de emitirlas",
    );
  }
  const ref = await addDoc(tenantCollection(db, companyId, COLLECTION), {
    ...data,
    invoiceNumber: "Borrador",
    status: "draft",
    issueDate: null,
    dueDate: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateInvoice(companyId, id, data) {
  const ref = tenantDoc(db, companyId, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("La factura no existe");
  const invoice = snap.data();

  // En facturas emitidas solo se admiten metadatos operativos que no alteran
  // el documento ni su registro fiscal.
  const emittedMetadataKeys = new Set([
    "pdfUrl",
    "pdfStoragePath",
    "emailSent",
    "emailSentAt",
    "emailError",
    "lastEmailErrorAt",
  ]);
  const changedKeys = Object.keys(data);
  if (
    invoice.status !== "draft" &&
    !changedKeys.every((key) => emittedMetadataKeys.has(key))
  ) {
    throw new Error(
      "No se puede modificar el contenido de una factura emitida",
    );
  }
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteInvoice(companyId, id) {
  const ref = tenantDoc(db, companyId, COLLECTION, id);
  // VERIFACTU: Inmutabilidad — solo se pueden eliminar borradores
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("La factura no existe");
  if (snap.data().status !== "draft") {
    throw new Error(
      "No se puede eliminar una factura emitida (solo borradores)",
    );
  }
  await deleteDoc(ref);
}

export async function deleteMultipleInvoices(companyId, ids) {
  if (!ids || ids.length === 0) return;
  // VERIFACTU: Inmutabilidad — verificar que todas son borradores antes de eliminar
  for (const id of ids) {
    const snap = await getDoc(tenantDoc(db, companyId, COLLECTION, id));
    if (snap.exists() && snap.data().status !== "draft") {
      throw new Error(
        `No se puede eliminar la factura ${snap.data().invoiceNumber || id}: solo se pueden eliminar borradores`,
      );
    }
  }
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.delete(tenantDoc(db, companyId, COLLECTION, id));
    }
    await batch.commit();
  }
}

// Get the next invoice number for display/preview purposes
export async function getNextInvoiceNumber(companyId, year) {
  const settings = await getBillingSettings(companyId);
  const nextSeq = parseInt(settings.nextInvoiceSeq) || 1;
  const fmt = settings.invoiceNumberFormat || "numeric";

  if (fmt === "formatted") {
    return `F-${year}-${String(nextSeq).padStart(4, "0")}`;
  }
  return String(nextSeq);
}

// La numeración, el bloqueo y el posible registro fiscal se realizan
// exclusivamente en Cloud Functions.
export async function emitInvoice(companyId, id) {
  const fn = httpsCallable(functions, "emitInvoices");
  const result = await fn({ invoiceIds: [id] });
  return result.data;
}

// Mark invoice as Paid
export async function updateInvoiceStatus(companyId, id, status) {
  if (!["pending", "paid"].includes(status)) {
    throw new Error("Estado de cobro no válido");
  }
  const ref = tenantDoc(db, companyId, COLLECTION, id);
  await updateDoc(ref, {
    status,
    paymentStatus: status,
    updatedAt: serverTimestamp(),
  });
}

// ==================== AUTO GENERATE DRAFTS ====================
export async function generateMonthlyDrafts(companyId, month, year) {
  const [comms, existing] = await Promise.all([
    getCommunities(companyId),
    getInvoices(companyId, year, month),
  ]);

  // Filter communities that have a base price greater than 0
  const activeComms = comms.filter((c) => c.active && (c.basePrice || 0) > 0);

  // Find communities that don't have an invoice for this period
  const commsToInvoice = activeComms.filter(
    (c) => !existing.some((inv) => inv.client.communityId === c.id),
  );

  if (commsToInvoice.length === 0) {
    return 0; // No new drafts created
  }

  const monthNames = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const periodLabel = `${monthNames[month]} de ${year}`;

  let count = 0;
  for (const comm of commsToInvoice) {
    const base = parseFloat(comm.basePrice) || 0;
    const taxRate = 21; // 21% VAT
    const taxAmount = parseFloat((base * (taxRate / 100)).toFixed(2));
    const totalAmount = parseFloat((base + taxAmount).toFixed(2));

    const invoiceData = {
      invoiceNumber: "Borrador",
      status: "draft",
      year: parseInt(year),
      month: parseInt(month),
      client: {
        communityId: comm.id,
        name: comm.name,
        cif: comm.billingCif || "",
        billingAddress: comm.billingAddress || comm.address || "",
        email: comm.billingEmail || comm.contactPhone || "",
        iban: comm.billingIban || "",
        mandateRef: comm.billingMandateRef || "",
        mandateDate: comm.billingMandateDate || "",
        administratorId: comm.administratorId || "",
      },
      items: [
        {
          description: `Limpieza de comunidad mes de ${periodLabel}`,
          quantity: 1,
          price: base,
          total: base,
        },
      ],
      subtotal: base,
      taxRate: taxRate,
      taxAmount: taxAmount,
      totalAmount: totalAmount,
      paymentMethod: comm.paymentMethod || "transferencia",
      issueDate: null,
      dueDate: null,
      createdAt: serverTimestamp(),
    };

    await addDoc(tenantCollection(db, companyId, COLLECTION), invoiceData);
    count++;
  }

  return count;
}

// ==================== INVOICE TEMPLATES ====================
export async function getInvoiceTemplates(companyId) {
  const q = query(tenantCollection(db, companyId, "invoice_templates"), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveInvoiceTemplate(companyId, data) {
  const q = query(
    tenantCollection(db, companyId, "invoice_templates"),
    where("name", "==", data.name),
  );
  const snap = await getDocs(q);

  const templateData = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (!snap.empty) {
    const docRef = tenantDoc(db, companyId, "invoice_templates", snap.docs[0].id);
    await updateDoc(docRef, templateData);
    return snap.docs[0].id;
  } else {
    templateData.createdAt = serverTimestamp();
    const docRef = await addDoc(
      tenantCollection(db, companyId, "invoice_templates"),
      templateData,
    );
    return docRef.id;
  }
}

export async function deleteInvoiceTemplate(companyId, id) {
  await deleteDoc(tenantDoc(db, companyId, "invoice_templates", id));
}

// Get the last emitted invoice ordered by invoiceSeq descending
export async function getLastEmittedInvoice(companyId) {
  const q = query(
    tenantCollection(db, companyId, COLLECTION),
    orderBy("invoiceSeq", "desc"),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// Emisión en lote segura desde Cloud Functions.
export async function emitAllInvoices(companyId, ids) {
  if (!ids || ids.length === 0) return;
  const fn = httpsCallable(functions, "emitInvoices");
  const result = await fn({ invoiceIds: ids });
  return result.data;
}

export async function uploadInvoicePDFToStorage(companyId, invoiceId, pdfBlob, filename) {
  const path = `companies/${companyId}/invoices/${invoiceId}/${filename}`;
  const storageRef = ref(storage, path);
  const metadata = {
    contentType: "application/pdf",
  };
  await uploadBytes(storageRef, pdfBlob, metadata);
  const url = await getDownloadURL(storageRef);
  return url;
}

export async function sendInvoiceEmails(companyId, invoiceIds) {
  const fn = httpsCallable(functions, "sendInvoiceEmails");
  const result = await fn({ companyId, invoiceIds });
  return result.data;
}

export async function sendGroupedInvoiceEmails(companyId, invoiceIds) {
  const fn = httpsCallable(functions, "sendGroupedInvoiceEmails");
  const result = await fn({ companyId, invoiceIds });
  return result.data;
}

export async function cancelInvoiceFiscalRecord(invoiceId, reason) {
  const fn = httpsCallable(functions, "cancelInvoiceFiscalRecord");
  const result = await fn({ invoiceId, reason });
  return result.data;
}

export async function subsanateInvoiceFiscalRecord(
  invoiceId,
  reason,
  corrections,
) {
  const fn = httpsCallable(functions, "subsanateInvoiceFiscalRecord");
  const result = await fn({ invoiceId, reason, corrections });
  return result.data;
}

// ==================== VERIFACTU: FACTURA RECTIFICATIVA ====================
/**
 * Crea una factura rectificativa que referencia a la original.
 * NUNCA modifica ni elimina la factura original (inmutabilidad Verifactu).
 * La rectificativa pasa por el mismo flujo de emitInvoice() (número correlativo, hash encadenado).
 */
export async function createRectifyingInvoice(
  companyId,
  originalInvoiceId,
  correctionData,
) {
  const originalRef = tenantDoc(db, companyId, COLLECTION, originalInvoiceId);
  const originalSnap = await getDoc(originalRef);
  if (!originalSnap.exists()) throw new Error("La factura original no existe");
  const original = originalSnap.data();

  if (original.status === "draft") {
    throw new Error(
      "No se puede rectificar una factura en borrador. Emítela primero.",
    );
  }

  const method = correctionData.method || "I";
  const rectifyingItems =
    correctionData.items ||
    (method === "I"
      ? (original.items || []).map((item) => ({
          ...item,
          price: 0,
          taxableBase: 0,
          taxAmount: 0,
          surchargeAmount: 0,
          total: 0,
        }))
      : original.items);

  const rectifyingData = {
    invoiceNumber: "Borrador",
    status: "draft",
    invoiceType: correctionData.invoiceType || "R1",
    series: correctionData.series || "R",
    operationDate:
      correctionData.operationDate || original.operationDate || null,
    year: correctionData.year || original.year,
    month: correctionData.month || original.month,
    client: { ...original.client },
    items: rectifyingItems,
    subtotal:
      correctionData.subtotal ?? (method === "I" ? 0 : original.subtotal),
    taxRate: correctionData.taxRate ?? original.taxRate,
    taxAmount:
      correctionData.taxAmount ?? (method === "I" ? 0 : original.taxAmount),
    surchargeAmount:
      correctionData.surchargeAmount ??
      (method === "I" ? 0 : original.surchargeAmount || 0),
    totalAmount:
      correctionData.totalAmount ??
      (method === "I" ? 0 : original.totalAmount),
    taxBreakdown: method === "I" ? [] : original.taxBreakdown || [],
    paymentMethod: correctionData.paymentMethod || original.paymentMethod,
    issueDate: null,
    dueDate: null,
    rectifiesInvoiceId: originalInvoiceId,
    rectifiesInvoiceNumber: original.invoiceNumber,
    rectification: {
      invoiceType: correctionData.invoiceType || "R1",
      method,
      reason: correctionData.reason || "",
      rectifiedInvoiceId: originalInvoiceId,
      rectifiedInvoiceNumber: original.invoiceNumber,
      rectifiedIssueDate: original.issueDate || null,
      rectifiedBase:
        method === "S"
          ? Number(
              correctionData.rectifiedBase ?? original.subtotal ?? 0,
            )
          : null,
      rectifiedTax:
        method === "S"
          ? Number(
              correctionData.rectifiedTax ?? original.taxAmount ?? 0,
            )
          : null,
      rectifiedSurcharge:
        method === "S"
          ? Number(
              correctionData.rectifiedSurcharge ??
                original.surchargeAmount ??
                0,
            )
          : null,
    },
    createdAt: serverTimestamp(),
  };

  const newRef = await addDoc(tenantCollection(db, companyId, COLLECTION), rectifyingData);
  return newRef.id;
}

// ==================== VERIFACTU: QR ====================
/**
 * Construye la URL oficial de la AEAT para el código QR de verificación.
 * Formato: https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=X&numserie=X&fecha=DD-MM-YYYY&importe=X.XX
 */
export function buildVerifactuQrUrl(invoice, billingSettings) {
  const nif = encodeURIComponent(billingSettings?.nif || "B04843843");
  const numserie = encodeURIComponent(invoice.invoiceNumber || "");

  let fecha = "";
  if (invoice.issueDate) {
    const d = invoice.issueDate.toDate
      ? invoice.issueDate.toDate()
      : new Date(invoice.issueDate);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    fecha = `${dd}-${mm}-${yyyy}`;
  }

  const importe = parseFloat(invoice.totalAmount || 0).toFixed(2);

  return `https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=${nif}&numserie=${numserie}&fecha=${fecha}&importe=${importe}`;
}
