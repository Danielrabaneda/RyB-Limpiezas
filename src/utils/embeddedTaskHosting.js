function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameLocalDay(left, right) {
  const a = toDate(left);
  const b = toDate(right);
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function findEmbeddedHostTargets(task, day, services = []) {
  if (task?.displayMode !== "embedded") return [];

  for (const hostTaskId of task.hostTaskIds || []) {
    const matches = services.filter(
      (service) =>
        service.communityId === task.communityId &&
        service.communityTaskId === hostTaskId &&
        service.assignedUserId &&
        !service.hiddenDuplicate &&
        sameLocalDay(service.scheduledDate, day),
    );
    if (matches.length === 0) continue;

    const seenHosts = new Set();
    return matches.flatMap((host) => {
      if (seenHosts.has(host.id)) return [];
      seenHosts.add(host.id);
      return [{
        userId: host.assignedUserId,
        hostScheduledServiceId: host.id,
      }];
    });
  }

  return [];
}

export function getEmbeddedCarryFallbackStatus(movedToNextHost) {
  return movedToNextHost ? null : "pending";
}

export function shouldShowScheduledTaskInHost({
  scheduledTask,
  taskDefinition,
  hostService,
}) {
  const presentation =
    taskDefinition?.displayMode || scheduledTask?.displayMode || "standalone";
  if (presentation !== "embedded") return true;
  if (!hostService || scheduledTask?.communityId !== hostService.communityId) {
    return false;
  }
  if (
    scheduledTask.hostScheduledServiceId &&
    scheduledTask.hostScheduledServiceId !== hostService.id
  ) {
    return false;
  }
  if (scheduledTask.hostScheduledServiceId === hostService.id) return true;

  const hostTaskIds = Array.isArray(taskDefinition?.hostTaskIds)
    ? taskDefinition.hostTaskIds
    : Array.isArray(scheduledTask?.hostTaskIds)
      ? scheduledTask.hostTaskIds
      : [];
  return (
    hostTaskIds.includes(hostService.communityTaskId) &&
    (!scheduledTask.assignedUserId ||
      scheduledTask.assignedUserId === hostService.assignedUserId)
  );
}
