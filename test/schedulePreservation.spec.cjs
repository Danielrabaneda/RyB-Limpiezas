const assert = require("node:assert/strict");

describe("Monthly schedule preservation", function () {
  let getPreservedScheduleKeys;
  let findSupersededOriginalServiceIds;

  before(async function () {
    ({ getPreservedScheduleKeys, findSupersededOriginalServiceIds } = await import(
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

  it("detects an original occurrence recreated after an approved move", function () {
    const moved = {
      id: "moved",
      ...base,
      isTransferred: true,
      transferValidated: true,
      originalAssignedUserId: "worker-a",
      isRescheduled: true,
      rescheduleValidated: true,
      originalDate: new Date(2026, 7, 13),
    };
    const recreatedOriginal = {
      id: "stale-original",
      communityTaskId: "task-1",
      assignedUserId: "worker-a",
      scheduledDate: new Date(2026, 7, 13),
      status: "pending",
    };
    assert.deepEqual(
      [...findSupersededOriginalServiceIds([moved, recreatedOriginal])],
      ["stale-original"],
    );
  });

  it("detects an original assignment recreated after an approved transfer", function () {
    const transferred = {
      id: "transferred",
      ...base,
      isTransferred: true,
      transferValidated: true,
      originalAssignedUserId: "worker-a",
    };
    const recreatedOriginal = {
      id: "stale-original",
      communityTaskId: "task-1",
      assignedUserId: "worker-a",
      scheduledDate: new Date(2026, 7, 14),
      status: "pending",
    };
    assert.deepEqual(
      [...findSupersededOriginalServiceIds([transferred, recreatedOriginal])],
      ["stale-original"],
    );
  });

  it("never removes a completed original service", function () {
    const moved = {
      id: "moved",
      ...base,
      isRescheduled: true,
      rescheduleValidated: true,
      originalDate: new Date(2026, 7, 13),
    };
    const completed = {
      id: "completed",
      communityTaskId: "task-1",
      assignedUserId: "worker-b",
      scheduledDate: new Date(2026, 7, 13),
      status: "completed",
    };
    assert.equal(findSupersededOriginalServiceIds([moved, completed]).size, 0);
  });
});
