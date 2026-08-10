const assert = require("node:assert/strict");

describe("Monthly schedule preservation", function () {
  let getPreservedScheduleKeys;

  before(async function () {
    ({ getPreservedScheduleKeys } = await import(
      "../src/utils/schedulePreservation.js"
    ));
  });

  const base = {
    communityTaskId: "task-1",
    assignedUserId: "worker-b",
    scheduledDate: new Date(2026, 7, 14),
  };

  it("preserves the original assignment after an approved transfer", function () {
    const keys = getPreservedScheduleKeys({
      ...base,
      isTransferred: true,
      transferValidated: true,
      originalAssignedUserId: "worker-a",
    });
    assert(keys.has("task-1_worker-a_2026-08-14"));
    assert(keys.has("task-1_worker-b_2026-08-14"));
  });

  it("preserves the original date after an approved reschedule", function () {
    const keys = getPreservedScheduleKeys({
      ...base,
      isRescheduled: true,
      rescheduleValidated: true,
      originalDate: new Date(2026, 7, 7),
    });
    assert(keys.has("task-1_worker-b_2026-08-07"));
    assert(keys.has("task-1_worker-b_2026-08-14"));
  });

  it("preserves the original user and date when both were changed", function () {
    const keys = getPreservedScheduleKeys({
      ...base,
      isTransferred: true,
      transferValidated: true,
      originalAssignedUserId: "worker-a",
      isRescheduled: true,
      rescheduleValidated: true,
      originalDate: new Date(2026, 7, 7),
    });
    assert(keys.has("task-1_worker-a_2026-08-07"));
  });

  it("does not preserve an unapproved requested change", function () {
    const keys = getPreservedScheduleKeys({
      ...base,
      isTransferred: true,
      transferValidated: false,
      originalAssignedUserId: "worker-a",
    });
    assert.equal(keys.has("task-1_worker-a_2026-08-14"), false);
  });
});
