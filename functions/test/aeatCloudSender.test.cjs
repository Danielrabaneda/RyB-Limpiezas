const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getXmlValue,
  parseAeatSoapResponse,
  postSoapWithPfx,
} = require("../lib/aeatCloudSender");

test("el transporte rechaza cualquier destino ajeno a pruebas sin abrir conexiones", async () => {
  for (const endpoint of [
    "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    "https://example.com/", "http://127.0.0.1/",
    "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP?other=1",
  ]) {
    await assert.rejects(postSoapWithPfx({ endpoint }), /producción permanece bloqueada/);
  }
});

test("lee valores XML con prefijos y entidades", () => {
  const xml = "<soap:Envelope><sf:DescripcionErrorRegistro>Error &amp; detalle</sf:DescripcionErrorRegistro></soap:Envelope>";
  assert.equal(getXmlValue(xml, "DescripcionErrorRegistro"), "Error & detalle");
});

test("interpreta una respuesta aceptada de AEAT", () => {
  const result = parseAeatSoapResponse({
    statusCode: 200,
    body: [
      "<soapenv:Envelope><soapenv:Body>",
      "<sf:CSV>CSV-PRUEBA</sf:CSV>",
      "<sf:EstadoEnvio>Correcto</sf:EstadoEnvio>",
      "<sf:EstadoRegistro>Correcto</sf:EstadoRegistro>",
      "</soapenv:Body></soapenv:Envelope>",
    ].join(""),
  });
  assert.equal(result.transportOk, true);
  assert.equal(result.csv, "CSV-PRUEBA");
  assert.equal(result.recordState, "Correcto");
});

test("convierte un SOAP Fault en un fallo permanente", () => {
  const result = parseAeatSoapResponse({
    statusCode: 200,
    body: "<soap:Fault><faultstring>Solicitud incorrecta</faultstring></soap:Fault>",
  });
  assert.equal(result.transportOk, false);
  assert.equal(result.permanentFailure, true);
  assert.equal(result.message, "Solicitud incorrecta");
});

test("conserva el estado HTTP cuando falla el transporte", () => {
  const result = parseAeatSoapResponse({ statusCode: 503, body: "No disponible" });
  assert.equal(result.transportOk, false);
  assert.equal(result.httpStatus, 503);
  assert.match(result.message, /503/);
});
