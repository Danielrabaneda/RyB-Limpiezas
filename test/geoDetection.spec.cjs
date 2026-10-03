const assert = require("node:assert/strict");

describe("Geo detection recovery", function () {
  let findLatestDetection;

  before(async function () {
    ({ findLatestDetection } = await import("../src/utils/geoDetection.js"));
  });

  it("recovers the latest entry persisted with timestamp-based document ids", function () {
    const detections = [
      { id: "entry_user_service_1000", type: "entry", serviceId: "service", detectedAt: new Date("2026-07-22T08:00:00Z") },
      { id: "entry_user_service_2000", type: "entry", serviceId: "service", detectedAt: new Date("2026-07-22T08:05:00Z") },
      { id: "exit_user_service_3000", type: "exit", serviceId: "service", detectedAt: new Date("2026-07-22T09:00:00Z") },
    ];

    assert.equal(
      findLatestDetection(detections, "service", "entry").id,
      "entry_user_service_2000",
    );
  });

  it("does not mix services or entry and exit detections", function () {
    const detections = [
      { id: "other", type: "entry", serviceId: "other-service", detectedAt: new Date() },
      { id: "exit", type: "exit", serviceId: "service", detectedAt: new Date() },
    ];

    assert.equal(findLatestDetection(detections, "service", "entry"), null);
  });
});
