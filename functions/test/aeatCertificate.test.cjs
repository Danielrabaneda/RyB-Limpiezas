const test = require("node:test");
const assert = require("node:assert/strict");
const forge = require("node-forge");
const {
  buildTenantSecretId,
  normalizeTaxId,
  parseAndValidatePfx,
} = require("../lib/aeatCertificate");

function createPfx(taxId = "B04843843", password = "prueba-segura") {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 90 * 86400000);
  const attrs = [{ name: "commonName", value: `EMPRESA PRUEBA ${taxId}` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary").toString("base64");
}

test("normaliza NIF y crea un identificador estable sin exponer el tenant", () => {
  assert.equal(normalizeTaxId(" b-04843843 "), "B04843843");
  assert.equal(buildTenantSecretId("empresa-1"), buildTenantSecretId("empresa-1"));
  assert.doesNotMatch(buildTenantSecretId("empresa-1"), /empresa-1/);
});

test("valida PFX, clave privada, NIF y vigencia", () => {
  const result = parseAndValidatePfx({
    pfxBase64: createPfx(),
    password: "prueba-segura",
    expectedTaxId: "B04843843",
  });
  assert.equal(result.metadata.taxId, "B04843843");
  assert.equal(result.metadata.daysRemaining, 90);
  assert.match(result.metadata.fingerprintSha256, /^[A-F0-9]{64}$/);
});

test("rechaza contraseña o NIF incorrectos", () => {
  const pfxBase64 = createPfx();
  assert.throws(
    () => parseAndValidatePfx({ pfxBase64, password: "incorrecta", expectedTaxId: "B04843843" }),
    /contraseña/,
  );
  assert.throws(
    () => parseAndValidatePfx({ pfxBase64, password: "prueba-segura", expectedTaxId: "B12345678" }),
    /no corresponde/,
  );
});
