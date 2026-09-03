const assert = require("node:assert/strict");

describe("Pending services filters", function () {
  let filterPendingServices;

  before(async function () {
    ({ filterPendingServices } = await import("../src/utils/pendingServices.js"));
  });

  const today = new Date(2026, 7, 10, 12);
  const services = [
    {
      id: "old",
      communityId: "c1",
      assignedUserId: "u1",
      taskName: "Limpieza de Escalera",
      scheduledDate: new Date(2026, 7, 1),
      status: "pending",
    },
    {
      id: "today",
      communityId: "c2",
      assignedUserId: "u2",
      taskName: "Repaso de Portal",
      scheduledDate: new Date(2026, 7, 10),
      status: "pending",
    },
    {
      id: "future",
      communityId: "c1",
      assignedUserId: "u1",
      taskName: "Limpieza de Garaje",
      scheduledDate: new Date(2026, 7, 11),
      status: "pending",
    },
    {
      id: "done",
      communityId: "c1",
      assignedUserId: "u1",
      taskName: "Limpieza de Oficina",
      scheduledDate: new Date(2026, 7, 2),
      status: "completed",
    },
  ];

  const lookups = {
    today,
    communitiesById: {
      c1: { name: "Santa Ana" },
      c2: { name: "Correos" },
    },
    operariosById: {
      u1: { displayName: "Daniel Rabaneda" },
      u2: { displayName: "Alexandra Parraga" },
    },
  };

  it("shows only pending services through today", function () {
    assert.deepEqual(
      filterPendingServices(services, {}, lookups).map((item) => item.id),
      ["old", "today"],
    );
  });

  it("filters overdue services and excludes today", function () {
    assert.deepEqual(
      filterPendingServices(services, { timing: "overdue" }, lookups).map(
        (item) => item.id,
      ),
      ["old"],
    );
  });

  it("searches community, task and operator without accents", function () {
    assert.deepEqual(
      filterPendingServices(services, { search: "daniel" }, lookups).map(
        (item) => item.id,
      ),
      ["old"],
    );
    assert.deepEqual(
      filterPendingServices(services, { search: "correos" }, lookups).map(
        (item) => item.id,
      ),
      ["today"],
    );
  });

  it("combines task type and date filters", function () {
    assert.deepEqual(
      filterPendingServices(
        services,
        { type: "escalera", dateFrom: "2026-08-01", dateTo: "2026-08-05" },
        lookups,
      ).map((item) => item.id),
      ["old"],
    );
  });
});
