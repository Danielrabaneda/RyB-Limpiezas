const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getXmlValue,
  parseAeatSoapResponse,
} = require("../lib/aeatCloudSender");

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
