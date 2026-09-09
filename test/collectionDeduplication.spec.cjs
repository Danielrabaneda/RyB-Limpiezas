const assert = require("node:assert/strict");

describe("Collection deduplication", function () {
  let uniqueByStableId;
  let uniqueOperators;

  before(async function () {
    ({ uniqueByStableId, uniqueOperators } = await import(
      "../src/utils/collectionDeduplication.js"
    ));
  });

  it("renders the same scheduled-service document only once", function () {
    const first = { id: "service-1", status: "pending" };
    const refreshed = { id: "service-1", status: "pending", isRescheduled: true };
    assert.deepEqual(uniqueByStableId([first, refreshed]), [refreshed]);
  });

  it("renders one card per stable occurrence and prefers the moved card", function () {
    const occurrenceId = "task-1_worker-1_2026-08-10";
    const recreated = {
      id: "copy",
      occurrenceId,
      status: "pending",
    };
    const moved = {
      id: "original",
      occurrenceId,
      status: "pending",
      isTransferred: true,
      isRescheduled: true,
    };
    assert.deepEqual(uniqueByStableId([moved, recreated]), [moved]);
  });

  it("does not render legacy duplicates marked by the identity migration", function () {
    const original = { id: "original", status: "pending" };
    const hiddenCopy = {
      id: "copy",
      status: "pending",
      hiddenDuplicate: true,
      duplicateOf: "original",
    };
    assert.deepEqual(uniqueByStableId([original, hiddenCopy]), [original]);
  });

  it("renders an operator only once when repeated in the input", function () {
    const worker = { uid: "worker-1", name: "Jimena" };
    assert.deepEqual(uniqueOperators([worker, { ...worker }]), [worker]);
  });
});
