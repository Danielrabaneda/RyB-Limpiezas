import { 
  collection, doc, addDoc, updateDoc, getDocs, getDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, runTransaction, setDoc,
  writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../config/firebase';
import { getCommunities } from './communityService';

const COLLECTION = 'invoices';

// ==================== BILLING SETTINGS ====================
const DEFAULT_SETTINGS = {
  companyName: "Limpiezas Rayba S.L",
  nif: "B04843843",
  address: "C/ Ilusión Nº6, 5Esc. 3º A, ALCANTARILLA, 30820",
  phone: "687983162",
  contactPerson: "Daniel Rabaneda",
  inscriptionText: "Limpiezas Rayba S.L ha sido inscrita en el Registro Mercantil de Almería al tomo 1792, folio 20, inscripción 1 con hoja AL-46180",
  logoBase64: "",
  logoWidth: 45,
  logoHeight: 20,
  bankAccount: "",
  nextInvoiceSeq: 1,
  invoiceNumberFormat: 'numeric', // 'numeric' (59, 60...) or 'formatted' (F-2026-0059...)
  fileNamePattern: 'Factura_{numero}_{comunidad}',
  useSaveAsDialog: false,
  seqMode: 'manual',
  issueDateMode: 'today',
  customIssueDate: '',
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpEmail: '',
  smtpPassword: '',
  emailSubjectTemplate: 'Factura {numero} - RyB Limpiezas',
  emailBodyTemplate: '<p>Hola,</p><p>Le adjuntamos la factura <strong>{numero}</strong> correspondiente al servicio de limpieza de la comunidad <strong>{comunidad}</strong>.</p><p>Atentamente,<br/>RyB Limpiezas</p>',
  sepaSuffix: '000'
};

export async function getBillingSettings() {
  const ref = doc(db, 'settings', 'billing');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // Save defaults
    await setDoc(ref, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...snap.data() };
}

export async function saveBillingSettings(data) {
  const ref = doc(db, 'settings', 'billing');
  await setDoc(ref, data, { merge: true });
}

// ==================== INVOICE CRUD ====================
export async function getInvoices(year, month) {
  let q = query(
    collection(db, COLLECTION),
    where('year', '==', parseInt(year)),
    where('month', '==', parseInt(month)),
    orderBy('createdAt', 'desc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createInvoice(data) {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateInvoice(id, data) {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteInvoice(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function deleteMultipleInvoices(ids) {
  if (!ids || ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.delete(doc(db, COLLECTION, id));
  }
  await batch.commit();
}

// Get the next invoice number for display/preview purposes
export async function getNextInvoiceNumber(year) {
  const settings = await getBillingSettings();
  const nextSeq = parseInt(settings.nextInvoiceSeq) || 1;
  const fmt = settings.invoiceNumberFormat || 'numeric';
  
  if (fmt === 'formatted') {
    return `F-${year}-${String(nextSeq).padStart(4, '0')}`;
  }
  return String(nextSeq);
}

// Emit Invoice: Change status from draft to pending, assign number atomically
export async function emitInvoice(id) {
  const invoiceRef = doc(db, COLLECTION, id);
  const settingsRef = doc(db, 'settings', 'billing');
  
  await runTransaction(db, async (transaction) => {
    const [invoiceSnap, settingsSnap] = await Promise.all([
      transaction.get(invoiceRef),
      transaction.get(settingsRef)
    ]);
    
    if (!invoiceSnap.exists()) throw new Error("La factura no existe");
    const data = invoiceSnap.data();
    if (data.status !== 'draft') throw new Error("Solo se pueden emitir facturas en borrador");
    
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    const nextSeq = parseInt(settings.nextInvoiceSeq) || 1;
    const fmt = settings.invoiceNumberFormat || 'numeric';
    
    let invoiceNumber;
    if (fmt === 'formatted') {
      invoiceNumber = `F-${data.year}-${String(nextSeq).padStart(4, '0')}`;
    } else {
      invoiceNumber = String(nextSeq);
    }
    
    let issueDate;
    if (settings.issueDateMode === 'custom' && settings.customIssueDate) {
      issueDate = new Date(settings.customIssueDate + 'T00:00:00');
    } else {
      issueDate = new Date();
    }
    const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Update invoice with assigned number
    transaction.update(invoiceRef, {
      status: 'pending',
      invoiceNumber: invoiceNumber,
      invoiceSeq: nextSeq,
      issueDate: issueDate,
      dueDate: dueDate
    });
    
    // Increment sequence counter atomically
    transaction.update(settingsRef, {
      nextInvoiceSeq: nextSeq + 1
    });
  });
}

// Mark invoice as Paid
export async function updateInvoiceStatus(id, status) {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, {
    status,
    updatedAt: serverTimestamp()
  });
}

// ==================== AUTO GENERATE DRAFTS ====================
export async function generateMonthlyDrafts(month, year) {
  const [comms, existing] = await Promise.all([
    getCommunities(),
    getInvoices(year, month)
  ]);
  
  // Filter communities that have a base price greater than 0
  const activeComms = comms.filter(c => c.active && (c.basePrice || 0) > 0);
  
  // Find communities that don't have an invoice for this period
  const commsToInvoice = activeComms.filter(
    c => !existing.some(inv => inv.client.communityId === c.id)
  );
  
  if (commsToInvoice.length === 0) {
    return 0; // No new drafts created
  }
  
  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
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
        administratorId: comm.administratorId || ""
      },
      items: [
        {
          description: `Limpieza de comunidad mes de ${periodLabel}`,
          quantity: 1,
          price: base,
          total: base
        }
      ],
      subtotal: base,
      taxRate: taxRate,
      taxAmount: taxAmount,
      totalAmount: totalAmount,
      paymentMethod: comm.paymentMethod || "transferencia",
      issueDate: null,
      dueDate: null,
      createdAt: serverTimestamp()
    };
    
    await addDoc(collection(db, COLLECTION), invoiceData);
    count++;
  }
  
  return count;
}

// ==================== INVOICE TEMPLATES ====================
export async function getInvoiceTemplates() {
  const q = query(collection(db, 'invoice_templates'), orderBy('name', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveInvoiceTemplate(data) {
  const q = query(collection(db, 'invoice_templates'), where('name', '==', data.name));
  const snap = await getDocs(q);
  
  const templateData = {
    ...data,
    updatedAt: serverTimestamp()
  };
  
  if (!snap.empty) {
    const docRef = doc(db, 'invoice_templates', snap.docs[0].id);
    await updateDoc(docRef, templateData);
    return snap.docs[0].id;
  } else {
    templateData.createdAt = serverTimestamp();
    const docRef = await addDoc(collection(db, 'invoice_templates'), templateData);
    return docRef.id;
  }
}

export async function deleteInvoiceTemplate(id) {
  await deleteDoc(doc(db, 'invoice_templates', id));
}

// Get the last emitted invoice ordered by invoiceSeq descending
export async function getLastEmittedInvoice() {
  const q = query(
    collection(db, COLLECTION),
    orderBy('invoiceSeq', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// Emit multiple invoices at once atomically using a single transaction
export async function emitAllInvoices(ids) {
  if (!ids || ids.length === 0) return;
  const settingsRef = doc(db, 'settings', 'billing');
  
  await runTransaction(db, async (transaction) => {
    const settingsSnap = await transaction.get(settingsRef);
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    let nextSeq = parseInt(settings.nextInvoiceSeq) || 1;
    const fmt = settings.invoiceNumberFormat || 'numeric';
    
    const invoiceSnaps = [];
    for (const id of ids) {
      const ref = doc(db, COLLECTION, id);
      const snap = await transaction.get(ref);
      invoiceSnaps.push({ ref, snap });
    }
    
    let issueDate;
    if (settings.issueDateMode === 'custom' && settings.customIssueDate) {
      issueDate = new Date(settings.customIssueDate + 'T00:00:00');
    } else {
      issueDate = new Date();
    }
    const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    for (const { ref, snap } of invoiceSnaps) {
      if (!snap.exists()) throw new Error("Una de las facturas no existe");
      const data = snap.data();
      if (data.status !== 'draft') throw new Error("Solo se pueden emitir facturas en borrador");
      
      let invoiceNumber;
      if (fmt === 'formatted') {
        invoiceNumber = `F-${data.year}-${String(nextSeq).padStart(4, '0')}`;
      } else {
        invoiceNumber = String(nextSeq);
      }
      
      transaction.update(ref, {
        status: 'pending',
        invoiceNumber: invoiceNumber,
        invoiceSeq: nextSeq,
        issueDate: issueDate,
        dueDate: dueDate
      });
      
      nextSeq++;
    }
    
    transaction.update(settingsRef, {
      nextInvoiceSeq: nextSeq
    });
  });
}

export async function uploadInvoicePDFToStorage(invoiceId, pdfBlob, filename) {
  const path = `invoices/${invoiceId}/${filename}`;
  const storageRef = ref(storage, path);
  const metadata = {
    contentType: 'application/pdf'
  };
  await uploadBytes(storageRef, pdfBlob, metadata);
  const url = await getDownloadURL(storageRef);
  return url;
}

export async function sendInvoiceEmails(invoiceIds) {
  const fn = httpsCallable(functions, 'sendInvoiceEmails');
  const result = await fn({ invoiceIds });
  return result.data;
}

export async function sendGroupedInvoiceEmails(invoiceIds) {
  const fn = httpsCallable(functions, 'sendGroupedInvoiceEmails');
  const result = await fn({ invoiceIds });
  return result.data;
}

