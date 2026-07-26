"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clampAutoCloseEndTime,
  getMadridDateKey,
} = require("../lib/workdayAutoClose");

test("uses the Madrid calendar date across the UTC day boundary", () => {
  assert.equal(
    getMadridDateKey(new Date("2026-07-22T22:30:00.000Z")),
    "2026-07-23",
  );
});

test("keeps the estimated end when it is inside the safe interval", () => {
  const result = clampAutoCloseEndTime(
    new Date("2026-07-23T12:00:00.000Z"),
    null,
    new Date("2026-07-23T16:00:00.000Z"),
  );
  assert.equal(result.toISOString(), "2026-07-23T12:00:00.000Z");
});

test("does not end a workday before its last related check-in", () => {
  const result = clampAutoCloseEndTime(
    new Date("2026-07-23T12:00:00.000Z"),
    new Date("2026-07-23T14:00:00.000Z"),
    new Date("2026-07-23T16:00:00.000Z"),
  );
  assert.equal(result.toISOString(), "2026-07-23T14:00:00.000Z");
});

test("never extends an automatic closure beyond the 12-hour cutoff", () => {
  const result = clampAutoCloseEndTime(
    new Date("2026-07-23T18:00:00.000Z"),
    null,
    new Date("2026-07-23T16:00:00.000Z"),
  );
  assert.equal(result.toISOString(), "2026-07-23T16:00:00.000Z");
});
