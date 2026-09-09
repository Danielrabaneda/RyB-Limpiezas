const test = require("node:test");
const assert = require("node:assert/strict");

test("quote statuses map to the expected commercial stages", async () => {
  const { getQuoteOpportunityStage } = await import("../src/utils/quotePipeline.js");
  assert.deepEqual(getQuoteOpportunityStage("sent"), { stage: "quote_sent", probability: 60 });
  assert.deepEqual(getQuoteOpportunityStage("viewed"), { stage: "negotiation", probability: 75 });
  assert.deepEqual(getQuoteOpportunityStage("accepted"), { stage: "won", probability: 100 });
  assert.deepEqual(getQuoteOpportunityStage("converted_invoice"), { stage: "won", probability: 100 });
  assert.deepEqual(getQuoteOpportunityStage("rejected"), { stage: "lost", probability: 0 });
  assert.deepEqual(getQuoteOpportunityStage("expired"), { stage: "lost", probability: 0 });
  assert.equal(getQuoteOpportunityStage("draft"), null);
});

test("an opportunity created from a quote carries the commercial context", async () => {
  const { buildQuoteOpportunityData } = await import("../src/utils/quotePipeline.js");
  const result = buildQuoteOpportunityData({
    title: "Limpieza de oficinas",
    clientId: "client-1",
    clientName: "Oficina Atramur",
    clientAddress: "C/. Carmen, Alcantarilla",
    clientEmail: "cliente@example.com",
    clientPhone: "600000000",
    serviceType: "offices",
    total: 139.15,
    validUntil: "2026-12-08",
    owner: "Ana María",
  }, "sent");
  assert.equal(result.name, "Oficina Atramur - Limpieza de oficinas");
  assert.equal(result.stage, "quote_sent");
  assert.equal(result.estimatedValue, 139.15);
  assert.equal(result.email, "cliente@example.com");
  assert.equal(result.expectedCloseDate, "2026-12-08");
});
