const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DAY_MS,
  TRIAL_DURATION_DAYS,
  TRIAL_DELETION_GRACE_DAYS,
  buildTrialLifecycle,
  isTrialReadyForDeletion,
} = require("../lib/trialLifecycle");

test("la prueba dura 30 días y conserva 7 días para contratar", () => {
  const now = Date.UTC(2026, 7, 14, 10, 0, 0);
  const lifecycle = buildTrialLifecycle(now);

  assert.equal(
    lifecycle.trialEndsAtMs,
    now + TRIAL_DURATION_DAYS * DAY_MS,
  );
  assert.equal(
    lifecycle.dataDeletionAtMs,
    lifecycle.trialEndsAtMs + TRIAL_DELETION_GRACE_DAYS * DAY_MS,
  );
});

test("solo elimina pruebas impagadas después de la fecha prevista", () => {
  const now = Date.UTC(2026, 7, 14, 10, 0, 0);
  const dataDeletionAt = { toMillis: () => now };

  assert.equal(
    isTrialReadyForDeletion({ subscriptionStatus: "trialing", dataDeletionAt }, now),
    true,
  );
  assert.equal(
    isTrialReadyForDeletion({ subscriptionStatus: "active", dataDeletionAt }, now),
    false,
  );
  assert.equal(
    isTrialReadyForDeletion(
      { subscriptionStatus: "trialing", dataDeletionAt: { toMillis: () => now + 1 } },
      now,
    ),
    false,
  );
});
