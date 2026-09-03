const assert = require("assert");
const fs = require("fs");
const path = require("path");

describe("Root redirect multi-tenant regression", function () {
  it("does not enumerate root users or redirect to the retired setup route", function () {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/App.jsx"),
      "utf8",
    );
    const start = source.indexOf("function RootRedirect(");
    const end = source.indexOf("// ==================== APP", start);
    const rootRedirect = source.slice(start, end);

    assert.ok(start >= 0 && end > start, "RootRedirect must exist");
    assert.doesNotMatch(rootRedirect, /collection\(db,\s*["']users["']\)/);
    assert.doesNotMatch(rootRedirect, /["']\/setup["']/);
    assert.match(rootRedirect, /return <LandingPage \/>/);
  });
});

describe("Installed app launch", function () {
  const vm = require("node:vm");
  const { transformSync } = require("esbuild");
  const source = fs.readFileSync(path.resolve(__dirname, "../src/App.jsx"), "utf8");
  const start = source.indexOf("function RootRedirect(");
  const end = source.indexOf("// ==================== APP", start);
  const code = transformSync(source.slice(start, end), { loader: "jsx" }).code;

  function launch({ appEntry = false, standalone = false, ios = false,
    currentUser = null, role, loading = false, width = 390 } = {}) {
    const context = {
      React: { createElement: (type, props) => ({ type, props }) },
      useAuth: () => ({ currentUser, userProfile: role ? { role } : null, loading }),
      window: {
        matchMedia: () => ({ matches: standalone }),
        navigator: { standalone: ios },
        innerWidth: width,
      },
      Navigate: "Navigate", LandingPage: "LandingPage",
    };
    vm.createContext(context);
    vm.runInContext(code, context);
    return context.RootRedirect({ appEntry });
  }

  it("keeps the landing for normal browser visits, including mobile", function () {
    assert.equal(launch().type, "LandingPage");
    assert.equal(launch({ width: 1280 }).type, "LandingPage");
  });

  it("sends new installations without a session to login", function () {
    const result = launch({ appEntry: true });
    assert.equal(result.props.to, "/login");
    assert.equal(result.props.replace, true);
  });

  it("rescues existing Android and iPhone installations launching at root", function () {
    assert.equal(launch({ standalone: true }).props.to, "/login");
    assert.equal(launch({ ios: true }).props.to, "/login");
  });

  it("waits for session restoration before redirecting", function () {
    assert.equal(launch({ appEntry: true, loading: true }).type, "div");
  });

  it("preserves authenticated worker and admin destinations", function () {
    assert.equal(launch({ appEntry: true, currentUser: {}, role: "operario" }).props.to, "/operario");
    assert.equal(launch({ appEntry: true, currentUser: {}, role: "admin" }).props.to, "/operario");
    assert.equal(launch({ appEntry: true, currentUser: {}, role: "admin", width: 1280 }).props.to, "/admin");
  });

  it("uses the app entry while preserving the existing installation identity", function () {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../public/manifest.json"), "utf8"));
    assert.equal(manifest.start_url, "/app");
    assert.equal(manifest.id, "/");
    assert.equal(manifest.scope, "/");
    assert.match(source, /path="\/app" element={<RootRedirect appEntry \/>}/);
  });
});
