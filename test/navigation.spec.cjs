const assert = require("node:assert/strict");

describe("Community navigation", function () {
  let buildCommunityNavigationUrl;
  let canNavigateToCommunity;

  before(async function () {
    ({ buildCommunityNavigationUrl, canNavigateToCommunity } = await import(
      "../src/utils/navigation.js"
    ));
  });

  const community = {
    name: "Comunidad Prueba",
    address: "Calle Mayor 1, Murcia",
    location: { latitude: 37.9838, longitude: -1.1299 },
  };

  it("opens the Android default maps handler with coordinates", function () {
    const url = buildCommunityNavigationUrl(community, "Android");
    assert.match(url, /^geo:0,0\?q=/);
    assert.match(decodeURIComponent(url), /37\.9838,-1\.1299/);
  });

  it("opens Apple Maps navigation on iPhone", function () {
    assert.equal(
      buildCommunityNavigationUrl(community, "iPhone"),
      "maps://?daddr=37.9838%2C-1.1299&dirflg=d",
    );
  });

  it("uses Google Maps in a desktop browser", function () {
    assert.equal(
      buildCommunityNavigationUrl(community, "Mozilla/5.0 Windows"),
      "https://www.google.com/maps/dir/?api=1&destination=37.9838%2C-1.1299",
    );
  });

  it("falls back to the address when coordinates are unavailable", function () {
    const url = buildCommunityNavigationUrl(
      { name: "Sin GPS", address: "Gran Vía 2, Murcia" },
      "Android",
    );
    assert.match(decodeURIComponent(url), /Gran Vía 2, Murcia/);
  });

  it("does not offer navigation without coordinates or address", function () {
    assert.equal(canNavigateToCommunity({ name: "Sin destino" }), false);
  });

  it("does not crash when the community is null", function () {
    assert.equal(canNavigateToCommunity(null), false);
    assert.equal(buildCommunityNavigationUrl(null, "iPhone"), null);
  });
});
