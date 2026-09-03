const assert = require("node:assert/strict");

describe("Task rollover policy", function () {
  let shouldNeverCarryTask;

  before(async function () {
    ({ shouldNeverCarryTask } = await import(
      "../src/utils/taskRolloverPolicy.js"
    ));
  });

  it("does not carry stair-cleaning cards", function () {
    assert.equal(shouldNeverCarryTask("Limpieza de escalera"), true);
  });

  it("does not carry portal-review cards", function () {
    assert.equal(shouldNeverCarryTask("Repaso de Portal"), true);
  });

  it("handles accents and case", function () {
    assert.equal(shouldNeverCarryTask("REPASO DEL PÓRTAL"), true);
  });

  it("keeps the existing carry behavior for other tasks", function () {
    assert.equal(shouldNeverCarryTask("Limpieza de cristales"), false);
  });
});
