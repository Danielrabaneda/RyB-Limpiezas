const assert = require("node:assert/strict");

describe("GPS geofence configuration", function () {
  let gpsConfig;

  before(async function () {
    gpsConfig = await import("../src/config/gpsConfig.js");
  });

  it("uses the same configured exit radius for tracking and checkout", function () {
    assert.equal(
      gpsConfig.getCommunityExitRadiusMeters({
        geofenceRadiusMeters: 75,
      }),
      75 + gpsConfig.GPS_CONFIG.HYSTERESIS_BUFFER_METERS,
    );
  });

  it("falls back to the default geofence radius", function () {
    assert.equal(
      gpsConfig.getCommunityExitRadiusMeters({}),
      gpsConfig.GPS_CONFIG.DEFAULT_GEOFENCE_RADIUS_METERS +
        gpsConfig.GPS_CONFIG.HYSTERESIS_BUFFER_METERS,
    );
  });
});
