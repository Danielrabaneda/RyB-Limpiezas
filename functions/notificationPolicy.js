"use strict";

function shouldSendPushNotification(triggerEvent) {
  return triggerEvent === "push_only" || triggerEvent === "immediate";
}

module.exports = { shouldSendPushNotification };
