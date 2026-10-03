const assert = require("node:assert/strict");

describe("GPS coordinate input", function () {
  let parseCoordinateInput;
  let parseCoordinatePair;
  let getCoordinateFormPatch;

  before(async function () {
    ({ parseCoordinateInput, parseCoordinatePair, getCoordinateFormPatch } =
      await import("../src/utils/coordinateInput.js"));
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

  it("accepts the decorated text that Google Maps can place on the clipboard", function () {
    assert.deepEqual(
      parseCoordinatePair("\u200E(37.983810, \u22121.129890)\r\n"),
      {
        lat: "37.983810",
        lng: "-1.129890",
      },
    );
  });

  it("extracts coordinates when Google Maps copies a URL", function () {
    assert.deepEqual(
      parseCoordinatePair(
        "https://www.google.com/maps/@37.983810,-1.129890,17z",
      ),
      {
        lat: "37.983810",
        lng: "-1.129890",
      },
    );
  });

  it("fills both fields even when the browser delivers a paste as a normal input change", function () {
    assert.deepEqual(
      getCoordinateFormPatch("lat", "37.983810, -1.129890"),
      {
        lat: "37.983810",
        lng: "-1.129890",
      },
    );
    assert.deepEqual(getCoordinateFormPatch("lng", "-1.12"), {
      lng: "-1.12",
    });
  });
});
