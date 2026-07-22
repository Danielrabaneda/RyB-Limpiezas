const assert = require("assert");
const fs = require("fs");
const path = require("path");

describe("Root redirect multi-tenant regression", function () {
  it("does not enumerate root users or redirect to the retired setup route", function () {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/App.jsx"),
      "utf8",
    );
    const start = source.indexOf("function RootRedirect()");
    const end = source.indexOf("// ==================== APP", start);
    const rootRedirect = source.slice(start, end);

    assert.ok(start >= 0 && end > start, "RootRedirect must exist");
    assert.doesNotMatch(rootRedirect, /collection\(db,\s*["']users["']\)/);
    assert.doesNotMatch(rootRedirect, /["']\/setup["']/);
    assert.match(rootRedirect, /if \(!currentUser\)\s*{\s*return <LandingPage \/>/);
  });
});
