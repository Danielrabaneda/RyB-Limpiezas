"use strict";

function shouldSendPushNotification(triggerEvent) {
  return triggerEvent === "push_only";
}

module.exports = { shouldSendPushNotification };
