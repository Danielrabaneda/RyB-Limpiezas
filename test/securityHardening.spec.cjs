const { strict: assert } = require("node:assert");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} = require("firebase/firestore");
const fs = require("node:fs");

describe("Security hardening", function () {
  this.timeout(15000);
  let testEnv;

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
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await Promise.all([
        setDoc(doc(database, "users", "worker-a"), {
          companyId: "rayba",
          role: "operario",
          active: true,
          allowDirectTransfers: false,
        }),
        setDoc(doc(database, "users", "worker-b"), {
          companyId: "rayba",
          role: "operario",
          active: true,
          allowDirectTransfers: false,
        }),
        setDoc(doc(database, "companies", "rayba", "scheduledServices", "service-a"), {
          assignedUserId: "worker-a",
          status: "pending",
          taskName: "Portal",
        }),
        setDoc(doc(database, "companies", "rayba", "workdays", "workday-a"), {
          userId: "worker-a",
          date: "2026-08-13",
          startTime: "08:00",
          endTime: null,
          totalMinutes: 0,
          status: "active",
          currentCompanionId: null,
        }),
        setDoc(doc(database, "companies", "rayba", "dailyMileage", "mileage-a"), {
          userId: "worker-a",
          date: "2026-08-13",
          totalKm: 10,
          type: "manual",
        }),
        setDoc(doc(database, "companies", "rayba", "products", "product-a"), {
          name: "Producto",
        }),
        setDoc(doc(database, "companies", "rayba", "materialRequests", "request-a"), {
          userId: "worker-a",
          productId: "product-a",
          productName: "Producto",
          quantity: 1,
          status: "pending",
        }),
        setDoc(doc(database, "companies", "rayba", "systemNotifications", "notification-a"), {
          userId: "worker-a",
          title: "Aviso",
          read: false,
        }),
      ]);
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  function workerDatabase(uid) {
    return testEnv.authenticatedContext(uid, {
      companyId: "rayba",
      role: "operario",
      active: true,
    }).firestore();
  }

  it("prevents an unrelated worker from changing a scheduled service", async () => {
    const database = workerDatabase("worker-b");
    const ref = doc(database, "companies", "rayba", "scheduledServices", "service-a");
    await assertFails(updateDoc(ref, { assignedUserId: "worker-b" }));
    await assertFails(updateDoc(ref, { status: "completed" }));
  });

  it("allows an assigned worker to update only operational service fields", async () => {
    const database = workerDatabase("worker-a");
    const ref = doc(database, "companies", "rayba", "scheduledServices", "service-a");
    await assertSucceeds(updateDoc(ref, { status: "in_progress", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { taskName: "Manipulado" }));
    await assertFails(updateDoc(ref, {
      companionIds: ["worker-b"],
      participantIds: ["worker-b"],
      companionLogs: [],
    }));
    await assertFails(updateDoc(ref, { status: "pending", updatedAt: serverTimestamp() }));
  });

  it("allows the real workday and mileage payloads while rejecting inflated values", async () => {
    const database = workerDatabase("worker-a");
    const workdayRef = doc(database, "companies", "rayba", "workdays", "workday-new");
    await assertSucceeds(setDoc(workdayRef, {
      userId: "worker-a",
      userName: "Worker A",
      date: serverTimestamp(),
      startTime: serverTimestamp(),
      endTime: null,
      totalMinutes: 0,
      status: "active",
      currentCompanionId: null,
      createdAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(workdayRef, {
      endTime: serverTimestamp(),
      totalMinutes: 0,
      status: "completed",
      currentCompanionId: null,
    }));
    await assertFails(updateDoc(workdayRef, { totalMinutes: 10000 }));

    await assertSucceeds(addDoc(
      collection(database, "companies", "rayba", "dailyMileage"),
      {
        userId: "worker-a",
        userName: "Worker A",
        date: "2026-08-13",
        totalKm: 25,
        type: "manual",
      },
    ));
  });

  it("keeps workday and mileage ownership immutable", async () => {
    const database = workerDatabase("worker-a");
    await assertFails(updateDoc(
      doc(database, "companies", "rayba", "workdays", "workday-a"),
      { userId: "worker-b" },
    ));
    await assertFails(updateDoc(
      doc(database, "companies", "rayba", "dailyMileage", "mileage-a"),
      { userId: "worker-b", totalKm: 999 },
    ));
  });

  it("prevents workers from approving material requests", async () => {
    const database = workerDatabase("worker-a");
    await assertFails(updateDoc(
      doc(database, "companies", "rayba", "materialRequests", "request-a"),
      { status: "completed" },
    ));
  });

  it("allows a complete pending material request for an existing product", async () => {
    const database = workerDatabase("worker-a");
    await assertSucceeds(addDoc(
      collection(database, "companies", "rayba", "materialRequests"),
      {
        userId: "worker-a",
        productId: "product-a",
        productName: "Producto",
        quantity: 2,
        status: "pending",
        createdAt: serverTimestamp(),
      },
    ));
  });

  it("limits notification updates to marking the owner's notification read", async () => {
    const ownerDatabase = workerDatabase("worker-a");
    const ref = doc(ownerDatabase, "companies", "rayba", "systemNotifications", "notification-a");
    await assertSucceeds(updateDoc(ref, { read: true }));
    await assertFails(updateDoc(ref, { title: "Manipulado" }));

    const otherDatabase = workerDatabase("worker-b");
    await assertFails(updateDoc(
      doc(otherDatabase, "companies", "rayba", "systemNotifications", "notification-a"),
      { read: true },
    ));
  });

  it("prevents a transfer recipient from creating a request on behalf of its sender", async () => {
    const database = workerDatabase("worker-b");
    await assertFails(addDoc(collection(database, "companies", "rayba", "transfers"), {
      type: "single",
      status: "pending",
      fromUserId: "worker-a",
      toUserId: "worker-b",
      createdAt: serverTimestamp(),
    }));
  });

  it("allows the sender to create a pending transfer and link only its own service", async () => {
    const database = workerDatabase("worker-a");
    const transferRef = doc(collection(database, "companies", "rayba", "transfers"));
    const serviceRef = doc(database, "companies", "rayba", "scheduledServices", "service-a");
    const batch = writeBatch(database);
    batch.set(transferRef, {
      type: "single",
      status: "pending",
      fromUserId: "worker-a",
      toUserId: "worker-b",
      createdAt: serverTimestamp(),
    });
    batch.update(serviceRef, {
      transferId: transferRef.id,
      transferValidated: false,
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it("blocks direct public lead writes", async () => {
    const database = testEnv.unauthenticatedContext().firestore();
    await assertFails(addDoc(collection(database, "companyRequests"), {
      companyName: "Bot",
      contactName: "Bot",
      email: "bot@example.com",
      phone: "600000000",
    }));
  });

  it("leaves taskExecutions unchanged for the later hardening phase", async () => {
    const database = workerDatabase("worker-a");
    const ref = doc(database, "companies", "rayba", "taskExecutions", "execution-a");
    await assertSucceeds(setDoc(ref, { userId: "worker-b", completed: true }));
    assert.equal((await getDoc(ref)).data().completed, true);
  });
});
