import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { tenantCollection, tenantDoc } from "../utils/tenantFirestore";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";
import {
  deleteFutureServicesForTask,
  generateServicesForTask,
} from "./scheduleService";

/**
 * Reprograma un servicio a una nueva fecha.
 */
export async function rescheduleService(
  companyId,
  { serviceId, newDate, requesterRole, userId }
) {
  const serviceRef = tenantDoc(db, companyId, "scheduledServices", serviceId);
  const serviceSnap = await getDoc(serviceRef);
  if (!serviceSnap.exists()) throw new Error("Servicio no encontrado");

  const serviceData = serviceSnap.data();
  if (
    requesterRole !== "admin" &&
    serviceData.status !== "pending" &&
    serviceData.status !== undefined
  ) {
    throw new Error(
      "Solo se pueden reprogramar servicios que aún no han comenzado.",
    );
  }

  // Verificar si el usuario tiene permisos directos
  let isAuthorized = requesterRole === "admin";
  if (!isAuthorized && userId) {
    const userSnap = await getDoc(doc(db, "users", userId));
    if (userSnap.exists() && userSnap.data().allowDirectTransfers === true) {
      isAuthorized = true;
    }
  }

  const batch = writeBatch(db);
  const startOfNewDate = startOfDay(newDate);

  if (isAuthorized) {
    batch.update(serviceRef, {
      scheduledDate: Timestamp.fromDate(startOfNewDate),
      originalDate: serviceData.originalDate || serviceData.scheduledDate,
      isRescheduled: true,
      rescheduleId: null,
      rescheduleValidated: true,
      updatedAt: serverTimestamp(),
    });

    if (requesterRole !== "admin") {
      // Registrar log aprobado para auditoría de forma atómica en el mismo lote
      const logRef = doc(tenantCollection(db, companyId, "transfers"));
      batch.set(logRef, {
        serviceId,
        userId,
        newDate: Timestamp.fromDate(startOfNewDate),
        oldDate: serviceData.scheduledDate,
        type: "date_change",
        status: "approved",
        requestedBy: requesterRole,
        createdAt: serverTimestamp(),
      });
    }
  } else {
    const logRef = doc(tenantCollection(db, companyId, "transfers"));
    const transferData = {
      serviceId,
      userId,
      newDate: Timestamp.fromDate(startOfNewDate),
      oldDate: serviceData.scheduledDate,
      type: "date_change",
      status: "pending",
      requestedBy: requesterRole,
      createdAt: serverTimestamp(),
    };
    batch.set(logRef, transferData);

    batch.update(serviceRef, {
      // Mantenemos la fecha original del servicio
      rescheduleId: logRef.id,
      rescheduleValidated: false,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function transferService(
  companyId,
  { serviceId, fromUserId, toUserId, requesterRole }
) {
  if (toUserId) {
    const targetUserSnap = await getDoc(doc(db, "users", toUserId));
    if (!targetUserSnap.exists() || targetUserSnap.data().companyId !== companyId) {
      throw new Error("El usuario destino no pertenece a este tenant.");
    }
  }

  const serviceRef = tenantDoc(db, companyId, "scheduledServices", serviceId);
  const serviceSnap = await getDoc(serviceRef);

  if (!serviceSnap.exists()) throw new Error("Servicio no encontrado");
  const serviceData = serviceSnap.data();

  // Operarios solo pueden traspasar si el servicio está pendiente
  if (
    requesterRole !== "admin" &&
    serviceData.status !== "pending" &&
    serviceData.status !== undefined
  ) {
    throw new Error(
      "Solo se pueden traspasar servicios que aún no han comenzado.",
    );
  }

  // Verificar si el usuario tiene permisos directos
  let isAuthorized = requesterRole === "admin";
  if (!isAuthorized && fromUserId) {
    const userSnap = await getDoc(doc(db, "users", fromUserId));
    if (userSnap.exists() && userSnap.data().allowDirectTransfers === true) {
      isAuthorized = true;
    }
  }

  const transferRef = doc(tenantCollection(db, companyId, "transfers"));
  const batch = writeBatch(db);
  const transferData = {
    serviceId,
    fromUserId,
    toUserId,
    type: "single",
    status: isAuthorized ? "approved" : "pending",
    requestedBy: requesterRole,
    createdAt: serverTimestamp(),
  };

  batch.set(transferRef, transferData);

  if (isAuthorized) {
    batch.update(serviceRef, {
      assignedUserId: toUserId,
      isTransferred: true,
      originalAssignedUserId: fromUserId,
      transferId: transferRef.id,
      transferValidated: true,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(serviceRef, {
      // Mantenemos al operario original
      transferId: transferRef.id,
      transferValidated: false,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
  return transferRef.id;
}

export async function transferDay(
  companyId,
  { date, fromUserId, toUserId, requesterRole }
) {
  if (toUserId) {
    const targetUserSnap = await getDoc(doc(db, "users", toUserId));
    if (!targetUserSnap.exists() || targetUserSnap.data().companyId !== companyId) {
      throw new Error("El usuario destino no pertenece a este tenant.");
    }
  }

  const start = Timestamp.fromDate(startOfDay(date));
  const end = Timestamp.fromDate(endOfDay(date));

  const q = query(
    tenantCollection(db, companyId, "scheduledServices"),
    where("assignedUserId", "==", fromUserId),
    where("scheduledDate", ">=", start),
    where("scheduledDate", "<=", end),
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error(
      "No hay servicios asignados a este operario para el día seleccionado.",
    );
  }

  // Si es operario, validar que NINGÚN servicio haya comenzado
  if (requesterRole !== "admin") {
    const hasStarted = snap.docs.some((d) => {
      const s = d.data().status;
      return s === "completed" || s === "in_progress";
    });
    if (hasStarted) {
      throw new Error(
        "No se puede traspasar el día porque algunos servicios ya han comenzado o finalizado.",
      );
    }
  }

  // Verificar si el usuario tiene permisos directos
  let isAuthorized = requesterRole === "admin";
  if (!isAuthorized && fromUserId) {
    const userSnap = await getDoc(doc(db, "users", fromUserId));
    if (userSnap.exists() && userSnap.data().allowDirectTransfers === true) {
      isAuthorized = true;
    }
  }

  // Filtrar solo los servicios pendientes (excluir realizados/en curso)
  const pendingServices = snap.docs.filter((d) => {
    const s = d.data().status;
    return s === "pending" || !s;
  });

  if (pendingServices.length === 0) {
    throw new Error(
      "No hay servicios pendientes asignados a este operario para el día seleccionado.",
    );
  }

  const transferRef = doc(tenantCollection(db, companyId, "transfers"));
  const transferData = {
    date: Timestamp.fromDate(date),
    fromUserId,
    toUserId,
    type: "day",
    serviceCount: pendingServices.length,
    status: isAuthorized ? "approved" : "pending",
    requestedBy: requesterRole,
    createdAt: serverTimestamp(),
  };

  // Procesamos en lotes de 400 y garantizamos la creación atómica de la transferencia
  const CHUNK_SIZE = 400;
  let isFirst = true;
  for (let i = 0; i < pendingServices.length; i += CHUNK_SIZE) {
    const chunk = pendingServices.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    if (isFirst) {
      batch.set(transferRef, transferData);
      isFirst = false;
    }

    chunk.forEach((d) => {
      if (isAuthorized) {
        batch.update(d.ref, {
          assignedUserId: toUserId,
          isTransferred: true,
          originalAssignedUserId: fromUserId,
          transferId: transferRef.id,
          transferValidated: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(d.ref, {
          transferId: transferRef.id,
          transferValidated: false,
          updatedAt: serverTimestamp(),
        });
      }
    });

    await batch.commit();
  }
  return transferRef.id;
}

export async function transferWeek(
  companyId,
  { dateInWeek, fromUserId, toUserId, requesterRole }
) {
  if (toUserId) {
    const targetUserSnap = await getDoc(doc(db, "users", toUserId));
    if (!targetUserSnap.exists() || targetUserSnap.data().companyId !== companyId) {
      throw new Error("El usuario destino no pertenece a este tenant.");
    }
  }

  const weekStart = startOfWeek(dateInWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(dateInWeek, { weekStartsOn: 1 });
  const start = Timestamp.fromDate(startOfDay(weekStart));
  const end = Timestamp.fromDate(endOfDay(weekEnd));

  const q = query(
    tenantCollection(db, companyId, "scheduledServices"),
    where("assignedUserId", "==", fromUserId),
    where("scheduledDate", ">=", start),
    where("scheduledDate", "<=", end),
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error(
      "No hay servicios asignados a este operario para la semana seleccionada.",
    );
  }

  // Si es operario, validar que NINGÚN servicio de la semana haya comenzado
  if (requesterRole !== "admin") {
    const hasStarted = snap.docs.some((d) => {
      const s = d.data().status;
      return s === "completed" || s === "in_progress";
    });
    if (hasStarted) {
      throw new Error(
        "No se puede traspasar la semana porque algunos servicios ya han comenzado o finalizado.",
      );
    }
  }

  // Verificar si el usuario tiene permisos directos
  let isAuthorized = requesterRole === "admin";
  if (!isAuthorized && fromUserId) {
    const userSnap = await getDoc(doc(db, "users", fromUserId));
    if (userSnap.exists() && userSnap.data().allowDirectTransfers === true) {
      isAuthorized = true;
    }
  }

  // Filtrar solo los servicios pendientes (excluir realizados/en curso)
  const pendingServices = snap.docs.filter((d) => {
    const s = d.data().status;
    return s === "pending" || !s;
  });

  if (pendingServices.length === 0) {
    throw new Error(
      "No hay servicios pendientes asignados a este operario para la semana seleccionada.",
    );
  }

  const transferRef = doc(tenantCollection(db, companyId, "transfers"));
  const transferData = {
    startDate: Timestamp.fromDate(weekStart),
    endDate: Timestamp.fromDate(weekEnd),
    fromUserId,
    toUserId,
    type: "week",
    serviceCount: pendingServices.length,
    status: isAuthorized ? "approved" : "pending",
    requestedBy: requesterRole,
    createdAt: serverTimestamp(),
  };

  // Procesamos en lotes de 400 y garantizamos la creación atómica de la transferencia
  const CHUNK_SIZE = 400;
  let isFirst = true;
  for (let i = 0; i < pendingServices.length; i += CHUNK_SIZE) {
    const chunk = pendingServices.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    if (isFirst) {
      batch.set(transferRef, transferData);
      isFirst = false;
    }

    chunk.forEach((d) => {
      if (isAuthorized) {
        batch.update(d.ref, {
          assignedUserId: toUserId,
          isTransferred: true,
          originalAssignedUserId: fromUserId,
          transferId: transferRef.id,
          transferValidated: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(d.ref, {
          transferId: transferRef.id,
          transferValidated: false,
          updatedAt: serverTimestamp(),
        });
      }
    });

    await batch.commit();
  }
  return transferRef.id;
}

/**
 * ADMIN ONLY — Permanently reassigns a community task to a different operario.
 * - Updates communityTask.assignedUserId
 * - Deletes all future pending services for this task
 * - Regenerates services with the new operario
 * - Creates an audit record in 'transfers' collection
 */
export async function transferPermanent(
  companyId,
  { communityTaskId, fromUserId, toUserId, adminUserId }
) {
  if (toUserId) {
    const targetUserSnap = await getDoc(doc(db, "users", toUserId));
    if (!targetUserSnap.exists() || targetUserSnap.data().companyId !== companyId) {
      throw new Error("El usuario destino no pertenece a este tenant.");
    }
  }

  const taskRef = tenantDoc(db, companyId, "communityTasks", communityTaskId);
  const taskSnap = await getDoc(taskRef);
  if (!taskSnap.exists()) throw new Error("Tarea no encontrada");

  const taskData = taskSnap.data();

  // 1. Update the task assignment
  await updateDoc(taskRef, {
    assignedUserId: toUserId || null,
    updatedAt: serverTimestamp(),
  });

  // 2. Create audit trail
  await addDoc(tenantCollection(db, companyId, "transfers"), {
    communityTaskId,
    communityId: taskData.communityId,
    taskName: taskData.taskName,
    fromUserId,
    toUserId: toUserId || null,
    type: "permanent",
    status: "approved", // Admin-initiated, auto-approved
    requestedBy: "admin",
    adminUserId,
    createdAt: serverTimestamp(),
  });

  // 3. Delete future pending services and regenerate with new assignment
  await deleteFutureServicesForTask(companyId, communityTaskId);
  await generateServicesForTask(companyId, communityTaskId);
}

export async function getPendingTransfers(companyId) {
  const q = query(
    tenantCollection(db, companyId, "transfers"),
    where("status", "==", "pending"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function approveTransfer(companyId, transferId) {
  const transferRef = tenantDoc(db, companyId, "transfers", transferId);
  const transferSnap = await getDoc(transferRef);
  if (!transferSnap.exists()) return;

  const batch = writeBatch(db);
  batch.update(transferRef, {
    status: "approved",
    validatedAt: serverTimestamp(),
  });

  const data = transferSnap.data();

  if (data.type === "date_change") {
    const q = query(
      tenantCollection(db, companyId, "scheduledServices"),
      where("rescheduleId", "==", transferId),
    );
    const servicesSnap = await getDocs(q);
    servicesSnap.forEach((d) => {
      const svcData = d.data();
      batch.update(d.ref, {
        scheduledDate: data.newDate,
        originalDate: svcData.originalDate || svcData.scheduledDate,
        isRescheduled: true,
        rescheduleValidated: true,
      });
    });
  } else {
    // Update all associated services for user transfer
    const q = query(
      tenantCollection(db, companyId, "scheduledServices"),
      where("transferId", "==", transferId),
    );
    const servicesSnap = await getDocs(q);
    servicesSnap.forEach((d) => {
      batch.update(d.ref, {
        assignedUserId: data.toUserId,
        isTransferred: true,
        originalAssignedUserId: data.fromUserId,
        transferValidated: true,
      });
    });
  }

  await batch.commit();
}

export async function rejectTransfer(companyId, transferId) {
  const transferRef = tenantDoc(db, companyId, "transfers", transferId);
  const transferSnap = await getDoc(transferRef);
  if (!transferSnap.exists()) return;

  const data = transferSnap.data();
  const batch = writeBatch(db);

  batch.update(transferRef, {
    status: "rejected",
    validatedAt: serverTimestamp(),
  });

  if (data.type === "date_change") {
    const q = query(
      tenantCollection(db, companyId, "scheduledServices"),
      where("rescheduleId", "==", transferId),
    );
    const servicesSnap = await getDocs(q);
    servicesSnap.forEach((d) => {
      batch.update(d.ref, {
        rescheduleId: null,
        rescheduleValidated: false,
      });
    });
  } else {
    // Clear transfer fields
    const q = query(
      tenantCollection(db, companyId, "scheduledServices"),
      where("transferId", "==", transferId),
    );
    const servicesSnap = await getDocs(q);
    servicesSnap.forEach((d) => {
      batch.update(d.ref, {
        transferId: null,
        transferValidated: false,
      });
    });
  }

  await batch.commit();
}
