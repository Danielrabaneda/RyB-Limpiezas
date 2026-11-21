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

export function getNotificationRecipientIds(operarios) {
  const recipientIds = (Array.isArray(operarios) ? operarios : [])
    .map((operario) => operario?.uid)
    .filter(Boolean);

  if (recipientIds.length === 0) {
    throw new Error(
      "No se ha cargado ningún operario. Actualiza el panel antes de enviar la notificación.",
    );
  }

  return recipientIds;
}

export function shouldAlertImmediately(triggerEvent) {
  return !triggerEvent || triggerEvent === "immediate";
}
