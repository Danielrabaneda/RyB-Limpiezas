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
  runTransaction,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { getAllUsers } from "./authService";
import { createSystemNotification } from "./notificationService";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";

// ==================== PRODUCT CATALOG ====================
export async function getProducts(companyId) {
  const q = query(tenantCollection(db, companyId, "products"), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createProduct(companyId, data) {
  const ref = await addDoc(tenantCollection(db, companyId, "products"), {
    name: data.name,
    unit: data.unit || "uds", // uds, litros, paquetes...
    category: data.category || "general",
    currentStock: 0,
    minStock: parseFloat(data.minStock) || 0,
    createdAt: serverTimestamp(),
  });
  return {
    id: ref.id,
    ...data,
    currentStock: 0,
    minStock: parseFloat(data.minStock) || 0,
  };
}

export async function updateProduct(companyId, id, data) {
  const ref = tenantDoc(db, companyId, "products", id);
  await updateDoc(ref, {
    name: data.name,
    unit: data.unit,
    minStock: parseFloat(data.minStock) || 0,
    category: data.category || "general",
  });
}

export async function deleteProduct(companyId, id) {
  await deleteDoc(tenantDoc(db, companyId, "products", id));
}

// ==================== MATERIAL REQUESTS ====================
export async function createMaterialRequest(companyId, data) {
  // Validar pertenencia del producto al tenant antes de crear
  const productRef = tenantDoc(db, companyId, "products", data.productId);
  const productSnap = await getDoc(productRef);
  if (!productSnap.exists()) {
    throw new Error("El producto solicitado no pertenece a este tenant o no existe.");
  }

  const ref = await addDoc(tenantCollection(db, companyId, "materialRequests"), {
    userId: data.userId,
    communityId: data.communityId,
    productId: data.productId,
    productName: data.productName, // Desnormalizado para facilitar lectura
    quantity: parseFloat(data.quantity) || 1,
    unit: data.unit,
    status: "pending", // pending, completed, cancelled
    notes: data.notes || "",
    createdAt: serverTimestamp(),
  });

  // Enviar notificación a todos los administradores
  try {
    const allUsers = await getAllUsers(companyId);
    const operario = allUsers.find((u) => u.uid === data.userId);
    const operarioName = operario
      ? operario.name || operario.displayName || "Un operario"
      : "Un operario";

    const admins = allUsers.filter((u) => u.role === "admin");

    for (const admin of admins) {
      await createSystemNotification(
        companyId,
        admin.uid,
        "📦 Nuevo Pedido de Material",
        `${operarioName} ha solicitado ${data.quantity}x ${data.productName}`,
        "info",
        null, // serviceId
        "/admin/inventory", // targetUrl
      );
    }
  } catch (err) {
    console.error(
      "[MaterialService] Error enviando notificaciones a admins:",
      err,
    );
  }

  return ref.id;
}

export async function getMaterialRequests(companyId, filters = {}) {
  let q = tenantCollection(db, companyId, "materialRequests");

  if (filters.status) {
    q = query(q, where("status", "==", filters.status));
  }

  // Como no queremos líos con índices compuestos ahora, ordenamos en memoria si es necesario
  // pero Firestore requiere orderBy si hay rangos, usaremos la consulta base:
  const queryFinal = query(q, orderBy("createdAt", "desc"));

  const snap = await getDocs(queryFinal);
  let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.userId)
    results = results.filter((r) => r.userId === filters.userId);
  if (filters.communityId)
    results = results.filter((r) => r.communityId === filters.communityId);

  return results;
}

export async function updateRequestStatus(
  companyId,
  requestId,
  status,
  adminId = "admin",
  adminName = "Admin",
) {
  const requestRef = tenantDoc(db, companyId, "materialRequests", requestId);

  if (status === "completed") {
    // Si se completa, descontar stock usando transacción
    await runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists()) {
        throw new Error("El pedido no existe!");
      }
      const requestData = requestSnap.data();

      // Si ya estaba completado, no hacer nada para evitar doble descuento
      if (requestData.status === "completed") return;

      const productRef = tenantDoc(db, companyId, "products", requestData.productId);
      const productSnap = await transaction.get(productRef);

      if (!productSnap.exists()) {
        throw new Error("El producto ya no pertenece a este tenant o no existe!");
      }

      const productData = productSnap.data();
      const currentStock = productData.currentStock || 0;
      const quantityToDeduct = parseFloat(requestData.quantity) || 0;
      const newStock = currentStock - quantityToDeduct;

      // 1. Actualizar stock del producto
      transaction.update(productRef, { currentStock: newStock });

      // 2. Registrar movimiento de stock
      const movementRef = tenantDoc(tenantCollection(db, companyId, "stockMovements"));
      transaction.set(movementRef, {
        productId: requestData.productId,
        productName: requestData.productName || productData.name,
        type: "out",
        quantity: quantityToDeduct,
        previousStock: currentStock,
        newStock: newStock,
        date: serverTimestamp(),
        userId: requestData.userId, // El operario que recibe
        adminId: adminId, // Admin que entrega
        referenceId: requestId,
        notes: `Entregado pedido de material a operario`,
      });

      // 3. Actualizar estado del pedido
      transaction.update(requestRef, {
        status,
        updatedAt: serverTimestamp(),
      });
    });
  } else {
    // Para otros estados (pending, cancelled), simplemente actualizar el doc
    await updateDoc(requestRef, {
      status,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function deleteMaterialRequest(companyId, id) {
  await deleteDoc(tenantDoc(db, companyId, "materialRequests", id));
}

// ==================== STOCK MANAGEMENT ====================

export async function addStock(
  companyId,
  productId,
  productName,
  quantity,
  adminId,
  adminName,
  notes = "",
) {
  const productRef = tenantDoc(db, companyId, "products", productId);

  await runTransaction(db, async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) {
      throw new Error("El producto no pertenece a este tenant o no existe!");
    }

    const productData = productSnap.data();
    const currentStock = productData.currentStock || 0;
    const addedQuantity = parseFloat(quantity) || 0;
    const newStock = currentStock + addedQuantity;

    // 1. Update product stock
    transaction.update(productRef, { currentStock: newStock });

    // 2. Log movement
    const movementRef = tenantDoc(tenantCollection(db, companyId, "stockMovements"));
    transaction.set(movementRef, {
      productId,
      productName: productName || productData.name,
      type: "in",
      quantity: addedQuantity,
      previousStock: currentStock,
      newStock: newStock,
      date: serverTimestamp(),
      userId: adminId, // Admin receiving the stock
      userName: adminName,
      notes: notes || "Entrada de proveedor",
    });
  });
}

export async function adjustStock(
  companyId,
  productId,
  productName,
  newStock,
  adminId,
  adminName,
  notes = "",
) {
  const productRef = tenantDoc(db, companyId, "products", productId);

  await runTransaction(db, async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists()) {
      throw new Error("El producto no pertenece a este tenant o no existe!");
    }

    const productData = productSnap.data();
    const currentStock = productData.currentStock || 0;
    const finalStock = parseFloat(newStock) || 0;
    const difference = finalStock - currentStock; // can be negative

    // 1. Update product stock
    transaction.update(productRef, { currentStock: finalStock });

    // 2. Log movement
    const movementRef = tenantDoc(tenantCollection(db, companyId, "stockMovements"));
    transaction.set(movementRef, {
      productId,
      productName: productName || productData.name,
      type: "adjustment",
      quantity: difference,
      previousStock: currentStock,
      newStock: finalStock,
      date: serverTimestamp(),
      userId: adminId,
      userName: adminName,
      notes: notes || "Ajuste manual de inventario",
    });
  });
}

export async function getStockMovements(companyId, limitNum = 100) {
  const q = query(
    tenantCollection(db, companyId, "stockMovements"),
    orderBy("date", "desc"),
    limit(limitNum)
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
