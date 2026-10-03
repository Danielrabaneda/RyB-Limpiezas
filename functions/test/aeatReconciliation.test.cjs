const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildAeatQuerySoapEnvelope, parseAeatQueryResponse, evaluateAeatReconciliation } = require('../lib/aeatReconciliation');

const expected = { issuerNif: 'B12345678', invoiceNumber: 'TEST-VF-2026-0001', issueDate: '31-07-2026',
  fingerprint: 'A'.repeat(64), recordType: 'alta' };

function response({ nif = expected.issuerNif, number = expected.invoiceNumber, date = expected.issueDate,
  fingerprint = expected.fingerprint, state = 'Correcto', result = 'ConDatos', pagination = 'N' } = {}) {
  const entry = result === 'ConDatos' ? `<r:RegistroRespuestaConsultaFactuSistemaFacturacion><r:IDFactura><s:IDEmisorFactura>${nif}</s:IDEmisorFactura><s:NumSerieFactura>${number}</s:NumSerieFactura><s:FechaExpedicionFactura>${date}</s:FechaExpedicionFactura></r:IDFactura><r:DatosRegistroFacturacion><r:Huella>${fingerprint}</r:Huella></r:DatosRegistroFacturacion><r:EstadoRegistro><r:TimestampUltimaModificacion>2026-08-30T12:00:00+02:00</r:TimestampUltimaModificacion><r:EstadoRegistro>${state}</r:EstadoRegistro></r:EstadoRegistro></r:RegistroRespuestaConsultaFactuSistemaFacturacion>` : '';
  return `<soap:Envelope><soap:Body><r:RespuestaConsultaFactuSistemaFacturacion><r:Cabecera/><r:PeriodoImputacion/><r:IndicadorPaginacion>${pagination}</r:IndicadorPaginacion><r:ResultadoConsulta>${result}</r:ResultadoConsulta>${entry}</r:RespuestaConsultaFactuSistemaFacturacion></soap:Body></soap:Envelope>`;
}

test('construye una consulta oficial exacta y escapada', () => {
  const xml = buildAeatQuerySoapEnvelope({ ...expected, fechaExpedicionFactura: expected.issueDate,
    invoiceNumber: 'TEST&1', system: { producer: 'LimpiaGest' } }, { companyName: 'Empresa & Uno', nif: expected.issuerNif });
  assert.match(xml, /ConsultaFactuSistemaFacturacion/);
  assert.match(xml, /<sf:Ejercicio>2026<\/sf:Ejercicio><sf:Periodo>07<\/sf:Periodo>/);
  assert.match(xml, /<sfLRC:NumSerieFactura>TEST&amp;1<\/sfLRC:NumSerieFactura>/);
  assert.match(xml, /<sf:FechaExpedicionFactura>31-07-2026<\/sf:FechaExpedicionFactura>/);
  assert.doesNotMatch(xml, /RegFactuSistemaFacturacion/);
});

test('interpreta y confirma una única coincidencia con la misma huella', () => {
  const parsed = parseAeatQueryResponse({ statusCode: 200, body: response() });
  assert.equal(parsed.transportOk, true);
  assert.equal(parsed.entries.length, 1);
  assert.equal(evaluateAeatReconciliation(parsed, expected).outcome, 'accepted');
});

test('mantiene revisión si no hay datos, cambia la huella o hay paginación', () => {
  const none = parseAeatQueryResponse({ statusCode: 200, body: response({ result: 'SinDatos' }) });
  assert.equal(evaluateAeatReconciliation(none, expected).outcome, 'not_found');
  const wrongHash = parseAeatQueryResponse({ statusCode: 200, body: response({ fingerprint: 'B'.repeat(64) }) });
  assert.equal(evaluateAeatReconciliation(wrongHash, expected).outcome, 'needs_review');
  const paged = parseAeatQueryResponse({ statusCode: 200, body: response({ pagination: 'S' }) });
  assert.equal(evaluateAeatReconciliation(paged, expected).outcome, 'needs_review');
});

test('una anulación solo se confirma cuando AEAT muestra el estado Anulada', () => {
  const parsed = parseAeatQueryResponse({ statusCode: 200, body: response({ state: 'Anulada', fingerprint: 'OLD' }) });
  assert.equal(evaluateAeatReconciliation(parsed, { ...expected, fingerprint: 'NEW', recordType: 'anulacion' }).outcome, 'accepted');
  assert.equal(evaluateAeatReconciliation(parseAeatQueryResponse({ statusCode: 200, body: response() }),
    { ...expected, recordType: 'anulacion' }).outcome, 'needs_review');
});

test('rechaza HTTP, SOAP Fault y respuestas que no son de consulta', () => {
  assert.equal(parseAeatQueryResponse({ statusCode: 503, body: '' }).transportOk, false);
  assert.equal(parseAeatQueryResponse({ statusCode: 200, body: '<Fault><faultstring>Error</faultstring></Fault>' }).transportOk, false);
  assert.equal(parseAeatQueryResponse({ statusCode: 200, body: '<html>ok</html>' }).transportOk, false);
});

test('la función pública exige administrador y confirmación expresa antes de consultar', async () => {
  const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');
  let calls = 0;
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const scope = { exports: {}, onCall: (_options, fn) => fn, HttpsError,
    requireTenantAdmin: async request => { if (!request.auth) throw new Error('unauthenticated'); return 'tenant-a'; },
    aeatTestReconciliationWorker: { run: async input => { calls++; assert.equal(input.companyId, 'tenant-a'); return { status: 'accepted' }; } } };
  vm.runInNewContext(source.slice(source.indexOf('exports.reconcileAeatCloudTestSubmission ='),
    source.indexOf('exports.localConnectorHeartbeat =')), scope);
  const reconcile = scope.exports.reconcileAeatCloudTestSubmission;
  await assert.rejects(reconcile({ auth: { uid: 'admin' }, data: { submissionId: 'alta_i' } }));
  await assert.rejects(reconcile({ data: { submissionId: 'alta_i', confirmTestQuery: true } }));
  assert.equal(calls, 0);
  assert.equal((await reconcile({ auth: { uid: 'admin' }, data: { submissionId: 'alta_i', confirmTestQuery: true } })).status, 'accepted');
  assert.equal(calls, 1);
});
