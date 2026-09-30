const assert = require("node:assert/strict");

describe("Quote section identity", function () {
  it("mantiene la misma clave al renombrar una zona", async function () {
    const { getQuoteSectionKey } = await import("../src/utils/quoteSections.js");
    const original = [
      { id: "line-1", section: "Limpieza escaleras" },
      { id: "line-2", section: "Limpieza escaleras" },
    ];
    const renamed = original.map((line) => ({ ...line, section: "Escaleras y portal" }));

    assert.equal(getQuoteSectionKey(original, "Limpieza escaleras"), "line-1");
    assert.equal(getQuoteSectionKey(renamed, "Escaleras y portal"), "line-1");
  });

  it("usa el nombre como respaldo si la zona aun no tiene partidas", async function () {
    const { getQuoteSectionKey } = await import("../src/utils/quoteSections.js");

    assert.equal(getQuoteSectionKey([], "Nueva zona"), "Nueva zona");
  });
});
