const ENVIRONMENTS = new Set(['test', 'production']);
const taxId = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function requireFiscalEnvironment(environment) {
  if (!ENVIRONMENTS.has(environment)) throw new Error('Entorno fiscal no válido.');
  return environment;
}

function fiscalStatePath(companyId, environment) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(companyId)) throw new Error('Empresa fiscal no válida.');
  return `companies/${companyId}/verifactuConfig/state_${requireFiscalEnvironment(environment)}`;
}

function assertFiscalScope(record, companyId, environment) {
  requireFiscalEnvironment(environment);
  if (!record || record.companyId !== companyId || record.environment !== environment) {
    throw new Error('El registro fiscal no pertenece a la empresa y al entorno solicitados.');
  }
  if (record.productionEnabled === true && environment === 'test') {
    throw new Error('Un registro de pruebas no puede estar habilitado para producción.');
  }
}

// Production NEVER imports the historical test chain or counters from billing.
function initialFiscalState(companyId, environment, legacySettings = {}) {
  requireFiscalEnvironment(environment);
  const legacy = environment === 'test' ? legacySettings : {};
  return {
    companyId, environment, schemaVersion: 1,
    issuerNif: taxId(legacySettings.nif),
    seriesCounters: { ...(legacy.seriesCounters || {}) },
    lastFiscalRecordId: legacy.lastFiscalRecordId || null,
    lastInvoiceHash: legacy.lastFiscalRecordId ? legacy.lastInvoiceHash || '' : '',
  };
}

async function readFiscalState(transaction, db, companyId, environment, legacySettings = {}) {
  const ref = db.doc(fiscalStatePath(companyId, environment));
  const snap = await transaction.get(ref);
  const state = snap.exists ? snap.data() : initialFiscalState(companyId, environment, legacySettings);
  assertFiscalScope(state, companyId, environment);
  if (state.issuerNif && state.issuerNif !== taxId(legacySettings.nif)) {
    throw new Error('El NIF emisor no puede cambiar dentro de una cadena fiscal existente.');
  }
  if (state.lastFiscalRecordId) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(state.lastFiscalRecordId)) throw new Error('Referencia fiscal no válida.');
    const previousSnap = await transaction.get(db.doc(`companies/${companyId}/fiscalRecords/${state.lastFiscalRecordId}`));
    const previous = previousSnap.exists ? previousSnap.data() : null;
    assertFiscalScope(previous, companyId, environment);
    if (!taxId(legacySettings.nif) || taxId(previous.issuerNif) !== taxId(legacySettings.nif)) {
      throw new Error('El registro anterior pertenece a otro NIF emisor.');
    }
    if (!previous.chain?.hash || previous.chain.hash !== state.lastInvoiceHash) {
      throw new Error('La cabecera de la cadena fiscal no coincide con su registro inmutable.');
    }
  } else if (state.lastInvoiceHash) {
    throw new Error('La cadena fiscal contiene una huella sin registro anterior.');
  }
  return { ref, state };
}

function isTestSubmissionEligible(submission, companyId) {
  return submission?.companyId === companyId && submission.environment === 'test' && submission.productionEnabled !== true;
}

module.exports = { requireFiscalEnvironment, fiscalStatePath, assertFiscalScope, initialFiscalState, readFiscalState, isTestSubmissionEligible };
