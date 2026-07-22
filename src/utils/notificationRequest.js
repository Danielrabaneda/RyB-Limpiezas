export function buildSystemNotificationArgs(companyId, userId, form) {
  if (!companyId) throw new Error("companyId is required");
  if (!userId) throw new Error("userId is required");

  return [
    companyId,
    userId,
    form.title.trim(),
    form.body.trim(),
    form.type,
    null,
    null,
    form.triggerEvent,
  ];
}

export function shouldAlertImmediately(triggerEvent) {
  return !triggerEvent || triggerEvent === "immediate";
}
