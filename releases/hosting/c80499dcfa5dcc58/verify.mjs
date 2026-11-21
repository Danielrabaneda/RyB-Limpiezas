import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("./manifest.json", import.meta.url)));
const directory = new URL("./site/", import.meta.url);
const hosts = ["ryb-limpiezas-app.web.app", "limpiagest.es"];
const live = process.argv.slice(2).includes("--live");
const validPath = /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/;
const checksum = /^[a-f0-9]{64}$/;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function inventory(folder, prefix = "") {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const pathname = prefix + "/" + entry.name;
    if (entry.isDirectory()) result.push(...await inventory(new URL(entry.name + "/", folder), pathname));
    else if (entry.isFile()) result.push(pathname);
    else throw new Error(`Entrada inesperada: ${pathname}`);
  }
  return result;
}

function checkBytes(bytes, file, source) {
  if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
    throw new Error(`${file.path} no coincide en ${source}`);
  }
}

async function checkFile(file) {
  checkBytes(await readFile(new URL(file.path.slice(1), directory)), file, "el repositorio");
  if (!live) return;
  await Promise.all(hosts.map(async host => {
    const response = await fetch(`https://${host}${file.path}`, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error(`${host} devolvió HTTP ${response.status} para ${file.path}`);
    checkBytes(Buffer.from(await response.arrayBuffer()), file, host);
  }));
}

const records = manifest.files;
if (!Array.isArray(records) || records.length === 0 || records.some(file =>
  !validPath.test(file.path) ||
  file.path.split("/").some(segment => segment === "." || segment === "..") ||
  !checksum.test(file.sha256) ||
  !checksum.test(file.firebaseSha256) ||
  !Number.isSafeInteger(file.bytes) || file.bytes < 0)) {
  throw new Error("El inventario de la publicación oficial no es válido.");
}
const expected = new Set(records.map(file => file.path));
const actual = await inventory(directory);
if (expected.size !== records.length || actual.length !== expected.size || actual.some(pathname => !expected.has(pathname))) {
  throw new Error("Los archivos del repositorio no coinciden con el inventario.");
}

for (let i = 0; i < records.length; i += 8) {
  await Promise.all(records.slice(i, i + 8).map(checkFile));
}
console.log(`${manifest.version}: ${records.length} archivos verificados${live ? " en el repositorio y en ambos dominios oficiales" : " en el repositorio"}.`);
