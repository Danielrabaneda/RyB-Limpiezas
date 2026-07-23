export const TASK_DISPLAY_STANDALONE = "standalone";
export const TASK_DISPLAY_EMBEDDED = "embedded";

export function normalizeTaskPresentation(task = {}) {
  const displayMode =
    task.displayMode === TASK_DISPLAY_EMBEDDED
      ? TASK_DISPLAY_EMBEDDED
      : TASK_DISPLAY_STANDALONE;
  const hostTaskIds = [
    ...new Set((Array.isArray(task.hostTaskIds) ? task.hostTaskIds : []).filter(Boolean)),
  ];

  return {
    displayMode,
    hostTaskIds,
    carryUntilCompleted: task.carryUntilCompleted !== false,
    finalFallback: task.finalFallback || TASK_DISPLAY_STANDALONE,
  };
}

function calculateGroupStatus(services) {
  if (services.every((service) => service.status === "completed")) return "completed";
  if (services.every((service) => service.status === "missed")) return "missed";
  if (
    services.every(
      (service) => service.status === "completed" || service.status === "missed",
    )
  ) {
    return "completed";
  }
  if (
    services.some((service) =>
      ["in_progress", "started", "completed", "missed"].includes(service.status),
    )
  ) {
    return "in_progress";
  }
  return "pending";
}

function sameContext(service, host) {
  return (
    service.communityId === host.communityId &&
    (!service.assignedUserId ||
      !host.assignedUserId ||
      service.assignedUserId === host.assignedUserId)
  );
}

function taskForService(service, taskById) {
  return taskById.get(service.communityTaskId) || service;
}

export function groupServicesByTaskPresentation(services = [], tasks = []) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const groups = [];
  const groupByHostServiceId = new Map();
  const embeddedServices = [];

  for (const service of services) {
    const task = taskForService(service, taskById);
    const presentation = normalizeTaskPresentation(task);
    const enrichedService = { ...service, ...presentation };

    if (presentation.displayMode === TASK_DISPLAY_EMBEDDED) {
      embeddedServices.push(enrichedService);
      continue;
    }

    const group = {
      ...enrichedService,
      groupKey: `service_${service.id}`,
      groupedServices: [enrichedService],
      tasks: Array.isArray(service.tasks) ? [...service.tasks] : [],
    };
    groups.push(group);
    groupByHostServiceId.set(service.id, group);
  }

  for (const service of embeddedServices) {
    const candidateHost = service.hostTaskIds
      .map((hostTaskId) =>
        services.find(
          (candidate) =>
            candidate.communityTaskId === hostTaskId &&
            sameContext(service, candidate) &&
            !["completed", "missed"].includes(candidate.status),
        ),
      )
      .find(Boolean);

    const hostGroup = candidateHost
      ? groupByHostServiceId.get(candidateHost.id)
      : null;

    if (!hostGroup) {
      groups.push({
        ...service,
        groupKey: `fallback_${service.id}`,
        groupedServices: [service],
        tasks: Array.isArray(service.tasks) ? [...service.tasks] : [],
        presentationFallback: true,
      });
      continue;
    }

    hostGroup.groupedServices.push(service);
    if (Array.isArray(service.tasks)) hostGroup.tasks.push(...service.tasks);
    hostGroup.hasEmbeddedTasks = true;
  }

  for (const group of groups) {
    group.status = calculateGroupStatus(group.groupedServices);
  }

  return groups;
}

export function findPresentationGroup(
  services = [],
  currentService,
  tasks = [],
) {
  if (!currentService) return [];
  const groups = groupServicesByTaskPresentation(services, tasks);
  const match = groups.find((group) =>
    group.groupedServices.some((service) => service.id === currentService.id),
  );
  return match?.groupedServices || [currentService];
}
