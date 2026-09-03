const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic' }).code,
    { module, exports: module.exports, require: (name) => mocks[name] ?? require(name), crypto: require('node:crypto').webcrypto, Uint8Array });
  return module.exports;
}
let uploaded, downloaded;
const service = load('src/services/verifactuDocumentService.js', {
  '../config/firebase': { storage: {} },
  'firebase/storage': { ref: (_, path) => ({ fullPath: path }), uploadBytes: async (...args) => { uploaded = args; }, getBytes: async (...args) => { downloaded = args; return new Uint8Array([1]); } },
});
const pdf = new File(['%PDF-1.4\noriginal signed bytes'], 'report.pdf', { type: 'application/pdf' });
test('validates PDF, size, title, signature type and tenant', async () => {
  await service.validateDocument(pdf, 'Informe', 'handwritten');
  for (const file of [new File(['%PDF-x'], 'key.p12'), new File(['not pdf'], 'report.pdf'), new File([], 'empty.pdf')]) {
    await assert.rejects(() => service.validateDocument(file, 'Informe', 'none'));
  }
  await assert.rejects(() => service.validateDocument({ name: 'big.pdf', size: 11 * 1024 * 1024 }, 'Informe', 'none'));
  await assert.rejects(() => service.validateDocument(pdf, '', 'none'));
  await assert.rejects(() => service.validateDocument(pdf, 'Informe', 'verified'));
  assert.throws(() => service.documentFolder('../other'));
});
test('preserves original PDF bytes and marks only test evidence', async () => {
  const path = await service.uploadVerifactuDocument('company-a', { file: pdf, title: ' Informe ', signatureKind: 'handwritten' });
  assert.match(path, /^companies\/company-a\/verifactuDocuments\/[a-f0-9-]+\.pdf$/);
  assert.deepEqual(Buffer.from(uploaded[1]), Buffer.from(await pdf.arrayBuffer()));
  assert.equal(uploaded[2].customMetadata.purpose, 'test_evidence');
  assert.equal(uploaded[2].customMetadata.title, 'Informe');
  assert.equal(uploaded[2].customMetadata.sha256, require('node:crypto').createHash('sha256').update(Buffer.from(await pdf.arrayBuffer())).digest('hex'));
});
test('downloads only from the selected tenant and uses authenticated bytes', async () => {
  await assert.rejects(() => service.downloadVerifactuDocument('a', 'companies/b/verifactuDocuments/id.pdf'));
  await assert.rejects(() => service.downloadVerifactuDocument('a', 'companies/a/verifactuDocuments/../id.pdf'));
  await service.downloadVerifactuDocument('a', 'companies/a/verifactuDocuments/id.pdf');
  assert.equal(downloaded[1], 10 * 1024 * 1024);
});
test('documents UI distinguishes signature and production status', () => {
  const { default: Panel } = load('src/components/admin/VerifactuDocuments.jsx', { '../../services/verifactuDocumentService': {} });
  const html = renderToStaticMarkup(React.createElement(Panel, { companyId: 'company-a' }));
  assert.match(html, /Documentación VeriFactu/);
  assert.match(html, /solo para administradores/);
  assert.match(html, /no sustituye la declaración responsable ni desbloquea producción/);
  assert.match(html, /no es una validación de firma electrónica/);
  assert.match(html, /Guardar documento/);
});
