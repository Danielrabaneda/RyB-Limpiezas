import { isTaskServiceAvailableOn } from "./taskAvailability.js";

function isAutomaticTask(taskName = "") {
  const name = String(taskName).toLowerCase();
  return (
    name.includes("escalera") ||
    name.includes("portal") ||
    name.includes("garaje") ||
    name.includes("oficina")
  );
}

/**
 * Builds the list of task executions that the operator can see in the active
 * card and that still need an explicit answer before closing it. Some overdue
 * tasks are rendered through an execution linked to the host service, rather
 * than being part of its presentation group, so both sources are required.
 */
export function getPendingTaskConfirmations({
  groupedServices = [],
  taskExecutions = [],
  tasks = [],
  taskDecision = null,
  referenceDate = null,
}) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const groupServiceIds = new Set(groupedServices.map((service) => service.id));
  const candidates = [];
  const addedExecutionIds = new Set();
  const addedTaskKeys = new Set();

  const addCandidate = ({ scheduledService, execution }) => {
    const taskId = scheduledService?.communityTaskId || execution?.communityTaskId;
    if (!taskId) return;

    const task = taskById.get(taskId);
    const taskName =
      scheduledService?.taskName || execution?.taskName || task?.taskName || "Tarea";
    const isEmbedded =
      (task?.displayMode || scheduledService?.displayMode) === "embedded";
    const isDone =
      execution?.status === "completed" ||
      taskDecision?.completedTaskIds?.includes(taskId);
    const originalScheduledDate =
      execution?.originalScheduledDate ||
      scheduledService?.originalScheduledDate ||
      scheduledService?.originalDate ||
      scheduledService?.scheduledDate ||
      null;

    if (
      referenceDate &&
      originalScheduledDate &&
      !isTaskServiceAvailableOn(
        { scheduledDate: originalScheduledDate },
        referenceDate,
      )
    ) {
      return;
    }

    if (isDone || (isAutomaticTask(taskName) && !isEmbedded)) return;

    const key = execution?.id || `${taskId}:${scheduledService?.id || ""}`;
    if (addedExecutionIds.has(key) || addedTaskKeys.has(`${taskId}:${scheduledService?.id || execution?.sourceScheduledServiceId || ""}`)) {
      return;
    }

    addedExecutionIds.add(key);
    addedTaskKeys.add(`${taskId}:${scheduledService?.id || execution?.sourceScheduledServiceId || ""}`);
    candidates.push({
      name: taskName,
      communityTaskId: taskId,
      execution: execution || null,
      sourceScheduledServiceId:
        execution?.sourceScheduledServiceId || scheduledService?.id || null,
      originalScheduledDate,
      isExternalSource:
        !!execution &&
        !groupedServices.some(
          (service) => service.communityTaskId === taskId,
        ),
    });
  };

  for (const scheduledService of groupedServices) {
    const execution = taskExecutions.find(
      (entry) => entry.communityTaskId === scheduledService.communityTaskId,
    );
    addCandidate({ scheduledService, execution });
  }

  // These executions are the overdue/embedded tasks injected into the current
  // card. They are visible and actionable, even when their source occurrence
  // was scheduled on a different day and is not in groupedServices.
  for (const execution of taskExecutions) {
    if (!execution.communityTaskId) continue;
    const alreadyCovered = groupedServices.some(
      (service) => service.communityTaskId === execution.communityTaskId,
    );
    if (!alreadyCovered) addCandidate({ execution });
  }

  return candidates;
}

export function resolvePendingTaskAnswer({
  pendingTasks = [],
  completedTaskIds = [],
  completed,
}) {
  const [answeredTask, ...remainingTasks] = pendingTasks;
  if (!answeredTask) {
    return { answeredTask: null, remainingTasks: [], completedTaskIds };
  }

  return {
    answeredTask,
    remainingTasks,
    completedTaskIds:
      completed && !completedTaskIds.includes(answeredTask.communityTaskId)
        ? [...completedTaskIds, answeredTask.communityTaskId]
        : completedTaskIds,
  };
}
