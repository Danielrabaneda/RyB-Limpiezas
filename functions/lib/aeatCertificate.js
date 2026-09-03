const forge = require("node-forge");
const { createHash } = require("node:crypto");

const MAX_PFX_BYTES = 512 * 1024;

function normalizeTaxId(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function extractSpanishTaxIds(text) {
  const normalized = String(text || "").toUpperCase();
  const matches = normalized.match(/\b(?:[XYZ]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z])\b/g);
  return [...new Set((matches || []).map(normalizeTaxId))];
}

function getCertificateText(certificate) {
  return certificate.subject.attributes
    .map((attribute) => `${attribute.shortName || attribute.name || ""}=${attribute.value || ""}`)
    .join(", ");
}

function certificateFingerprint(certificate) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  return createHash("sha256").update(Buffer.from(der, "binary")).digest("hex").toUpperCase();
}

function parseAndValidatePfx({ pfxBase64, password, expectedTaxId, now = new Date() }) {
  if (typeof pfxBase64 !== "string" || !pfxBase64.trim()) {
    throw new Error("Selecciona un certificado .pfx o .p12.");
  }
  if (typeof password !== "string" || !password) {
    throw new Error("Escribe la contraseña del certificado.");
  }

  const pfxBuffer = Buffer.from(pfxBase64, "base64");
  if (!pfxBuffer.length || pfxBuffer.length > MAX_PFX_BYTES) {
    throw new Error("El certificado no es válido o supera el límite de 512 KB.");
  }

  let p12;
  try {
    const asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch {
    throw new Error("No se pudo abrir el certificado. Revisa el archivo y la contraseña.");
  }

  const keyBags = [
    ...p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [],
    ...p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [],
  ];
  if (!keyBags.some((bag) => bag.key)) {
    throw new Error("El archivo no contiene una clave privada utilizable.");
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const certificates = certBags.map((bag) => bag.cert).filter(Boolean);
  if (!certificates.length) {
    throw new Error("El archivo no contiene un certificado digital.");
  }

  const certificate = certificates.find((candidate) => {
    const text = getCertificateText(candidate);
    return extractSpanishTaxIds(text).includes(normalizeTaxId(expectedTaxId));
  }) || certificates[0];
  const subject = getCertificateText(certificate);
  const certificateTaxIds = extractSpanishTaxIds(subject);
  const companyTaxId = normalizeTaxId(expectedTaxId);

  if (!companyTaxId) {
    throw new Error("Configura primero el NIF de facturación de la empresa.");
  }
  if (!certificateTaxIds.includes(companyTaxId)) {
    throw new Error(`El certificado no corresponde al NIF de la empresa (${companyTaxId}).`);
  }
  if (now < certificate.validity.notBefore) {
    throw new Error("El certificado todavía no es válido.");
  }
  if (now >= certificate.validity.notAfter) {
    throw new Error("El certificado está caducado.");
  }

  const commonName = certificate.subject.getField("CN")?.value || subject;
  const daysRemaining = Math.ceil((certificate.validity.notAfter.getTime() - now.getTime()) / 86400000);
  return {
    pfxBuffer,
    metadata: {
      commonName,
      taxId: companyTaxId,
      issuer: certificate.issuer.getField("CN")?.value || "",
      serialNumber: certificate.serialNumber,
      fingerprintSha256: certificateFingerprint(certificate),
      validFrom: certificate.validity.notBefore.toISOString(),
      validTo: certificate.validity.notAfter.toISOString(),
      daysRemaining,
    },
  };
}

function buildTenantSecretId(companyId) {
  const suffix = createHash("sha256").update(String(companyId)).digest("hex").slice(0, 32);
  return `aeat-certificate-${suffix}`;
}

module.exports = {
  MAX_PFX_BYTES,
  buildTenantSecretId,
  extractSpanishTaxIds,
  normalizeTaxId,
  parseAndValidatePfx,
};
