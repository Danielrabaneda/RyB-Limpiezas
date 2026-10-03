const { escapeXml } = require('./aeatSubmission');
const { getXmlValue } = require('./aeatCloudSender');

const ENTRY = /<(?:[\w-]+:)?RegistroRespuestaConsultaFactuSistemaFacturacion(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?RegistroRespuestaConsultaFactuSistemaFacturacion>/gi;

const normalizeTaxId = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function parseAeatDate(value) {
  const match = String(value || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 31 || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error('La fecha fiscal no tiene el formato oficial esperado.');
  }
  return { day: match[1], month: match[2], year: match[3] };
}

function leafXmlValue(xml, localName) {
  const name = String(localName || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!name) return '';
  const matches = [...String(xml || '').matchAll(new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${name}(?:\\s[^>]*)?>\\s*([^<]*?)\\s*<\\/(?:[a-zA-Z0-9_-]+:)?${name}>`, 'gi',
  ))];
  return matches.length ? matches[matches.length - 1][1]
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'").replaceAll('&amp;', '&').trim() : '';
}

function buildAeatQuerySoapEnvelope(fiscalRecord, settings = {}) {
  const issuerNif = normalizeTaxId(fiscalRecord?.issuerNif || settings.nif);
  const issuerName = String(settings.companyName || fiscalRecord?.system?.producer || '').trim().slice(0, 120);
  const invoiceNumber = String(fiscalRecord?.invoiceNumber || '').trim().slice(0, 60);
  const issueDate = String(fiscalRecord?.fechaExpedicionFactura || '').trim();
  const period = parseAeatDate(issueDate);
  if (!issuerNif || !issuerName || !invoiceNumber) throw new Error('Faltan datos fiscales para consultar la factura.');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sfLRC="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/ConsultaLR.xsd" xmlns:sf="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">',
    '<soapenv:Header/><soapenv:Body><sfLRC:ConsultaFactuSistemaFacturacion>',
    '<sfLRC:Cabecera><sf:IDVersion>1.0</sf:IDVersion><sf:ObligadoEmision>',
    `<sf:NombreRazon>${escapeXml(issuerName)}</sf:NombreRazon><sf:NIF>${escapeXml(issuerNif)}</sf:NIF>`,
    '</sf:ObligadoEmision></sfLRC:Cabecera><sfLRC:FiltroConsulta>',
    `<sfLRC:PeriodoImputacion><sf:Ejercicio>${period.year}</sf:Ejercicio><sf:Periodo>${period.month}</sf:Periodo></sfLRC:PeriodoImputacion>`,
    `<sfLRC:NumSerieFactura>${escapeXml(invoiceNumber)}</sfLRC:NumSerieFactura>`,
    `<sfLRC:FechaExpedicionFactura><sf:FechaExpedicionFactura>${escapeXml(issueDate)}</sf:FechaExpedicionFactura></sfLRC:FechaExpedicionFactura>`,
    '</sfLRC:FiltroConsulta><sfLRC:DatosAdicionalesRespuesta><sfLRC:MostrarSistemaInformatico>S</sfLRC:MostrarSistemaInformatico></sfLRC:DatosAdicionalesRespuesta>',
    '</sfLRC:ConsultaFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>',
  ].join('');
}

function parseAeatQueryResponse({ statusCode, body }) {
  const httpStatus = Math.max(0, Math.min(999, Number(statusCode) || 0));
  const xml = String(body || '');
  if (httpStatus < 200 || httpStatus >= 300) return { transportOk: false, httpStatus, message: `AEAT respondió HTTP ${httpStatus}.` };
  const fault = getXmlValue(xml, 'faultstring');
  if (fault) return { transportOk: false, permanentFailure: true, httpStatus, message: fault.slice(0, 1000) };
  if (!/<(?:[\w-]+:)?RespuestaConsultaFactuSistemaFacturacion(?:\s|>)/i.test(xml)) {
    return { transportOk: false, permanentFailure: true, httpStatus, message: 'La respuesta no corresponde al servicio oficial de consulta.' };
  }
  const entries = [...xml.matchAll(ENTRY)].map(match => {
    const block = match[1];
    return {
      issuerNif: leafXmlValue(block, 'IDEmisorFactura'),
      invoiceNumber: leafXmlValue(block, 'NumSerieFactura'),
      issueDate: leafXmlValue(block, 'FechaExpedicionFactura'),
      fingerprint: leafXmlValue(block, 'Huella').toUpperCase(),
      state: leafXmlValue(block, 'EstadoRegistro'),
      code: leafXmlValue(block, 'CodigoErrorRegistro'),
      message: leafXmlValue(block, 'DescripcionErrorRegistro'),
      modifiedAt: leafXmlValue(block, 'TimestampUltimaModificacion'),
      subsanation: leafXmlValue(block, 'Subsanacion'),
    };
  });
  const result = leafXmlValue(xml, 'ResultadoConsulta');
  if (!['ConDatos', 'SinDatos'].includes(result)) {
    return { transportOk: false, permanentFailure: true, httpStatus, message: 'La AEAT no indicó un resultado de consulta reconocible.' };
  }
  return { transportOk: true, httpStatus, result, entries, pagination: leafXmlValue(xml, 'IndicadorPaginacion') };
}

function evaluateAeatReconciliation(response, expected) {
  if (!response.transportOk) return { outcome: 'query_failed', message: response.message || 'No se pudo completar la consulta.' };
  const exact = response.entries.filter(entry => normalizeTaxId(entry.issuerNif) === normalizeTaxId(expected.issuerNif) &&
    entry.invoiceNumber === expected.invoiceNumber && entry.issueDate === expected.issueDate);
  if (response.pagination === 'S') return { outcome: 'needs_review', message: 'La consulta está paginada; no se puede cerrar la incidencia automáticamente.' };
  if (exact.length === 0) return { outcome: 'not_found', message: 'La AEAT todavía no muestra un registro coincidente. No se reenviará automáticamente.' };
  if (exact.length !== 1) return { outcome: 'needs_review', message: 'La AEAT devolvió varias coincidencias y requieren revisión.' };
  const entry = exact[0];
  if (expected.recordType === 'anulacion') {
    return entry.state === 'Anulada'
      ? { outcome: 'accepted', entry, message: 'La AEAT confirma que la factura está anulada.' }
      : { outcome: 'needs_review', entry, message: `La AEAT muestra el estado ${entry.state || 'desconocido'}, no una anulación confirmada.` };
  }
  if (!expected.fingerprint || entry.fingerprint !== String(expected.fingerprint).toUpperCase()) {
    return { outcome: 'needs_review', entry, message: 'La factura coincide, pero su huella no es la del registro inmutable de LimpiaGest.' };
  }
  if (entry.state === 'Correcto') return { outcome: 'accepted', entry, message: 'Registro confirmado por la consulta de la AEAT.' };
  if (entry.state === 'AceptadoConErrores') return { outcome: 'accepted_with_errors', entry, message: entry.message || 'Registro confirmado por la AEAT con errores.' };
  return { outcome: 'needs_review', entry, message: `La AEAT muestra el estado ${entry.state || 'desconocido'}; se mantiene la revisión.` };
}

module.exports = { buildAeatQuerySoapEnvelope, parseAeatQueryResponse, evaluateAeatReconciliation, normalizeTaxId };
