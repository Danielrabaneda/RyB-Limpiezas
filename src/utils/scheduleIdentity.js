function asDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(value) {
  const date = asDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildScheduleOccurrenceId(taskId, assignedUserId, scheduledDate) {
  const date = dayKey(scheduledDate);
  if (!taskId || !assignedUserId || !date) return null;
  return `${taskId}_${assignedUserId}_${date}`;
}

export function getScheduleOccurrenceIdentity(service = {}) {
  const approvedTransfer =
    service.isTransferred === true && service.transferValidated !== false;
  const approvedReschedule =
    service.isRescheduled === true && service.rescheduleValidated !== false;
  const originalAssignedUserId =
    service.occurrenceOriginalAssignedUserId ||
    (approvedTransfer
      ? service.originalAssignedUserId || service.assignedUserId
      : service.assignedUserId);
  const originalDate =
    asDate(service.occurrenceOriginalDate) ||
    (approvedReschedule
      ? asDate(service.originalDate) || asDate(service.scheduledDate)
      : asDate(service.scheduledDate));
  const occurrenceId =
    service.occurrenceId ||
    buildScheduleOccurrenceId(
      service.communityTaskId,
      originalAssignedUserId,
      originalDate,
    );

  if (
    !occurrenceId ||
    !service.communityTaskId ||
    !originalAssignedUserId ||
    !originalDate
  ) {
    return null;
  }

  return {
    occurrenceId,
    communityTaskId: service.communityTaskId,
    originalAssignedUserId,
    originalDate,
  };
}

export function getScheduleOccurrenceDocumentId(occurrenceId) {
  return occurrenceId ? encodeURIComponent(occurrenceId) : null;
}

function createdAtMillis(service) {
  return asDate(service.createdAt)?.getTime() || Number.MAX_SAFE_INTEGER;
}

function canonicalScore(service) {
  const worked = service.status && service.status !== "pending" ? 400 : 0;
  const approvedManualChange =
    (service.isTransferred === true && service.transferValidated !== false) ||
    (service.isRescheduled === true && service.rescheduleValidated !== false)
      ? 200
      : 0;
  const alreadyIdentified = service.occurrenceId ? 50 : 0;
  return worked + approvedManualChange + alreadyIdentified;
}

export function buildScheduleIdentityMigrationPlan(services = []) {
  const groups = new Map();

  for (const service of services) {
    const identity = getScheduleOccurrenceIdentity(service);
    if (!service.id || !identity) continue;
    if (!groups.has(identity.occurrenceId)) {
      groups.set(identity.occurrenceId, { identity, services: [] });
    }
    groups.get(identity.occurrenceId).services.push(service);
  }

  return [...groups.values()].map(({ identity, services: group }) => {
    const sorted = [...group].sort((a, b) => {
      const scoreDifference = canonicalScore(b) - canonicalScore(a);
      if (scoreDifference !== 0) return scoreDifference;
      const timeDifference = createdAtMillis(a) - createdAtMillis(b);
      if (timeDifference !== 0) return timeDifference;
      return String(a.id).localeCompare(String(b.id));
    });
    const [canonical, ...duplicates] = sorted;

    return {
      identity,
      canonical,
      pendingDuplicateIds: duplicates
        .filter(
          (service) => !service.status || service.status === "pending",
        )
        .map((service) => service.id),
      retainedHistoricalDuplicateIds: duplicates
        .filter(
          (service) => service.status && service.status !== "pending",
        )
        .map((service) => service.id),
    };
  });
}
