const normalizeFiscalValue = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

export function getCommunityBillingName(community = {}) {
  return normalizeFiscalValue(community.billingName) || normalizeFiscalValue(community.name);
}

export function syncBillingNameWithCommunityName(currentName, currentBillingName, nextName) {
  return !currentBillingName || currentBillingName === currentName
    ? nextName
    : currentBillingName;
}

/**
 * Returns the only three customer fields that may be printed in an invoice PDF.
 *
 * Older invoices can contain a polluted `billingAddress` with repeated names or
 * contact people. For invoices linked to a community, prefer the clean,
 * structured address snapshot and then the current community address. Manual
 * invoices keep the address entered specifically for that invoice.
 */
export function getInvoiceClientFiscalData(invoice = {}, communities = []) {
  const client = invoice.client || {};
  const communityId = String(client.communityId || "");
  const community = communities.find(
    (item) => String(item?.id || "") === communityId,
  );

  return {
    name: normalizeFiscalValue(client.name || community?.name),
    nif: normalizeFiscalValue(client.cif || community?.billingCif),
    address: normalizeFiscalValue(
      client.address ||
        community?.address ||
        client.billingAddress ||
        community?.billingAddress,
    ),
  };
}

const ROAD_START = /(?:^|,\s*)(?:c\/\.?|calle|avenida|avda\.?|av\.?|plaza|pza\.?|paseo|camino|carretera|ctra\.?|travesía|polígono)\s+/i;

export function parsePostalAddress(value) {
  const address = normalizeFiscalValue(value);
  if (!address) return { street: "", postalCode: "", city: "", province: "" };

  const provinceMatch = address.match(/\(([^()]+)\)\s*$/);
  const province = normalizeFiscalValue(provinceMatch?.[1]);
  const withoutProvince = provinceMatch
    ? address.slice(0, provinceMatch.index).trim().replace(/,\s*$/, "")
    : address;
  const postalMatch = withoutProvince.match(/\b\d{5}\b/);
  const postalCode = postalMatch?.[0] || "";
  let beforePostal = postalMatch
    ? withoutProvince.slice(0, postalMatch.index).trim().replace(/,\s*$/, "")
    : withoutProvince;
  let city = postalMatch
    ? normalizeFiscalValue(withoutProvince.slice(postalMatch.index + 5))
        .replace(/^,\s*|,\s*$/g, "")
    : "";

  if (/^españa$/i.test(city)) city = "";
  if (!city && postalCode) {
    const parts = beforePostal.split(/,\s*/);
    if (parts.length > 1 && /^[\p{L}\s.'-]+$/u.test(parts.at(-1))) {
      city = normalizeFiscalValue(parts.pop());
      beforePostal = parts.join(", ");
    }
  }

  const roadMatch = beforePostal.match(ROAD_START);
  const street = (roadMatch
    ? beforePostal.slice(roadMatch.index).replace(/^,\s*/, "")
    : beforePostal
  )
    .replace(/^c\/\.?\s*/i, "calle ")
    .replace(/,\s*$/, "")
    .toLocaleLowerCase("es-ES");

  return { street, postalCode, city, province };
}

export function getInvoiceClientFiscalLines(invoice = {}, communities = []) {
  const client = invoice.client || {};
  const community = communities.find(
    (item) => String(item?.id || "") === String(client.communityId || ""),
  );
  const name = normalizeFiscalValue(client.name || community?.name);
  const nif = normalizeFiscalValue(client.cif || community?.billingCif);
  const billingAddress = normalizeFiscalValue(
    client.billingAddress || community?.billingAddress,
  );
  const address = billingAddress || normalizeFiscalValue(
    client.address || community?.address,
  );
  const parsed = parsePostalAddress(address);
  const fiscalKeys = [
    "billingStreet",
    "billingPostalCode",
    "billingCity",
    "billingProvince",
  ];
  const structuredSource = fiscalKeys.some((key) => normalizeFiscalValue(client[key]))
    ? client
    : fiscalKeys.some((key) => normalizeFiscalValue(community?.[key]))
      ? community
      : parsed;
  const street = normalizeFiscalValue(
    structuredSource.billingStreet || structuredSource.street,
  ).toLocaleLowerCase("es-ES");
  const postalCode = normalizeFiscalValue(
    structuredSource.billingPostalCode || structuredSource.postalCode,
  );
  const city = normalizeFiscalValue(
    structuredSource.billingCity || structuredSource.city,
  );
  const province = normalizeFiscalValue(
    structuredSource.billingProvince || structuredSource.province,
  ).replace(/^\(|\)$/g, "");

  const missing = [
    !street && "calle y número",
    !postalCode && "código postal",
    !city && "población",
    !province && "provincia",
  ].filter(Boolean);

  return {
    lines: [
      name,
      nif ? `NIF: ${nif}` : "",
      street,
      postalCode && city ? `${postalCode}, ${city}` : "",
      province ? `(${province})` : "",
    ].filter(Boolean),
    missing,
  };
}
