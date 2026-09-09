const assert = require("node:assert/strict");

describe("workday selection", () => {
  let selectCanonicalActiveWorkday;

  before(async () => {
    ({ selectCanonicalActiveWorkday } = await import(
      "../src/utils/workdaySelection.js"
    ));
  });

  it("restores the active workday whose companion choice changed most recently", () => {
    const olderDuplicate = {
      id: "older",
      status: "active",
      currentCompanionId: null,
      startTime: new Date("2026-08-25T06:00:00Z"),
      updatedAt: new Date("2026-08-25T06:00:00Z"),
    };
    const selectedCompanion = {
      id: "selected",
      status: "active",
      currentCompanionId: "operator-b",
      startTime: new Date("2026-08-25T05:00:00Z"),
      updatedAt: new Date("2026-08-25T07:00:00Z"),
    };

    assert.equal(
      selectCanonicalActiveWorkday([olderDuplicate, selectedCompanion]).id,
      "selected",
    );
  });

  it("keeps reciprocal companion choices independent", () => {
    const operatorA = {
      id: "a",
      status: "active",
      userId: "operator-a",
      currentCompanionId: "operator-b",
      updatedAt: new Date("2026-08-25T07:00:00Z"),
    };
    const operatorB = {
      id: "b",
      status: "active",
      userId: "operator-b",
      currentCompanionId: "operator-a",
      updatedAt: new Date("2026-08-25T07:00:00Z"),
    };

    assert.equal(selectCanonicalActiveWorkday([operatorA]).currentCompanionId, "operator-b");
    assert.equal(selectCanonicalActiveWorkday([operatorB]).currentCompanionId, "operator-a");
  });
});
