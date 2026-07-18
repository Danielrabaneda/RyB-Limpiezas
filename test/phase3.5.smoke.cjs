const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, getDocs, collection, query, where, addDoc, runTransaction, serverTimestamp } = require('firebase/firestore');
const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');

async function computeInvoiceHash({
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

  return crypto.createHash('sha256').update(cadena).digest('hex').toUpperCase();
}

let testEnv;

describe('Phase 3.5: Smoke Test - Invoicing and Verifactu Flow', function () {
  this.timeout(15000);

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "demo-project",
      firestore: {
        host: "127.0.0.1",
        port: 8080,
        rules: fs.readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    // Setup basic data with rules disabled
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users", "raybaAdmin"), { companyId: "rayba", role: "admin", active: true });
      await setDoc(doc(db, "users", "tenantBAdmin"), { companyId: "tenantB", role: "admin", active: true });

      // Seed initial billing settings for Rayba
      await setDoc(doc(db, "companies", "rayba", "settings", "billing"), {
        nif: "B11111111",
        nextInvoiceSeq: 1,
        invoiceNumberFormat: "numeric",
        lastInvoiceHash: "",
        issueDateMode: "today"
      });
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('should execute the entire create -> emit -> chain -> batch emit cycle successfully under tenant rules', async () => {
    const adminDb = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();

    // 1. Create a draft invoice
    const invRef = doc(adminDb, "companies", "rayba", "invoices", "inv1");
    await assertSucceeds(setDoc(invRef, {
      status: "draft",
      totalAmount: 120.00,
      taxAmount: 25.20,
      year: 2026,
      month: 7,
      createdAt: serverTimestamp()
    }));

    // 2. Emit the invoice (simulating emitInvoice)
    const settingsRef = doc(adminDb, "companies", "rayba", "settings", "billing");
    await assertSucceeds(runTransaction(adminDb, async (transaction) => {
      const [invSnap, setSnap] = await Promise.all([
        transaction.get(invRef),
        transaction.get(settingsRef)
      ]);

      const data = invSnap.data();
      const settings = setSnap.data();
      const seq = settings.nextInvoiceSeq;
      const prevHash = settings.lastInvoiceHash || "";
      const hash = await computeInvoiceHash({
        idEmisorFactura: settings.nif,
        numSerieFactura: String(seq),
        fechaExpedicionFactura: "18-07-2026",
        tipoFactura: "F1",
        cuotaTotal: parseFloat(data.taxAmount).toFixed(2),
        importeTotal: parseFloat(data.totalAmount).toFixed(2),
        huellaAnterior: prevHash,
        fechaHoraHusoGenRegistro: new Date().toISOString()
      });

      transaction.update(invRef, {
        status: "pending",
        invoiceNumber: String(seq),
        invoiceSeq: seq,
        hash: hash,
        previousHash: prevHash
      });

      transaction.update(settingsRef, {
        nextInvoiceSeq: seq + 1,
        lastInvoiceHash: hash
      });
    }));

    // Check single emission outputs
    const invSnap = await getDoc(invRef);
    const settingsSnap = await getDoc(settingsRef);

    assert.strictEqual(invSnap.data().status, "pending");
    assert.strictEqual(invSnap.data().invoiceSeq, 1);
    assert.strictEqual(invSnap.data().previousHash, "");
    assert.strictEqual(settingsSnap.data().nextInvoiceSeq, 2);
    const firstHash = invSnap.data().hash;
    assert.strictEqual(settingsSnap.data().lastInvoiceHash, firstHash);

    // 3. Batch emission of 2 more drafts (deterministic sequence)
    const invRefA = doc(adminDb, "companies", "rayba", "invoices", "invA");
    const invRefB = doc(adminDb, "companies", "rayba", "invoices", "invB");

    // invB created at 10:00, invA created at 11:00. invB should be sequenced first.
    await setDoc(invRefA, { status: "draft", totalAmount: 50.00, taxAmount: 10.50, year: 2026, month: 7, createdAt: new Date(2026, 6, 18, 11, 0, 0) });
    await setDoc(invRefB, { status: "draft", totalAmount: 80.00, taxAmount: 16.80, year: 2026, month: 7, createdAt: new Date(2026, 6, 18, 10, 0, 0) });

    await assertSucceeds(runTransaction(adminDb, async (transaction) => {
      const setSnap = await transaction.get(settingsRef);
      const settings = setSnap.data();
      let nextSeq = settings.nextInvoiceSeq;
      let chainHash = settings.lastInvoiceHash || "";

      const list = [
        { ref: invRefA, snap: await transaction.get(invRefA) },
        { ref: invRefB, snap: await transaction.get(invRefB) }
      ];

      // Deterministic sort: invB (10:00) then invA (11:00)
      list.sort((a, b) => {
        const tA = a.snap.data().createdAt?.toDate ? a.snap.data().createdAt.toDate().getTime() : new Date(a.snap.data().createdAt || 0).getTime();
        const tB = b.snap.data().createdAt?.toDate ? b.snap.data().createdAt.toDate().getTime() : new Date(b.snap.data().createdAt || 0).getTime();
        if (tA !== tB) return tA - tB;
        return a.snap.id.localeCompare(b.snap.id);
      });

      for (const item of list) {
        const data = item.snap.data();
        const num = String(nextSeq);
        const hash = await computeInvoiceHash({
          idEmisorFactura: settings.nif,
          numSerieFactura: num,
          fechaExpedicionFactura: "18-07-2026",
          tipoFactura: "F1",
          cuotaTotal: parseFloat(data.taxAmount).toFixed(2),
          importeTotal: parseFloat(data.totalAmount).toFixed(2),
          huellaAnterior: chainHash,
          fechaHoraHusoGenRegistro: new Date().toISOString()
        });

        transaction.update(item.ref, {
          status: "pending",
          invoiceNumber: num,
          invoiceSeq: nextSeq,
          hash: hash,
          previousHash: chainHash
        });

        chainHash = hash;
        nextSeq++;
      }

      transaction.update(settingsRef, {
        nextInvoiceSeq: nextSeq,
        lastInvoiceHash: chainHash
      });
    }));

    // Verify batch results
    const snapA = await getDoc(invRefA);
    const snapB = await getDoc(invRefB);
    const finalSettings = await getDoc(settingsRef);

    // invB was first (seq 2), invA was second (seq 3)
    assert.strictEqual(snapB.data().invoiceSeq, 2);
    assert.strictEqual(snapA.data().invoiceSeq, 3);

    // Hash chaining check
    assert.strictEqual(snapB.data().previousHash, firstHash);
    assert.strictEqual(snapA.data().previousHash, snapB.data().hash);
    assert.strictEqual(finalSettings.data().nextInvoiceSeq, 4);
    assert.strictEqual(finalSettings.data().lastInvoiceHash, snapA.data().hash);
  });
});
