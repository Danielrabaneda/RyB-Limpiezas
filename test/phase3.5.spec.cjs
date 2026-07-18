const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, getDocs, collection, query, where, addDoc, runTransaction, serverTimestamp } = require('firebase/firestore');
const fs = require('fs');
const assert = require('assert');

// Mock computeInvoiceHash to verify chained hash computation
// identical to the real implementation but using crypto in Node environment
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

describe('Phase 3.5: Invoices and Billing Aislados + Verifactu', function () {
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
      
      // Create users (auth profile mock)
      await setDoc(doc(db, "users", "raybaAdmin"), { companyId: "rayba", role: "admin", active: true });
      await setDoc(doc(db, "users", "tenantBAdmin"), { companyId: "tenantB", role: "admin", active: true });
      await setDoc(doc(db, "users", "raybaOperario"), { companyId: "rayba", role: "operario", active: true });

      // Seed billing settings for both tenants
      await setDoc(doc(db, "companies", "rayba", "settings", "billing"), {
        nif: "B11111111",
        nextInvoiceSeq: 1,
        invoiceNumberFormat: "numeric",
        lastInvoiceHash: "",
        issueDateMode: "today"
      });

      await setDoc(doc(db, "companies", "tenantB", "settings", "billing"), {
        nif: "B22222222",
        nextInvoiceSeq: 100, // Starts at 100 to differentiate easily
        invoiceNumberFormat: "numeric",
        lastInvoiceHash: "",
        issueDateMode: "today"
      });

      // Seed global settings
      await setDoc(doc(db, "companies", "rayba", "settings", "global"), { companyName: "Limpiezas Rayba S.L" });
      await setDoc(doc(db, "companies", "tenantB", "settings", "global"), { companyName: "Tenant B S.L" });
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  describe('Security Rules and Cross-Tenant Restrictions', () => {
    it('should ALLOW Rayba admin to read and write Rayba invoices and billing settings', async () => {
      const db = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      
      const invoiceRef = doc(db, "companies", "rayba", "invoices", "inv1");
      await assertSucceeds(setDoc(invoiceRef, { status: "draft", totalAmount: 150, year: 2026, month: 7 }));
      await assertSucceeds(getDoc(invoiceRef));

      const billingRef = doc(db, "companies", "rayba", "settings", "billing");
      await assertSucceeds(getDoc(billingRef));
    });

    it('should DENY Rayba admin to read or write Tenant B invoices, settings or templates', async () => {
      const db = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      
      const bInvoiceRef = doc(db, "companies", "tenantB", "invoices", "invB1");
      await assertFails(setDoc(bInvoiceRef, { status: "draft", totalAmount: 150 }));
      await assertFails(getDoc(bInvoiceRef));

      const bBillingRef = doc(db, "companies", "tenantB", "settings", "billing");
      await assertFails(getDoc(bBillingRef));

      const bTemplateRef = doc(db, "companies", "tenantB", "invoice_templates", "tmplB1");
      await assertFails(setDoc(bTemplateRef, { name: "Template B" }));
      await assertFails(getDoc(bTemplateRef));
    });

    it('should DENY Rayba operario to read or write Rayba invoices or billing settings', async () => {
      const db = testEnv.authenticatedContext("raybaOperario", { companyId: "rayba", role: "operario", active: true }).firestore();
      
      const invoiceRef = doc(db, "companies", "rayba", "invoices", "inv1");
      await assertFails(getDoc(invoiceRef));

      const billingRef = doc(db, "companies", "rayba", "settings", "billing");
      await assertFails(getDoc(billingRef));
    });
  });

  describe('Independent Sequence and Hash Chaining', () => {
    it('should generate independent sequence numbers and hashes for each tenant', async () => {
      // 1. Rayba Admin emite una factura (debe ser #1)
      const raybaDb = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      const rInvRef = doc(raybaDb, "companies", "rayba", "invoices", "invR1");
      
      await setDoc(rInvRef, {
        status: "draft",
        totalAmount: 100.00,
        taxAmount: 21.00,
        year: 2026,
        month: 7,
        createdAt: new Date()
      });

      // Simular emitInvoice para rayba (transacción)
      const settingsRefRayba = doc(raybaDb, "companies", "rayba", "settings", "billing");
      await runTransaction(raybaDb, async (transaction) => {
        const [invSnap, setSnap] = await Promise.all([
          transaction.get(rInvRef),
          transaction.get(settingsRefRayba)
        ]);
        const settings = setSnap.data();
        const seq = settings.nextInvoiceSeq;
        const previousHash = settings.lastInvoiceHash || "";
        const hash = await computeInvoiceHash({
          idEmisorFactura: settings.nif,
          numSerieFactura: String(seq),
          fechaExpedicionFactura: "18-07-2026",
          tipoFactura: "F1",
          cuotaTotal: "21.00",
          importeTotal: "100.00",
          huellaAnterior: previousHash,
          fechaHoraHusoGenRegistro: new Date().toISOString()
        });

        transaction.update(rInvRef, {
          status: "pending",
          invoiceNumber: String(seq),
          invoiceSeq: seq,
          hash: hash,
          previousHash: previousHash
        });

        transaction.update(settingsRefRayba, {
          nextInvoiceSeq: seq + 1,
          lastInvoiceHash: hash
        });
      });

      // 2. Tenant B Admin emite una factura (debe ser #100 y tener hash chain independiente)
      const bDb = testEnv.authenticatedContext("tenantBAdmin", { companyId: "tenantB", role: "admin", active: true }).firestore();
      const bInvRef = doc(bDb, "companies", "tenantB", "invoices", "invB1");
      
      await setDoc(bInvRef, {
        status: "draft",
        totalAmount: 200.00,
        taxAmount: 42.00,
        year: 2026,
        month: 7,
        createdAt: new Date()
      });

      const settingsRefB = doc(bDb, "companies", "tenantB", "settings", "billing");
      await runTransaction(bDb, async (transaction) => {
        const [invSnap, setSnap] = await Promise.all([
          transaction.get(bInvRef),
          transaction.get(settingsRefB)
        ]);
        const settings = setSnap.data();
        const seq = settings.nextInvoiceSeq;
        const previousHash = settings.lastInvoiceHash || "";
        const hash = await computeInvoiceHash({
          idEmisorFactura: settings.nif,
          numSerieFactura: String(seq),
          fechaExpedicionFactura: "18-07-2026",
          tipoFactura: "F1",
          cuotaTotal: "42.00",
          importeTotal: "200.00",
          huellaAnterior: previousHash,
          fechaHoraHusoGenRegistro: new Date().toISOString()
        });

        transaction.update(bInvRef, {
          status: "pending",
          invoiceNumber: String(seq),
          invoiceSeq: seq,
          hash: hash,
          previousHash: previousHash
        });

        transaction.update(settingsRefB, {
          nextInvoiceSeq: seq + 1,
          lastInvoiceHash: hash
        });
      });

      // 3. Verificaciones de independencia
      const raybaInvoice = (await getDoc(rInvRef)).data();
      const bInvoice = (await getDoc(bInvRef)).data();

      assert.strictEqual(raybaInvoice.invoiceSeq, 1);
      assert.strictEqual(bInvoice.invoiceSeq, 100);
      assert.strictEqual(raybaInvoice.previousHash, "");
      assert.strictEqual(bInvoice.previousHash, "");
      assert.notStrictEqual(raybaInvoice.hash, bInvoice.hash);

      const settingsRayba = (await getDoc(settingsRefRayba)).data();
      const settingsB = (await getDoc(settingsRefB)).data();
      assert.strictEqual(settingsRayba.nextInvoiceSeq, 2);
      assert.strictEqual(settingsB.nextInvoiceSeq, 101);
    });
  });

  describe('Deterministic Ordering and Chaining in emitAllInvoices', () => {
    it('should sort drafts deterministically and chain hashes sequentially', async () => {
      const raybaDb = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      
      // Seed 3 draft invoices with distinct created times
      const rRef1 = doc(raybaDb, "companies", "rayba", "invoices", "invSorted1");
      const rRef2 = doc(raybaDb, "companies", "rayba", "invoices", "invSorted2");
      const rRef3 = doc(raybaDb, "companies", "rayba", "invoices", "invSorted3");

      await setDoc(rRef1, { status: "draft", totalAmount: 10.00, taxAmount: 2.10, year: 2026, month: 7, createdAt: new Date(2026, 6, 18, 10, 0, 0) });
      await setDoc(rRef2, { status: "draft", totalAmount: 20.00, taxAmount: 4.20, year: 2026, month: 7, createdAt: new Date(2026, 6, 18, 9, 0, 0) }); // Older, should be processed first
      await setDoc(rRef3, { status: "draft", totalAmount: 30.00, taxAmount: 6.30, year: 2026, month: 7, createdAt: new Date(2026, 6, 18, 11, 0, 0) });

      const settingsRef = doc(raybaDb, "companies", "rayba", "settings", "billing");

      await runTransaction(raybaDb, async (transaction) => {
        const settingsSnap = await transaction.get(settingsRef);
        const settings = settingsSnap.data();
        let nextSeq = settings.nextInvoiceSeq;
        let chainHash = settings.lastInvoiceHash || "";

        const list = [
          { ref: rRef1, snap: await transaction.get(rRef1) },
          { ref: rRef2, snap: await transaction.get(rRef2) },
          { ref: rRef3, snap: await transaction.get(rRef3) }
        ];

        // Ordenar deterministamente: invSorted2 (9:00) -> invSorted1 (10:00) -> invSorted3 (11:00)
        list.sort((a, b) => {
          const tA = a.snap.data().createdAt.toDate().getTime();
          const tB = b.snap.data().createdAt.toDate().getTime();
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
            fechaHoraHusoGenRegistro: "2026-07-18T13:00:00Z"
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
      });

      // Verify correct order sequence assignments
      const snap1 = (await getDoc(rRef1)).data(); // Middle (createdAt 10:00) -> seq 2
      const snap2 = (await getDoc(rRef2)).data(); // Oldest (createdAt 9:00) -> seq 1
      const snap3 = (await getDoc(rRef3)).data(); // Newest (createdAt 11:00) -> seq 3

      assert.strictEqual(snap2.invoiceSeq, 1);
      assert.strictEqual(snap1.invoiceSeq, 2);
      assert.strictEqual(snap3.invoiceSeq, 3);

      // Verify hash chaining
      assert.strictEqual(snap2.previousHash, "");
      assert.strictEqual(snap1.previousHash, snap2.hash);
      assert.strictEqual(snap3.previousHash, snap1.hash);
    });
  });

  describe('Transactional Rollback', () => {
    it('should roll back completely on failure in emitAllInvoices', async () => {
      const raybaDb = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      
      const rRef1 = doc(raybaDb, "companies", "rayba", "invoices", "invRoll1");
      const rRefInvalid = doc(raybaDb, "companies", "rayba", "invoices", "invRollInvalid");

      await setDoc(rRef1, { status: "draft", totalAmount: 10.00, taxAmount: 2.10, year: 2026, month: 7, createdAt: new Date() });
      // invRollInvalid has no data seeded, get will return non-existing snap!

      const settingsRef = doc(raybaDb, "companies", "rayba", "settings", "billing");

      let transactionFailed = false;
      try {
        await runTransaction(raybaDb, async (transaction) => {
          const settingsSnap = await transaction.get(settingsRef);
          const settings = settingsSnap.data();
          let nextSeq = settings.nextInvoiceSeq;
          let chainHash = settings.lastInvoiceHash || "";

          const list = [
            { ref: rRef1, snap: await transaction.get(rRef1) },
            { ref: rRefInvalid, snap: await transaction.get(rRefInvalid) }
          ];

          for (const item of list) {
            if (!item.snap.exists()) throw new Error("Document does not exist");
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
              fechaHoraHusoGenRegistro: "2026-07-18T13:00:00Z"
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
        });
      } catch (e) {
        transactionFailed = true;
      }

      assert.ok(transactionFailed);

      // Verify that NO partial mutations were persisted!
      const invoice1Data = (await getDoc(rRef1)).data();
      assert.strictEqual(invoice1Data.status, "draft");
      assert.strictEqual(invoice1Data.invoiceNumber, undefined);

      const settingsData = (await getDoc(settingsRef)).data();
      assert.strictEqual(settingsData.nextInvoiceSeq, 1);
      assert.strictEqual(settingsData.lastInvoiceHash, "");
    });
  });

  describe('Concurrency & Lock Serialization', () => {
    it('should assign sequential unique invoice numbers without gaps or overlaps under concurrency', async () => {
      const raybaDb = testEnv.authenticatedContext("raybaAdmin", { companyId: "rayba", role: "admin", active: true }).firestore();
      const settingsRef = doc(raybaDb, "companies", "rayba", "settings", "billing");

      // Seed 5 drafts
      const count = 5;
      const refs = [];
      for (let i = 1; i <= count; i++) {
        const ref = doc(raybaDb, "companies", "rayba", "invoices", `invConc${i}`);
        await setDoc(ref, { status: "draft", totalAmount: 10.00, taxAmount: 2.10, year: 2026, month: 7, createdAt: new Date() });
        refs.push(ref);
      }

      // Execute 5 concurrent transaction updates
      // Each transaction will try to get the billing settings, assign a sequence and update it.
      // Firestore transactions are designed to retry and serialize if conflicts occur.
      const promises = refs.map((ref) => {
        return runTransaction(raybaDb, async (transaction) => {
          const [invSnap, setSnap] = await Promise.all([
            transaction.get(ref),
            transaction.get(settingsRef)
          ]);
          const settings = setSnap.data();
          const seq = settings.nextInvoiceSeq;
          const previousHash = settings.lastInvoiceHash || "";
          
          const hash = await computeInvoiceHash({
            idEmisorFactura: settings.nif,
            numSerieFactura: String(seq),
            fechaExpedicionFactura: "18-07-2026",
            tipoFactura: "F1",
            cuotaTotal: "2.10",
            importeTotal: "10.00",
            huellaAnterior: previousHash,
            fechaHoraHusoGenRegistro: new Date().toISOString()
          });

          transaction.update(ref, {
            status: "pending",
            invoiceNumber: String(seq),
            invoiceSeq: seq,
            hash: hash,
            previousHash: previousHash
          });

          transaction.update(settingsRef, {
            nextInvoiceSeq: seq + 1,
            lastInvoiceHash: hash
          });
        });
      });

      await Promise.all(promises);

      // Verify final results:
      // Sequences should be unique and correlative from 1 to 5
      const docsData = await Promise.all(refs.map(async (ref) => (await getDoc(ref)).data()));
      const sequences = docsData.map(d => d.invoiceSeq).sort((a, b) => a - b);
      
      assert.deepStrictEqual(sequences, [1, 2, 3, 4, 5]);

      const finalSettings = (await getDoc(settingsRef)).data();
      assert.strictEqual(finalSettings.nextInvoiceSeq, 6);
      assert.notStrictEqual(finalSettings.lastInvoiceHash, "");
    });
  });
});
