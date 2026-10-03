const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAeatSubmissionDraftXml,
  buildAeatOfficialSoapEnvelope,
  buildSubmissionManifest,
  getInitialSubmissionStatus,
  normalizeAeatConnectionProfile,
  getRetryDelayMs,
  getNextRetryDate,
  isAeatGenerationTimestampFresh,
} = require("../lib/aeatSubmission");

const fiscalRecord = {
  invoiceId: "invoice-1",
  recordType: "alta",
  invoiceType: "F1",
  issuerNif: "B04843843",
  invoiceNumber: "A-2026-0001",
  fechaExpedicionFactura: "26-07-2026",
  fechaHoraHusoGenRegistro: "2026-07-26T12:30:00+02:00",
  subtotal: 100,
  taxAmount: 21,
  surchargeAmount: 0,
  totalAmount: 121,
  client: {
    name: "Comunidad & Portal",
    taxId: "H12345678",
    idType: "NIF",
    countryCode: "ES",
  },
  taxBreakdown: [
    {
      taxTreatment: "taxable",
      taxRate: 21,
      taxableBase: 100,
      taxAmount: 21,
    },
  ],
  chain: {
    previousFiscalRecordId: "alta_previous",
    previousHash: "ABC",
    hash: "DEF",
    algorithm: "SHA-256",
  },
};

test("normaliza el canal sin admitir producción ni credenciales", () => {
  const profile = normalizeAeatConnectionProfile({
    channel: "delegated",
    environment: "production",
    adviserName: "Asesoría Fiscal",
    adviserTaxId: "b12345678",
    certificate: "NO-DEBE-GUARDARSE",
  });

  assert.equal(profile.channel, "delegated");
  assert.equal(profile.environment, "test");
  assert.equal(profile.adviserTaxId, "B12345678");
  assert.equal(profile.productionEnabled, false);
  assert.equal(profile.credentialsStored, false);
  assert.equal("certificate" in profile, false);
});

test("asigna una espera distinta al asesor y al conector local", () => {
  assert.equal(getInitialSubmissionStatus("delegated"), "awaiting_sender");
  assert.equal(
    getInitialSubmissionStatus("local_connector"),
    "awaiting_local_connector",
  );
  assert.equal(getInitialSubmissionStatus("disabled"), null);
});

test("genera un paquete XML de pruebas estable y escapado", () => {
  const xml = buildAeatSubmissionDraftXml(fiscalRecord, {
    companyName: "Limpiezas Rayba S.L",
  });

  assert.match(xml, /<ryb:Entorno>PRUEBAS<\/ryb:Entorno>/);
  assert.match(
    xml,
    /<ryb:ProduccionHabilitada>false<\/ryb:ProduccionHabilitada>/,
  );
  assert.match(xml, /Comunidad &amp; Portal/);
  assert.match(xml, /<ryb:Huella>DEF<\/ryb:Huella>/);
  assert.doesNotMatch(xml, /NO-DEBE-GUARDARSE/);
});

test("genera el sobre SOAP 1.1 oficial sin habilitar producción", () => {
  const current = {
    ...fiscalRecord,
    companyId: "rayba",
    items: [{ description: "Limpieza & mantenimiento" }],
    chain: { ...fiscalRecord.chain, hash: "D".repeat(64), previousHash: "A".repeat(64) },
  };
  const previous = {
    issuerNif: "B04843843",
    invoiceNumber: "A-2026-0000",
    fechaExpedicionFactura: "25-07-2026",
    chain: { hash: "A".repeat(64) },
  };
  const xml = buildAeatOfficialSoapEnvelope(current, {
    companyName: "Limpiezas Rayba S.L",
  }, previous);
  assert.match(xml, /soapenv:Envelope/);
  assert.match(xml, /sfLR:RegFactuSistemaFacturacion/);
  assert.match(xml, /<sf:IDVersion>1.0<\/sf:IDVersion>/);
  assert.match(xml, /<sf:CalificacionOperacion>S1<\/sf:CalificacionOperacion>/);
  assert.match(xml, /Limpieza &amp; mantenimiento/);
  assert.match(xml, /<sf:TipoHuella>01<\/sf:TipoHuella>/);
  assert.doesNotMatch(xml, /www1\.agenciatributaria/);
});

test("marca las altas de subsanación con el indicador oficial", () => {
  const xml = buildAeatOfficialSoapEnvelope({
    ...fiscalRecord,
    recordType: "alta_subsanacion",
    subsanacion: true,
  }, {
    companyName: "Limpiezas Rayba S.L",
  });

  assert.match(xml, /<sf:RegistroAlta>/);
  assert.match(xml, /<sf:Subsanacion>S<\/sf:Subsanacion>/);
});

test("impide el primer envío cuando la hora fiscal ya ha caducado", () => {
  const now = new Date("2026-08-29T19:00:00.000Z");
  assert.equal(
    isAeatGenerationTimestampFresh("2026-08-29T20:57:30+02:00", now),
    true,
  );
  assert.equal(
    isAeatGenerationTimestampFresh("2026-08-29T20:56:00+02:00", now),
    false,
  );
  assert.equal(isAeatGenerationTimestampFresh("fecha-no-valida", now), false);
});

test("el manifiesto enlaza la cola con la huella fiscal inmutable", () => {
  const profile = normalizeAeatConnectionProfile({
    channel: "local_connector",
    connectorName: "PC Administración",
  });
  const manifest = buildSubmissionManifest({
    companyId: "rayba",
    fiscalRecordId: "alta_invoice-1",
    fiscalRecord,
    profile,
  });

  assert.equal(manifest.fiscalHash, "DEF");
  assert.equal(manifest.channel, "local_connector");
  assert.equal(manifest.productionEnabled, false);
});

test("los reintentos usan espera exponencial limitada", () => {
  assert.equal(getRetryDelayMs(0), 60_000);
  assert.equal(getRetryDelayMs(3), 480_000);
  assert.equal(getRetryDelayMs(20), 24 * 60 * 60 * 1000);
  assert.equal(
    getNextRetryDate(1, new Date("2026-01-01T00:00:00.000Z")).toISOString(),
    "2026-01-01T00:02:00.000Z",
  );
});
