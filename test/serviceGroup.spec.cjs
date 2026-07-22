const assert = require("node:assert/strict");

describe("Service completion group regression", function () {
  let getCurrentServiceGroup;

  before(async function () {
    ({ getCurrentServiceGroup } = await import("../src/utils/serviceGroup.js"));
  });

  it("resolves the grouped services used while completing a service", function () {
    const service = { id: "service-main", companyId: "rayba" };
    const groupedServices = [
      service,
      { id: "service-companion", companyId: "rayba" },
    ];

    const currentGroup = getCurrentServiceGroup(groupedServices, service);

    assert.deepEqual(currentGroup, groupedServices);
    assert.equal(currentGroup.every((item) => item.companyId === "rayba"), true);
  });

  it("falls back to the current service instead of referencing an out-of-scope variable", function () {
    const service = { id: "service-main", companyId: "rayba" };

    const currentGroup = getCurrentServiceGroup([], service);

    assert.deepEqual(currentGroup, [service]);
  });
});
