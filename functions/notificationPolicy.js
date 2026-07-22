"use strict";

function shouldSendPushNotification(triggerEvent) {
  const normalizedTrigger = triggerEvent || "immediate";
  return ["push_only", "immediate"].includes(normalizedTrigger);
}

module.exports = { shouldSendPushNotification };
