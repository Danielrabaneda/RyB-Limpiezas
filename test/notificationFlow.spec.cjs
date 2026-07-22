const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

describe("Operator notification regression", () => {
  let helpers;

  before(async () => {
    const modulePath = path.resolve("src/utils/notificationRequest.js");
    helpers = await import(pathToFileURL(modulePath).href);
  });

  it("keeps companyId as the first service argument", () => {
    const args = helpers.buildSystemNotificationArgs("rayba", "worker-1", {
      title: "  Aviso  ",
      body: "  Mensaje  ",
      type: "warning",
      triggerEvent: "immediate",
    });

    assert.deepEqual(args, [
      "rayba",
      "worker-1",
      "Aviso",
      "Mensaje",
      "warning",
      null,
      null,
      "immediate",
    ]);
  });

  it("fails closed when the tenant is missing", () => {
    assert.throws(
      () => helpers.buildSystemNotificationArgs(null, "worker-1", {}),
      /companyId is required/,
    );
  });

  it("alerts immediately only for immediate notifications", () => {
    assert.equal(helpers.shouldAlertImmediately("immediate"), true);
    assert.equal(helpers.shouldAlertImmediately(undefined), true);
    assert.equal(helpers.shouldAlertImmediately("push_only"), false);
    assert.equal(helpers.shouldAlertImmediately("workday_start"), false);
    assert.equal(helpers.shouldAlertImmediately("workday_end"), false);
  });
});

describe("Notification push policy", () => {
  const { shouldSendPushNotification } = require("../functions/notificationPolicy");

  it("sends immediate and GPS notifications through FCM", () => {
    assert.equal(shouldSendPushNotification("immediate"), true);
    assert.equal(shouldSendPushNotification(undefined), true);
    assert.equal(shouldSendPushNotification("push_only"), true);
  });

  it("does not send scheduled notifications before their lifecycle event", () => {
    assert.equal(shouldSendPushNotification("workday_start"), false);
    assert.equal(shouldSendPushNotification("workday_end"), false);
  });
});
