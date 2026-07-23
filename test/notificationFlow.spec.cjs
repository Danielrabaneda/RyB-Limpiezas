const assert = require("node:assert/strict");
const fs = require("node:fs");
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

  it("rebuilds dismissAll when the active tenant changes", () => {
    const contextSource = fs.readFileSync(
      path.resolve("src/contexts/NotificationContext.jsx"),
      "utf8",
    );

    assert.match(
      contextSource,
      /\}, \[companyId, currentUser\?\.uid, cleanupTracker\]\);/,
    );
  });

  it("waits for Firestore before reporting that notices were read", () => {
    const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
    const awaitedDismissals = appSource.match(/await dismissAll\(\);/g) || [];

    assert.equal(
      awaitedDismissals.length,
      2,
      "Las campanas de admin y operario deben esperar la escritura",
    );
  });
});

describe("Notification push policy", () => {
  const { shouldSendPushNotification } = require("../functions/notificationPolicy");

  it("sends only GPS notifications through FCM", () => {
    assert.equal(shouldSendPushNotification("push_only"), true);
    assert.equal(shouldSendPushNotification("immediate"), false);
    assert.equal(shouldSendPushNotification(undefined), false);
  });

  it("does not send scheduled notifications before their lifecycle event", () => {
    assert.equal(shouldSendPushNotification("workday_start"), false);
    assert.equal(shouldSendPushNotification("workday_end"), false);
  });
});
