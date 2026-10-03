const assert = require("node:assert/strict");

describe("Task presentation and carry-over", function () {
  let groupServicesByTaskPresentation;

  before(async function () {
    ({ groupServicesByTaskPresentation } = await import(
      "../src/utils/taskPresentation.js"
    ));
  });

  const tasks = [
    { id: "portal", taskName: "Limpieza de portal", displayMode: "standalone" },
    { id: "escalera", taskName: "Limpieza de escalera", displayMode: "standalone" },
    {
      id: "cristales",
      taskName: "Limpiar cristales",
      displayMode: "embedded",
      hostTaskIds: ["portal", "escalera"],
      carryUntilCompleted: true,
    },
  ];

  function service(id, communityTaskId, status = "pending", communityId = "c1") {
    return {
      id,
      communityTaskId,
      communityId,
      assignedUserId: "worker-a",
      status,
      tasks: [{ id: communityTaskId, taskName: communityTaskId }],
    };
  }

  it("keeps standalone tasks in their own cards", function () {
    const groups = groupServicesByTaskPresentation(
      [service("s-portal", "portal"), service("s-escalera", "escalera")],
      tasks,
    );
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => group.groupedServices.length), [1, 1]);
  });

  it("places an embedded task in its primary card", function () {
    const groups = groupServicesByTaskPresentation(
      [
        service("s-portal", "portal"),
        service("s-escalera", "escalera"),
        service("s-glass", "cristales"),
      ],
      tasks,
    );
    assert.deepEqual(
      groups[0].groupedServices.map((item) => item.id),
      ["s-portal", "s-glass"],
    );
  });

  it("moves the same pending task to the secondary card when primary is complete", function () {
    const groups = groupServicesByTaskPresentation(
      [
        service("s-portal", "portal", "completed"),
        service("s-escalera", "escalera"),
        service("s-glass", "cristales"),
      ],
      tasks,
    );
    const secondary = groups.find((group) => group.id === "s-escalera");
    assert.deepEqual(
      secondary.groupedServices.map((item) => item.id),
      ["s-escalera", "s-glass"],
    );
    const occurrences = groups
      .flatMap((group) => group.groupedServices)
      .filter((item) => item.id === "s-glass");
    assert.equal(occurrences.length, 1);
  });

  it("uses a standalone fallback when no host is available", function () {
    const groups = groupServicesByTaskPresentation(
      [
        service("s-portal", "portal", "completed"),
        service("s-escalera", "escalera", "completed"),
        service("s-glass", "cristales"),
      ],
      tasks,
    );
    const fallback = groups.find((group) => group.id === "s-glass");
    assert.equal(fallback.presentationFallback, true);
    assert.equal(fallback.groupedServices.length, 1);
  });

  it("never embeds a task in another community or worker", function () {
    const embedded = service("s-glass", "cristales", "pending", "c1");
    const host = {
      ...service("s-portal", "portal", "pending", "c2"),
      assignedUserId: "worker-b",
    };
    const groups = groupServicesByTaskPresentation([host, embedded], tasks);
    assert.equal(groups.length, 2);
    assert.equal(groups.find((group) => group.id === "s-glass").presentationFallback, true);
  });
});
