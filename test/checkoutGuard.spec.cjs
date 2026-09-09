const assert = require("node:assert/strict");

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

describe("Checkout notification guard", function () {
  let guard;

  before(async function () {
    guard = await import("../src/utils/checkoutGuard.js");
  });

  it("suppresses exit notifications while checkout is in progress", function () {
    const storage = createMemoryStorage();
    const now = 1_000_000;

    guard.markCheckoutInProgress("service-1", storage, now);

    assert.equal(
      guard.isCheckoutInProgress("service-1", storage, now + 1_000),
      true,
    );
  });

  it("restores tracking after checkout is cancelled", function () {
    const storage = createMemoryStorage();

    guard.markCheckoutInProgress("service-1", storage, 1_000_000);
    guard.clearCheckoutInProgress("service-1", storage);

    assert.equal(
      guard.isCheckoutInProgress("service-1", storage, 1_001_000),
      false,
    );
  });

  it("removes stale checkout guards", function () {
    const storage = createMemoryStorage();
    const now = 1_000_000;

    guard.markCheckoutInProgress("service-1", storage, now);

    assert.equal(
      guard.isCheckoutInProgress(
        "service-1",
        storage,
        now + guard.CHECKOUT_GUARD_TTL_MS + 1,
      ),
      false,
    );
    assert.equal(storage.getItem("checkout_in_progress_service-1"), null);
  });
});
