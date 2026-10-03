const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Pipeline ganado y alta de comunidad", function () {
  it("solo ofrece crear comunidad al entrar en Ganado sin una comunidad vinculada", async function () {
    const { shouldOfferCommunityCreation } = await import(
      "../src/utils/pipelineCommunityDraft.js"
    );

    assert.equal(
      shouldOfferCommunityCreation({ stage: "proposal" }, "won"),
      true,
    );
    assert.equal(
      shouldOfferCommunityCreation({ stage: "won" }, "won"),
      false,
    );
    assert.equal(
      shouldOfferCommunityCreation({ stage: "proposal", clientId: "community-1" }, "won"),
      false,
    );
    assert.equal(
      shouldOfferCommunityCreation({ stage: "proposal" }, "negotiation"),
      false,
    );
  });

  it("prepara la ficha con los datos disponibles de la oportunidad", async function () {
    const { buildCommunityDraftFromOpportunity } = await import(
      "../src/utils/pipelineCommunityDraft.js"
    );

    assert.deepEqual(
      buildCommunityDraftFromOpportunity({
        name: "Comunidad El Sol - Limpieza semanal",
        contactName: "Comunidad El Sol",
        clientAddress: "Calle Mayor 12, Murcia",
        phone: "600 123 123",
        email: "presidencia@example.com",
      }),
      {
        name: "Comunidad El Sol",
        address: "Calle Mayor 12, Murcia",
        type: "comunidad",
        contactPerson: "Comunidad El Sol",
        contactPhone: "600 123 123",
        billingAddress: "Calle Mayor 12, Murcia",
        billingEmail: "presidencia@example.com",
      },
    );
  });

  it("conecta la confirmacion del pipeline con el formulario de comunidades", function () {
    const pipeline = fs.readFileSync(
      path.join(__dirname, "../src/pages/admin/PipelinePage.jsx"),
      "utf8",
    );
    const communities = fs.readFileSync(
      path.join(__dirname, "../src/pages/admin/CommunitiesPage.jsx"),
      "utf8",
    );

    assert.match(pipeline, /shouldOfferCommunityCreation\(opp, stage\)/);
    assert.match(pipeline, /<WonCommunityPrompt/);
    assert.match(pipeline, /setModal\(\(current\) => current\?\.id === opp\.id/);
    assert.match(pipeline, /navigate\("\/admin\/comunidades",\s*\{\s*state:/);
    assert.match(communities, /location\.state\?\.communityDraft/);
    assert.match(communities, /openCreateModal\(communityDraft\)/);
  });

  it("permite reabrir la ficha desde una oportunidad ganada sin comunidad vinculada", function () {
    const pipeline = fs.readFileSync(
      path.join(__dirname, "../src/pages/admin/PipelinePage.jsx"),
      "utf8",
    );

    assert.match(pipeline, /stage\.id === "won" && !o\.clientId/);
    assert.match(pipeline, /Crear ficha de comunidad/);
    assert.match(pipeline, /onClick=\{\(\) => openCommunityForm\(o\)\}/);
  });
});
