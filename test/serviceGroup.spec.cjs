const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Service completion group regression", function () {
  let getCurrentServiceGroup;

  before(async function () {
    ({ getCurrentServiceGroup } = await import("../src/utils/serviceGroup.js"));
  });

  it("resolves Rayba grouped services while completing a service", function () {
    const service = { id: "service-main", companyId: "rayba" };
    const groupedServices = [
      service,
      { id: "service-companion", companyId: "rayba" },
    ];

    assert.equal(getCurrentServiceGroup(groupedServices, service), groupedServices);
    assert.equal(groupedServices.every((item) => item.companyId === "rayba"), true);
  });

  it("falls back to the current service when the group is empty", function () {
    const service = { id: "service-main", companyId: "rayba" };
    assert.deepEqual(getCurrentServiceGroup([], service), [service]);
    assert.deepEqual(getCurrentServiceGroup(undefined, service), [service]);
  });

  it("fails closed when neither service data nor a group is available", function () {
    assert.deepEqual(getCurrentServiceGroup(undefined, null), []);
  });

  it("declares the service group inside executeCheckOut before iterating it", function () {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/hooks/useCheckInFlow.js"),
      "utf8",
    );
    const start = source.indexOf("async function executeCheckOut(");
    const end = source.indexOf("async function handleFullManualSubmit()", start);
    const executeCheckOutSource = source.slice(start, end);

    assert.ok(start >= 0 && end > start, "executeCheckOut must exist");
    assert.match(
      executeCheckOutSource,
      /const currentGroup = getCurrentServiceGroup\(groupedServices, service\);[\s\S]*for \(const s of currentGroup\)/,
    );
  });
});
