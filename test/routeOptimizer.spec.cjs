const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

describe("Route optimizer reliability", () => {
  let optimizeRoutePlan;

  before(async () => {
    const moduleUrl = pathToFileURL(
      path.resolve("src/services/routeOptimizerService.js"),
    ).href;
    ({ optimizeRoutePlan } = await import(moduleUrl));
  });

  const community = (latitude, longitude, preferredTime = null) => ({
    location: { latitude, longitude },
    preferredTime,
  });

  it("orders valid pending services by proximity", () => {
    const result = optimizeRoutePlan(
      [
        {
          id: "far",
          status: "pending",
          community: community(40.5, -3.7),
        },
        {
          id: "near",
          status: "pending",
          community: community(40.42, -3.7),
        },
        {
          id: "middle",
          status: "pending",
          community: community(40.45, -3.7),
        },
      ],
      40.4168,
      -3.7038,
      { now: new Date("2026-07-23T09:00:00") },
    );

    assert.equal(result.optimized, true);
    assert.deepEqual(
      result.services.map((service) => service.id),
      ["near", "middle", "far"],
    );
    assert.deepEqual(
      result.services.map((service) => service.routePosition),
      [1, 2, 3],
    );
  });

  it("keeps a started service ahead of the pending route", () => {
    const result = optimizeRoutePlan(
      [
        {
          id: "active",
          status: "started",
          community: community(40.5, -3.7),
        },
        {
          id: "near",
          status: "pending",
          community: community(40.42, -3.7),
        },
        {
          id: "middle",
          status: "pending",
          community: community(40.45, -3.7),
        },
      ],
      40.5,
      -3.7,
      { now: new Date("2026-07-23T09:00:00") },
    );

    assert.equal(result.services[0].id, "active");
    assert.equal(result.services[0].routePosition, undefined);
    assert.equal(result.services[1].routePosition, 1);
  });

  it("prioritizes a nearby time constraint when it becomes urgent", () => {
    const result = optimizeRoutePlan(
      [
        {
          id: "free",
          status: "pending",
          community: community(40.42, -3.7),
        },
        {
          id: "timed",
          status: "pending",
          community: community(40.46, -3.7, "09:20"),
        },
      ],
      40.4168,
      -3.7038,
      { now: new Date("2026-07-23T09:00:00") },
    );

    assert.equal(result.services[0].id, "timed");
  });

  it("moves missing coordinates outside the numbered route", () => {
    const result = optimizeRoutePlan(
      [
        { id: "missing", status: "pending", community: {} },
        {
          id: "near",
          status: "pending",
          community: community(40.42, -3.7),
        },
        {
          id: "middle",
          status: "pending",
          community: community(40.45, -3.7),
        },
      ],
      40.4168,
      -3.7038,
      { now: new Date("2026-07-23T09:00:00") },
    );

    const missing = result.services.find((service) => service.id === "missing");
    assert.equal(result.services.at(-1).id, "missing");
    assert.equal(missing.routePosition, undefined);
    assert.equal(missing.routeWarning, "Ubicación sin configurar");
    assert.equal(result.missingCoordinates, 1);
  });

  it("does not claim optimization without two routable pending services", () => {
    const result = optimizeRoutePlan(
      [
        {
          id: "done",
          status: "completed",
          community: community(40.42, -3.7),
        },
      ],
      40.4168,
      -3.7038,
      { now: new Date("2026-07-23T09:00:00") },
    );

    assert.equal(result.optimized, false);
    assert.equal(result.services[0].routePosition, undefined);
    assert.equal(result.reason, "not_enough_routable_services");
  });

  it("fails closed when no real starting location is available", () => {
    const result = optimizeRoutePlan(
      [
        {
          id: "one",
          status: "pending",
          community: community(40.42, -3.7),
        },
        {
          id: "two",
          status: "pending",
          community: community(40.45, -3.7),
        },
      ],
      null,
      null,
    );

    assert.equal(result.optimized, false);
    assert.equal(result.reason, "missing_start_location");
  });
});
