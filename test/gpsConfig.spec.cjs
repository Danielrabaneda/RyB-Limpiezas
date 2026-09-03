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

  it("keeps the legacy confirmation delays when none are configured", function () {
    assert.equal(gpsConfig.getCommunityEntryConfirmDelayMs({}), 90_000);
    assert.equal(gpsConfig.getCommunityExitConfirmDelayMs({}), 300_000);
  });

  it("uses independent settings for a large community", function () {
    const community = {
      geofenceRadiusMeters: 80,
      exitGeofenceRadiusMeters: 220,
      entryConfirmDelaySeconds: 120,
      exitConfirmDelaySeconds: 600,
    };

    assert.equal(gpsConfig.getCommunityGeofenceRadiusMeters(community), 80);
    assert.equal(gpsConfig.getCommunityExitRadiusMeters(community), 220);
    assert.equal(gpsConfig.getCommunityEntryConfirmDelayMs(community), 120_000);
    assert.equal(gpsConfig.getCommunityExitConfirmDelayMs(community), 600_000);
  });

  it("falls back to a safe exit buffer when the configured exit is invalid", () => {
    assert.equal(
      gpsConfig.getCommunityExitRadiusMeters({
        geofenceRadiusMeters: 75,
        exitGeofenceRadiusMeters: 50,
      }),
      125,
    );
  });
});
