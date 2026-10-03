function asDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  const date = asDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function serviceKey(taskId, userId, date) {
  const day = dateKey(date);
  if (!taskId || !userId || !day) return null;
  return `${taskId}_${userId}_${day}`;
}

export function getPreservedScheduleKeys(service = {}) {
  const keys = new Set();
  const transferred =
    service.isTransferred === true && service.transferValidated !== false;
  const rescheduled =
    service.isRescheduled === true && service.rescheduleValidated !== false;
  const currentUser = service.assignedUserId;
  const originalUser =
    service.occurrenceOriginalAssignedUserId ||
    (transferred ? service.originalAssignedUserId || currentUser : currentUser);
  const currentDate = service.scheduledDate;
  const originalDate =
    service.occurrenceOriginalDate ||
    (rescheduled ? service.originalDate || currentDate : currentDate);

  [
    serviceKey(service.communityTaskId, currentUser, currentDate),
    serviceKey(service.communityTaskId, originalUser, currentDate),
    serviceKey(service.communityTaskId, currentUser, originalDate),
    serviceKey(service.communityTaskId, originalUser, originalDate),
  ].forEach((key) => {
    if (key) keys.add(key);
  });

  return keys;
}

export function findSupersededOriginalServiceIds(services = []) {
  const movedOriginals = new Map();

  for (const service of services) {
    const approvedMove =
      service.isRescheduled === true &&
      service.rescheduleValidated !== false &&
      service.originalDate;
    const approvedTransfer =
      service.isTransferred === true && service.transferValidated !== false;
    if (!approvedMove && !approvedTransfer) continue;

    const originalUserId =
      service.occurrenceOriginalAssignedUserId ||
      (approvedTransfer
        ? service.originalAssignedUserId || service.assignedUserId
        : service.assignedUserId);
    const originalDate =
      service.occurrenceOriginalDate ||
      (approvedMove ? service.originalDate : service.scheduledDate);
    const originalKey = serviceKey(
      service.communityTaskId,
      originalUserId,
      originalDate,
    );
    if (originalKey) movedOriginals.set(originalKey, service.id);
  }

  const supersededIds = new Set();
  for (const service of services) {
    if (service.status && service.status !== "pending") continue;
    const currentKey = serviceKey(
      service.communityTaskId,
      service.assignedUserId,
      service.scheduledDate,
    );
    const movedServiceId = currentKey ? movedOriginals.get(currentKey) : null;
    if (movedServiceId && movedServiceId !== service.id) {
      supersededIds.add(service.id);
    }
  }

  return supersededIds;
}
