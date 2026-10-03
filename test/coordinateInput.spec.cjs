const assert = require("node:assert/strict");

describe("GPS coordinate input", function () {
  let parseCoordinateInput;
  let parseCoordinatePair;

  before(async function () {
    ({ parseCoordinateInput, parseCoordinatePair } = await import(
      "../src/utils/coordinateInput.js"
    ));
  });

  it("accepts coordinates written with a decimal point", function () {
    assert.equal(parseCoordinateInput("37.983810"), 37.98381);
    assert.equal(parseCoordinateInput("-1.129890"), -1.12989);
  });

  it("accepts coordinates pasted with a decimal comma", function () {
    assert.equal(parseCoordinateInput("37,983810"), 37.98381);
    assert.equal(parseCoordinateInput("-1,129890"), -1.12989);
  });

  it("keeps an empty field empty instead of inventing zero", function () {
    assert.equal(parseCoordinateInput(""), null);
    assert.equal(parseCoordinateInput("   "), null);
  });

  it("rejects invalid and out-of-range coordinates", function () {
    assert.equal(parseCoordinateInput("no es una coordenada"), null);
    assert.equal(parseCoordinateInput("181", 180), null);
  });

  it("splits a coordinate pair pasted from a map", function () {
    assert.deepEqual(parseCoordinatePair("37.983810, -1.129890"), {
      lat: "37.983810",
      lng: "-1.129890",
    });
    assert.deepEqual(parseCoordinatePair("37.983810,-1.129890"), {
      lat: "37.983810",
      lng: "-1.129890",
    });
    assert.deepEqual(parseCoordinatePair("37,983810; -1,129890"), {
      lat: "37.983810",
      lng: "-1.129890",
    });
  });
});
