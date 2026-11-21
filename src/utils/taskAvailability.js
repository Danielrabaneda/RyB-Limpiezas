function asDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayStart(value) {
  const date = asDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isTaskServiceAvailableOn(taskService, referenceDate) {
  const programmedDay = localDayStart(taskService?.scheduledDate);
  const referenceDay = localDayStart(referenceDate);
  if (!programmedDay || !referenceDay) return false;
  return programmedDay.getTime() <= referenceDay.getTime();
}

export function filterTaskExecutionsAvailableOn(executions, referenceDate) {
  return (executions || []).filter(
    (execution) =>
      !execution.originalScheduledDate ||
      isTaskServiceAvailableOn(
        { scheduledDate: execution.originalScheduledDate },
        referenceDate,
      ),
  );
}
