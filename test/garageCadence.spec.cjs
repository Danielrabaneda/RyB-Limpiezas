const assert = require("node:assert/strict");

describe("Garage cadence", function () {
  let getGarageCadenceAnchorDate;
  let getGarageForecastTask;
  let getGarageFrequencyMonths;
  let getNextGarageCadenceDate;
  let isGarageCadenceMonth;
  let isGarageServiceBeforeNextCadence;

  before(async function () {
    ({
      getGarageCadenceAnchorDate,
      getGarageForecastTask,
      getGarageFrequencyMonths,
      getNextGarageCadenceDate,
      isGarageCadenceMonth,
      isGarageServiceBeforeNextCadence,
    } = await import("../src/utils/garageCadence.js"));
  });

  it("maps a quarterly garage task to three months", function () {
    assert.equal(
      getGarageFrequencyMonths({ frequencyType: "trimonthly" }),
      3,
    );
  });

  it("rebases future forecasts from the latest real completion", function () {
    const task = { frequencyType: "trimonthly" };
    const completed = [
      { status: "completed", scheduledDate: new Date(2026, 7, 7) },
    ];
    const futureTask = getGarageForecastTask(
      task,
      new Date(2026, 10, 1),
      completed,
    );

    assert.equal(
      getGarageCadenceAnchorDate(futureTask).getTime(),
      new Date(2026, 7, 7).getTime(),
    );
  });

  it("moves the next Correos quarterly forecast from October to November", function () {
    const task = {
      frequencyType: "trimonthly",
      garageCadenceAnchorDate: "2026-08-07",
    };
    assert.equal(isGarageCadenceMonth(task, new Date(2026, 9, 1)), false);
    assert.equal(isGarageCadenceMonth(task, new Date(2026, 10, 1)), true);
  });

  it("rejects a weekly rollover before the next quarterly garage date", function () {
    const task = {
      frequencyType: "trimonthly",
      garageCadenceAnchorDate: "2026-08-07",
    };

    assert.equal(
      getNextGarageCadenceDate(task).getTime(),
      new Date(2026, 10, 7).getTime(),
    );
    assert.equal(
      isGarageServiceBeforeNextCadence(
        { scheduledDate: new Date(2026, 7, 10) },
        task,
      ),
      true,
    );
    assert.equal(
      isGarageServiceBeforeNextCadence(
        { scheduledDate: new Date(2026, 10, 7) },
        task,
      ),
      false,
    );
  });

  it("does not rewrite the historical forecast before completion", function () {
    const task = {
      frequencyType: "trimonthly",
      garageCadenceAnchorDate: "2026-08-07",
    };
    const historicalTask = getGarageForecastTask(
      task,
      new Date(2026, 6, 1),
      [],
    );

    assert.equal(getGarageCadenceAnchorDate(historicalTask), null);
  });
});
