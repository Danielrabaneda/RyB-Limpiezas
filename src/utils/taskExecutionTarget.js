function asDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayTime(value) {
  const date = asDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function selectTaskScheduledServiceTarget({
  execution,
  candidates,
  currentService,
}) {
  const referenceDay = localDayTime(currentService?.scheduledDate);
  if (!execution?.communityTaskId || !currentService?.communityId || !referenceDay) {
    return null;
  }

  const eligible = (candidates || []).filter((candidate) => {
    const candidateDay = localDayTime(candidate?.scheduledDate);
    return (
      candidate?.communityTaskId === execution.communityTaskId &&
      candidate?.communityId === currentService.communityId &&
      candidateDay !== null &&
      candidateDay <= referenceDay
    );
  });

  if (execution.sourceScheduledServiceId) {
    return (
      eligible.find(
        (candidate) => candidate.id === execution.sourceScheduledServiceId,
      ) || null
    );
  }

  const assignedEligible = eligible.filter(
    (candidate) =>
      !execution.userId || candidate?.assignedUserId === execution.userId,
  );

  const originalDay = localDayTime(execution.originalScheduledDate);
  if (originalDay !== null) {
    const originalOccurrence = assignedEligible.find(
      (candidate) => localDayTime(candidate.scheduledDate) === originalDay,
    );
    if (originalOccurrence) return originalOccurrence;
  }

  return (
    assignedEligible.sort(
      (left, right) =>
        localDayTime(left.scheduledDate) - localDayTime(right.scheduledDate),
    )[0] || null
  );
}
