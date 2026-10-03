const TRIAL_DURATION_DAYS = 30;
const TRIAL_DELETION_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function buildTrialLifecycle(nowMs = Date.now()) {
  const trialEndsAtMs = nowMs + TRIAL_DURATION_DAYS * DAY_MS;
  return {
    trialEndsAtMs,
    dataDeletionAtMs:
      trialEndsAtMs + TRIAL_DELETION_GRACE_DAYS * DAY_MS,
  };
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return null;
}

function isTrialReadyForDeletion(company, nowMs = Date.now()) {
  if (!company || company.subscriptionStatus !== "trialing") return false;
  const deletionAtMs = timestampToMillis(company.dataDeletionAt);
  return deletionAtMs !== null && deletionAtMs <= nowMs;
}

module.exports = {
  DAY_MS,
  TRIAL_DURATION_DAYS,
  TRIAL_DELETION_GRACE_DAYS,
  buildTrialLifecycle,
  isTrialReadyForDeletion,
};
