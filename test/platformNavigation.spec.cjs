const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Global platform navigation", function () {
  const appSource = fs.readFileSync(
    path.resolve("src/App.jsx"),
    "utf8",
  );
  const dashboardSource = fs.readFileSync(
    path.resolve("src/pages/admin/DashboardPage.jsx"),
    "utf8",
  );
  const platformLayoutSource = fs.readFileSync(
    path.resolve("src/components/layout/PlatformLayout.jsx"),
    "utf8",
  );

  it("hosts platform pages under their own protected layout", function () {
    assert.match(
      appSource,
      /path="\/plataforma"[\s\S]*?<PlatformLayout \/>/,
    );
    assert.match(
      appSource,
      /path="empresas"[\s\S]*?<PlatformDashboardPage \/>/,
    );
    assert.match(
      appSource,
      /path="solicitudes"[\s\S]*?<CompanyRequestsPage \/>/,
    );
  });

  it("keeps backwards-compatible redirects from the tenant admin", function () {
    assert.match(appSource, /to="\/plataforma\/solicitudes"/);
    assert.match(appSource, /to="\/plataforma\/empresas"/);
  });

  it("opens the global console outside the tenant admin module", function () {
    assert.match(
      dashboardSource,
      /navigate\("\/plataforma\/empresas"\)/,
    );
  });

  it("keeps requests and the pending counter in the platform layout", function () {
    assert.match(platformLayoutSource, /\/plataforma\/solicitudes/);
    assert.match(platformLayoutSource, /listCompanyRequests/);
    assert.match(platformLayoutSource, /pendingLeads/);
  });
});
