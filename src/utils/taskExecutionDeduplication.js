export function getTaskExecutionDocumentId(scheduledServiceId, communityTaskId) {
  return `task_${scheduledServiceId.length}_${scheduledServiceId}_${communityTaskId}`;
}

export function uniqueTaskExecutions(executions) {
  const byTask = new Map();
  for (const execution of executions) {
    const key = execution.communityTaskId || execution.id;
    const previous = byTask.get(key);
    if (!previous || (previous.status !== "completed" && execution.status === "completed")) {
      byTask.set(key, execution);
    }
  }
  return [...byTask.values()];
}
