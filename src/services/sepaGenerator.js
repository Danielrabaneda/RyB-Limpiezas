// ─────────────────────────────────────────────────────────────────────────────
// sepaGenerator.js
// SEPA Direct Debit XML generator — pain.008.001.02 format
// Pure browser-compatible ES module (no Node.js dependencies)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map of accented / special characters to their SEPA-safe ASCII replacements.
 * SEPA only allows the Basic Latin character set defined in EPC guidelines.
 * @type {Object<string, string>}
 */
const ACCENT_MAP = {
  'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
  'Á': 'A', 'À': 'A', 'Ä': 'A', 'Â': 'A', 'Ã': 'A', 'Å': 'A',
  'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e',
  'É': 'E', 'È': 'E', 'Ë': 'E', 'Ê': 'E',
  'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i',
  'Í': 'I', 'Ì': 'I', 'Ï': 'I', 'Î': 'I',
  'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'õ': 'o',
  'Ó': 'O', 'Ò': 'O', 'Ö': 'O', 'Ô': 'O', 'Õ': 'O',
  'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u',
  'Ú': 'U', 'Ù': 'U', 'Ü': 'U', 'Û': 'U',
  'ñ': 'n', 'Ñ': 'N',
  'ç': 'c', 'Ç': 'C',
  'ý': 'y', 'Ý': 'Y', 'ÿ': 'y',
  'ð': 'd', 'Ð': 'D',
  'ø': 'o', 'Ø': 'O',
  'ß': 'ss',
  'æ': 'ae', 'Æ': 'AE',
  'œ': 'oe', 'Œ': 'OE',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (internal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escapes XML-special characters so the value is safe to embed in an XML
 * text node or attribute.
 *
 * @param {string} str - Raw string to escape.
 * @returns {string} XML-safe string.
 */
function xmlEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Pads a number with leading zeros to reach the desired width.
 *
 * @param {number} num
 * @param {number} width
 * @returns {string}
 */
function padZero(num, width) {
  return String(num).padStart(width, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitises a text string for use in SEPA XML fields.
 *
 * 1. Replaces accented / special characters with ASCII equivalents.
 * 2. Strips any character not in the SEPA-allowed set:
 *    `a-z A-Z 0-9  / - ? : ( ) . , ' +` and space.
 * 3. Collapses multiple consecutive spaces into one.
 * 4. Trims leading / trailing whitespace.
 * 5. Truncates to `maxLength` characters (default 70).
 *
 * @param {string}  text      - The input text to sanitise.
 * @param {number}  [maxLength=70] - Maximum allowed length after sanitisation.
 * @returns {string} The sanitised, SEPA-compliant string.
 */
export function sanitizeSepaText(text, maxLength = 70) {
  if (!text) return '';

  // Step 1 — replace known accented characters
  let result = '';
  for (const ch of String(text)) {
    result += ACCENT_MAP[ch] ?? ch;
  }

  // Step 2 — strip characters outside the SEPA-allowed set
  // Allowed: a-zA-Z0-9, space, and / - ? : ( ) . , ' +
  result = result.replace(/[^a-zA-Z0-9 /\-?:().,'+]/g, '');

  // Step 3 — collapse multiple spaces
  result = result.replace(/\s{2,}/g, ' ');

  // Step 4 — trim
  result = result.trim();

  // Step 5 — truncate
  if (result.length > maxLength) {
    result = result.substring(0, maxLength);
  }

  return result;
}

/**
 * Validates an IBAN string according to the ISO 13616 standard.
 *
 * - Removes spaces and converts to upper-case.
 * - Checks length is between 15 and 34 characters.
 * - Verifies the first two characters are letters (country code).
 * - Validates using the MOD 97-10 algorithm (ISO 7064).
 *
 * @param {string} iban - The IBAN string to validate.
 * @returns {{ valid: boolean, error?: string, iban: string }}
 *   `valid`  — whether the IBAN passed all checks.
 *   `error`  — human-readable error message (only when `valid` is false).
 *   `iban`   — the cleaned (spaces removed, upper-cased) IBAN.
 */
export function validateIBAN(iban) {
  if (!iban) {
    return { valid: false, error: 'IBAN es requerido', iban: '' };
  }

  // Clean: remove spaces, upper-case
  const cleaned = String(iban).replace(/\s/g, '').toUpperCase();

  // Length check
  if (cleaned.length < 15 || cleaned.length > 34) {
    return {
      valid: false,
      error: `Longitud de IBAN inválida (${cleaned.length}). Debe tener entre 15 y 34 caracteres.`,
      iban: cleaned,
    };
  }

  // Country code check (first 2 chars must be letters)
  const countryCode = cleaned.substring(0, 2);
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return {
      valid: false,
      error: 'El IBAN debe comenzar con un código de país de 2 letras.',
      iban: cleaned,
    };
  }

  // MOD 97-10 validation
  // Move the first 4 characters to the end, then convert letters to digits
  // (A=10, B=11, … Z=35) and check that the remainder mod 97 equals 1.
  const rearranged = cleaned.substring(4) + cleaned.substring(0, 4);

  let numericStr = '';
  for (const ch of rearranged) {
    if (ch >= '0' && ch <= '9') {
      numericStr += ch;
    } else {
      // A=10 … Z=35
      numericStr += String(ch.charCodeAt(0) - 55);
    }
  }

  // Compute mod 97 on the (potentially very large) numeric string by
  // processing it in chunks — standard technique to avoid BigInt.
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numericStr[i], 10)) % 97;
  }

  if (remainder !== 1) {
    return {
      valid: false,
      error: 'El IBAN no es válido (falla la verificación MOD 97-10).',
      iban: cleaned,
    };
  }

  return { valid: true, iban: cleaned };
}

/**
 * Calculates the SEPA Creditor Identifier for a Spanish entity.
 *
 * The algorithm (for Spain):
 *  1. Build string: `NIF + "ES" + "00"` (as numeric, A=10…Z=35).
 *  2. Compute check digits: `98 - (numericString mod 97)`.
 *  3. Return `ES{checkDigits}{suffix}{NIF}`.
 *
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code (default `'ES'`).
 * @param {string} nif         - The company NIF (e.g. `'B04843843'`).
 * @param {string} suffix      - 3-digit suffix (default `'000'`).
 * @returns {string} The calculated SEPA Creditor Identifier (e.g. `'ES12000B04843843'`).
 */
export function calculateSepaCreditorId(countryCode = 'ES', nif, suffix = '000') {
  if (!nif) {
    throw new Error('El NIF es requerido para calcular el Creditor ID SEPA.');
  }

  const upperNif = nif.toUpperCase().trim();
  const upperCC = countryCode.toUpperCase().trim();

  // Build the string for MOD 97 computation: NIF + country-code digits + "00"
  const base = upperNif + upperCC + '00';

  // Convert letters to digits (A=10, B=11, … Z=35)
  let numericStr = '';
  for (const ch of base) {
    if (ch >= '0' && ch <= '9') {
      numericStr += ch;
    } else {
      numericStr += String(ch.charCodeAt(0) - 55);
    }
  }

  // MOD 97 on the large numeric string (chunk approach)
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numericStr[i], 10)) % 97;
  }

  const checkDigits = padZero(98 - remainder, 2);

  return `${upperCC}${checkDigits}${suffix}${upperNif}`;
}

/**
 * Generates a SEPA Direct Debit XML document string in the
 * **pain.008.001.02** format.
 *
 * The returned XML is ready to be saved as a `.xml` file and submitted to a
 * bank for SEPA Core Direct Debit processing.
 *
 * @param {Object}   params
 * @param {Object}   params.creditor          - The creditor (payee) details.
 * @param {string}   params.creditor.name     - Legal name of the creditor.
 * @param {string}   params.creditor.nif      - Tax identification number (NIF).
 * @param {string}   params.creditor.iban     - Creditor's IBAN.
 * @param {string}   [params.creditor.bic]    - Creditor's BIC (optional; `'NOTPROVIDED'` if omitted).
 * @param {string}   params.creditor.creditorId - SEPA Creditor Identifier.
 * @param {Array<Object>} params.invoices     - Array of invoice objects to collect.
 * @param {string}   params.invoices[].id             - Internal invoice ID.
 * @param {string}   params.invoices[].invoiceNumber  - Human-readable invoice number.
 * @param {number}   params.invoices[].totalAmount    - Amount to collect (EUR).
 * @param {Object}   params.invoices[].client         - Debtor (client) details.
 * @param {string}   params.invoices[].client.name    - Client legal name.
 * @param {string}   params.invoices[].client.iban    - Client IBAN.
 * @param {string}   params.invoices[].client.mandateRef  - Unique mandate reference.
 * @param {string}   params.invoices[].client.mandateDate - Mandate signature date (YYYY-MM-DD).
 * @param {string}   params.collectionDate   - Requested collection date (YYYY-MM-DD).
 *
 * @returns {string} The complete XML document as a string.
 *
 * @throws {Error} If required parameters are missing or no invoices are provided.
 */
export function generateSepaXML({ creditor, invoices, collectionDate }) {
  // ── Validation ──────────────────────────────────────────────────────────
  if (!creditor) {
    throw new Error('Los datos del acreedor (creditor) son requeridos.');
  }
  if (!creditor.name || !creditor.iban || !creditor.creditorId) {
    throw new Error(
      'El acreedor debe tener al menos: name, iban y creditorId.'
    );
  }
  if (!invoices || invoices.length === 0) {
    throw new Error('Se requiere al menos una factura para generar el XML.');
  }
  if (!collectionDate) {
    throw new Error('La fecha de cobro (collectionDate) es requerida.');
  }

  // ── Derived values ──────────────────────────────────────────────────────
  const now = new Date();
  const yyyy = now.getFullYear();
  const MM = padZero(now.getMonth() + 1, 2);
  const dd = padZero(now.getDate(), 2);
  const HH = padZero(now.getHours(), 2);
  const mm = padZero(now.getMinutes(), 2);
  const ss = padZero(now.getSeconds(), 2);
  const rand4 = padZero(Math.floor(Math.random() * 10000), 4);

  const msgId = `RYB-${yyyy}${MM}${dd}-${HH}${mm}${ss}-${rand4}`;
  const creDtTm = now.toISOString().replace(/\.\d{3}Z$/, ''); // e.g. 2026-07-03T12:34:25
  const pmtInfId = `${msgId}-PMT`;

  const nbOfTxs = invoices.length;
  const ctrlSum = invoices
    .reduce((sum, inv) => sum + Number(inv.totalAmount), 0)
    .toFixed(2);

  const creditorName = sanitizeSepaText(creditor.name);
  const creditorIBAN = creditor.iban.replace(/\s/g, '').toUpperCase();
  const creditorBIC = creditor.bic
    ? creditor.bic.trim().toUpperCase()
    : 'NOTPROVIDED';
  const creditorSchmeId = creditor.creditorId.trim();

  // ── Build XML ───────────────────────────────────────────────────────────
  let xml = '';

  xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml +=
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n';
  xml += '  <CstmrDrctDbtInitn>\n';

  // ── Group Header ────────────────────────────────────────────────────────
  xml += '    <GrpHdr>\n';
  xml += `      <MsgId>${xmlEscape(msgId)}</MsgId>\n`;
  xml += `      <CreDtTm>${xmlEscape(creDtTm)}</CreDtTm>\n`;
  xml += `      <NbOfTxs>${nbOfTxs}</NbOfTxs>\n`;
  xml += `      <CtrlSum>${ctrlSum}</CtrlSum>\n`;
  xml += `      <InitgPty>\n`;
  xml += `        <Nm>${xmlEscape(creditorName)}</Nm>\n`;
  xml += `      </InitgPty>\n`;
  xml += '    </GrpHdr>\n';

  // ── Payment Information ─────────────────────────────────────────────────
  xml += '    <PmtInf>\n';
  xml += `      <PmtInfId>${xmlEscape(pmtInfId)}</PmtInfId>\n`;
  xml += '      <PmtMtd>DD</PmtMtd>\n';
  xml += `      <NbOfTxs>${nbOfTxs}</NbOfTxs>\n`;
  xml += `      <CtrlSum>${ctrlSum}</CtrlSum>\n`;

  // Payment Type Information
  xml += '      <PmtTpInf>\n';
  xml += '        <SvcLvl><Cd>SEPA</Cd></SvcLvl>\n';
  xml += '        <LclInstrm><Cd>CORE</Cd></LclInstrm>\n';
  xml += '        <SeqTp>RCUR</SeqTp>\n';
  xml += '      </PmtTpInf>\n';

  // Requested Collection Date
  xml += `      <ReqdColltnDt>${xmlEscape(collectionDate)}</ReqdColltnDt>\n`;

  // Creditor
  xml += `      <Cdtr>\n`;
  xml += `        <Nm>${xmlEscape(creditorName)}</Nm>\n`;
  xml += `      </Cdtr>\n`;

  // Creditor Account
  xml += `      <CdtrAcct>\n`;
  xml += `        <Id><IBAN>${xmlEscape(creditorIBAN)}</IBAN></Id>\n`;
  xml += `      </CdtrAcct>\n`;

  // Creditor Agent
  xml += `      <CdtrAgt>\n`;
  xml += `        <FinInstnId><BIC>${xmlEscape(creditorBIC)}</BIC></FinInstnId>\n`;
  xml += `      </CdtrAgt>\n`;

  // Creditor Scheme Identification
  xml += '      <CdtrSchmeId>\n';
  xml += '        <Id>\n';
  xml += '          <PrvtId>\n';
  xml += '            <Othr>\n';
  xml += `              <Id>${xmlEscape(creditorSchmeId)}</Id>\n`;
  xml += '              <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>\n';
  xml += '            </Othr>\n';
  xml += '          </PrvtId>\n';
  xml += '        </Id>\n';
  xml += '      </CdtrSchmeId>\n';

  // ── Direct Debit Transaction entries ────────────────────────────────────
  for (const invoice of invoices) {
    const client = invoice.client;
    if (!client || !client.iban || !client.mandateRef || !client.mandateDate) {
      throw new Error(
        `Datos de cliente incompletos para la factura "${invoice.invoiceNumber}". ` +
        'Se requiere: name, iban, mandateRef, mandateDate.'
      );
    }

    const endToEndId = sanitizeSepaText(invoice.invoiceNumber, 35);
    const amount = Number(invoice.totalAmount).toFixed(2);
    const debtorName = sanitizeSepaText(client.name);
    const debtorIBAN = client.iban.replace(/\s/g, '').toUpperCase();
    const mandateId = sanitizeSepaText(client.mandateRef, 35);
    const mandateDate = client.mandateDate; // expected YYYY-MM-DD
    const remittanceInfo = sanitizeSepaText(
      `Factura ${invoice.invoiceNumber} - ${client.name}`,
      140
    );

    xml += '      <DrctDbtTxInf>\n';

    // Payment Identification
    xml += '        <PmtId>\n';
    xml += `          <EndToEndId>${xmlEscape(endToEndId)}</EndToEndId>\n`;
    xml += '        </PmtId>\n';

    // Instructed Amount
    xml += `        <InstdAmt Ccy="EUR">${amount}</InstdAmt>\n`;

    // Direct Debit Transaction — Mandate Related Information
    xml += '        <DrctDbtTx>\n';
    xml += '          <MndtRltdInf>\n';
    xml += `            <MndtId>${xmlEscape(mandateId)}</MndtId>\n`;
    xml += `            <DtOfSgntr>${xmlEscape(mandateDate)}</DtOfSgntr>\n`;
    xml += '          </MndtRltdInf>\n';
    xml += '        </DrctDbtTx>\n';

    // Debtor Agent
    xml += '        <DbtrAgt>\n';
    xml += '          <FinInstnId><BIC>NOTPROVIDED</BIC></FinInstnId>\n';
    xml += '        </DbtrAgt>\n';

    // Debtor
    xml += `        <Dbtr>\n`;
    xml += `          <Nm>${xmlEscape(debtorName)}</Nm>\n`;
    xml += `        </Dbtr>\n`;

    // Debtor Account
    xml += `        <DbtrAcct>\n`;
    xml += `          <Id><IBAN>${xmlEscape(debtorIBAN)}</IBAN></Id>\n`;
    xml += `        </DbtrAcct>\n`;

    // Remittance Information
    xml += `        <RmtInf>\n`;
    xml += `          <Ustrd>${xmlEscape(remittanceInfo)}</Ustrd>\n`;
    xml += `        </RmtInf>\n`;

    xml += '      </DrctDbtTxInf>\n';
  }

  // ── Close elements ──────────────────────────────────────────────────────
  xml += '    </PmtInf>\n';
  xml += '  </CstmrDrctDbtInitn>\n';
  xml += '</Document>';

  return xml;
}
