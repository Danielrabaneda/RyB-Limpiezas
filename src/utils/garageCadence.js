const FREQUENCY_MONTHS = {
  monthly: 1,
  bimonthly: 2,
  trimonthly: 3,
  quadrimonthly: 4,
  semiannual: 6,
  eightmonthly: 8,
  annual: 12,
};

function asDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const normalized =
    typeof value === "string" && !value.includes("T")
      ? `${value}T00:00:00`
      : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthIndex(value) {
  const date = asDate(value);
  return date ? date.getFullYear() * 12 + date.getMonth() : null;
}

export function getGarageFrequencyMonths(task = {}) {
  return FREQUENCY_MONTHS[task.frequencyType] || null;
}

export function getGarageCadenceAnchorDate(task = {}) {
  return asDate(task.garageCadenceAnchorDate);
}

export function isGarageCadenceMonth(task = {}, date) {
  const anchor = getGarageCadenceAnchorDate(task);
  const frequency = getGarageFrequencyMonths(task);
  const targetMonth = monthIndex(date);
  const anchorMonth = monthIndex(anchor);
  if (!frequency || targetMonth === null || anchorMonth === null) return false;
  const difference = targetMonth - anchorMonth;
  return difference >= 0 && difference % frequency === 0;
}

export function getLatestCompletedGarageDate(services = []) {
  return services.reduce((latest, service) => {
    if (service.status !== "completed") return latest;
    const completedDate = asDate(service.scheduledDate);
    if (!completedDate) return latest;
    return !latest || completedDate > latest ? completedDate : latest;
  }, null);
}

export function getGarageForecastTask(task, monthDate, services = []) {
  const persistedAnchor = getGarageCadenceAnchorDate(task);
  const latestCompletion = getLatestCompletedGarageDate(services);
  const cadenceAnchor =
    persistedAnchor && latestCompletion
      ? persistedAnchor > latestCompletion
        ? persistedAnchor
        : latestCompletion
      : persistedAnchor || latestCompletion;

  if (!cadenceAnchor) return task;

  // Preserve the historical forecast pattern through the month that was
  // actually completed. Only future months are rebased to the real execution.
  if (monthIndex(monthDate) <= monthIndex(cadenceAnchor)) {
    return { ...task, garageCadenceAnchorDate: null };
  }

  return { ...task, garageCadenceAnchorDate: cadenceAnchor };
}
