const assert = require("node:assert/strict");

describe("Stable scheduled-service identity", function () {
  let buildScheduleOccurrenceId;
  let getScheduleOccurrenceIdentity;
  let getScheduleOccurrenceDocumentId;
  let buildScheduleIdentityMigrationPlan;

  before(async function () {
    ({
      buildScheduleOccurrenceId,
      getScheduleOccurrenceIdentity,
      getScheduleOccurrenceDocumentId,
      buildScheduleIdentityMigrationPlan,
    } = await import("../src/utils/scheduleIdentity.js"));
  });

  it("builds the same identity after a transfer and date change", function () {
    const originalDate = new Date(2026, 7, 10);
    const occurrenceId = buildScheduleOccurrenceId(
      "task-1",
      "daniel",
      originalDate,
    );
    const moved = getScheduleOccurrenceIdentity({
      communityTaskId: "task-1",
      assignedUserId: "kesia",
      originalAssignedUserId: "daniel",
      scheduledDate: new Date(2026, 7, 11),
      originalDate,
      isTransferred: true,
      transferValidated: true,
      isRescheduled: true,
      rescheduleValidated: true,
    });

    assert.equal(moved.occurrenceId, occurrenceId);
  });

  it("keeps an explicit occurrence identity through later transfers", function () {
    const identity = getScheduleOccurrenceIdentity({
      occurrenceId: "task-1_daniel_2026-08-10",
      occurrenceOriginalAssignedUserId: "daniel",
      occurrenceOriginalDate: new Date(2026, 7, 10),
      communityTaskId: "task-1",
      assignedUserId: "alexandra",
      originalAssignedUserId: "kesia",
      scheduledDate: new Date(2026, 7, 12),
      isTransferred: true,
      transferValidated: true,
    });

    assert.equal(identity.occurrenceId, "task-1_daniel_2026-08-10");
    assert.equal(identity.originalAssignedUserId, "daniel");
  });

  it("uses a Firestore-safe deterministic document id", function () {
    assert.equal(
      getScheduleOccurrenceDocumentId("task/1_worker_2026-08-10"),
      "task%2F1_worker_2026-08-10",
    );
  });

  it("keeps the moved card and marks a recreated pending original for removal", function () {
    const originalDate = new Date(2026, 7, 10);
    const plan = buildScheduleIdentityMigrationPlan([
      {
        id: "recreated",
        communityTaskId: "task-1",
        assignedUserId: "daniel",
        scheduledDate: originalDate,
        status: "pending",
        createdAt: new Date(2026, 7, 10, 12),
      },
      {
        id: "moved",
        communityTaskId: "task-1",
        assignedUserId: "kesia",
        originalAssignedUserId: "daniel",
        scheduledDate: new Date(2026, 7, 11),
        originalDate,
        isTransferred: true,
        transferValidated: true,
        isRescheduled: true,
        rescheduleValidated: true,
        status: "pending",
        createdAt: new Date(2026, 6, 31),
      },
    ]);

    assert.equal(plan.length, 1);
    assert.equal(plan[0].canonical.id, "moved");
    assert.deepEqual(plan[0].pendingDuplicateIds, ["recreated"]);
  });

  it("never removes historical worked cards", function () {
    const date = new Date(2026, 7, 10);
    const plan = buildScheduleIdentityMigrationPlan([
      {
        id: "completed",
        communityTaskId: "task-1",
        assignedUserId: "daniel",
        scheduledDate: date,
        status: "completed",
      },
      {
        id: "pending-copy",
        communityTaskId: "task-1",
        assignedUserId: "daniel",
        scheduledDate: date,
        status: "pending",
      },
    ]);

    assert.equal(plan[0].canonical.id, "completed");
    assert.deepEqual(plan[0].pendingDuplicateIds, ["pending-copy"]);
    assert.deepEqual(plan[0].retainedHistoricalDuplicateIds, []);
  });
});
