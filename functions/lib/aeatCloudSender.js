const https = require("node:https");

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function decodeXmlEntities(value) {
  return String(value || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function getXmlValue(xml, localName) {
  const safeName = String(localName || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeName) return "";
  const expression = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${safeName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${safeName}>`,
    "i",
  );
  const match = String(xml || "").match(expression);
  return match ? decodeXmlEntities(match[1].replace(/<[^>]+>/g, "").trim()) : "";
}

function parseAeatSoapResponse({ statusCode, body }) {
  const httpStatus = Math.max(0, Math.min(999, Number(statusCode) || 0));
  const responseBody = String(body || "");
  if (httpStatus < 200 || httpStatus >= 300) {
    return {
      transportOk: false,
      httpStatus,
      message: `AEAT respondió HTTP ${httpStatus}: ${responseBody.slice(0, 1000)}`,
    };
  }
  const fault = getXmlValue(responseBody, "faultstring");
  if (fault) {
    return {
      transportOk: false,
      permanentFailure: true,
      httpStatus,
      message: fault,
    };
  }
  return {
    transportOk: true,
    httpStatus,
    csv: getXmlValue(responseBody, "CSV"),
    shipmentState: getXmlValue(responseBody, "EstadoEnvio"),
    recordState: getXmlValue(responseBody, "EstadoRegistro"),
    code: getXmlValue(responseBody, "CodigoErrorRegistro"),
    message: getXmlValue(responseBody, "DescripcionErrorRegistro"),
    waitSeconds: Number(getXmlValue(responseBody, "TiempoEsperaEnvio")) || 0,
  };
}

function postSoapWithPfx({ endpoint, soapXml, pfx, passphrase, timeoutMs = 60000 }) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") {
    return Promise.reject(new Error("El destino AEAT debe utilizar HTTPS."));
  }
  const body = Buffer.from(String(soapXml || ""), "utf8");
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      pfx,
      passphrase,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      timeout: timeoutMs,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Length": body.length,
        SOAPAction: '""',
      },
    }, (response) => {
      const chunks = [];
      let totalBytes = 0;
      response.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_BYTES) {
          request.destroy(new Error("La respuesta de AEAT supera el tamaño permitido."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        statusCode: response.statusCode || 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("timeout", () => request.destroy(new Error("La conexión con AEAT ha agotado el tiempo de espera.")));
    request.on("error", reject);
    request.end(body);
  });
}

module.exports = {
  getXmlValue,
  parseAeatSoapResponse,
  postSoapWithPfx,
};
