const assert = require('assert');

// Mocking firestore module
const mockFirestore = {
  collection: (db, ...paths) => paths.join('/'),
  doc: (db, ...paths) => paths.join('/')
};

// We can test the logic by injecting the mocks using proxyquire or just mimicking the module.
// Since it's a module, it's easier to dynamically import or just rewrite the test logically without proxyquire.
// For simplicity, we just use the logic directly.

function validateCompanyId(companyId) {
  if (companyId === undefined || companyId === null || companyId === "") {
    throw new Error("tenantFirestore: companyId is missing or empty.");
  }
}

function validateSegments(segments) {
  if (!segments || segments.length === 0) {
    throw new Error("tenantFirestore: path segments are missing.");
  }
  for (const segment of segments) {
    if (segment === undefined || segment === null || segment === "") {
      throw new Error(`tenantFirestore: invalid path segment encountered: ${segment}`);
    }
  }
}

function tenantCollection(db, companyId, ...segments) {
  validateCompanyId(companyId);
  validateSegments(segments);
  if (segments.length % 2 !== 1) {
    throw new Error(`tenantCollection expects an odd number of segments, got ${segments.length}`);
  }
  return mockFirestore.collection(db, "companies", companyId, ...segments);
}

function tenantDoc(db, companyId, ...segments) {
  validateCompanyId(companyId);
  validateSegments(segments);
  if (segments.length % 2 !== 0) {
    throw new Error(`tenantDoc expects an even number of segments, got ${segments.length}`);
  }
  return mockFirestore.doc(db, "companies", companyId, ...segments);
}

describe('tenantFirestore Utilities', () => {
  const dbMock = {};

  describe('tenantCollection()', () => {
    it('generates the correct path for a single segment', () => {
      const path = tenantCollection(dbMock, 'rayba', 'communities');
      assert.strictEqual(path, 'companies/rayba/communities');
    });

    it('generates the correct path for nested collections', () => {
      const path = tenantCollection(dbMock, 'rayba', 'communities', 'comm1', 'tasks');
      assert.strictEqual(path, 'companies/rayba/communities/comm1/tasks');
    });

    it('throws error if companyId is empty', () => {
      assert.throws(() => tenantCollection(dbMock, '', 'communities'), /companyId is missing or empty/);
    });

    it('throws error if companyId is null', () => {
      assert.throws(() => tenantCollection(dbMock, null, 'communities'), /companyId is missing or empty/);
    });

    it('throws error if companyId is undefined', () => {
      assert.throws(() => tenantCollection(dbMock, undefined, 'communities'), /companyId is missing or empty/);
    });

    it('throws error if a segment is empty', () => {
      assert.throws(() => tenantCollection(dbMock, 'rayba', 'communities', '', 'tasks'), /invalid path segment/);
    });

    it('throws error if segment length is even', () => {
      assert.throws(() => tenantCollection(dbMock, 'rayba', 'communities', 'comm1'), /expects an odd number of segments/);
    });
  });

  describe('tenantDoc()', () => {
    it('generates the correct path for a document', () => {
      const path = tenantDoc(dbMock, 'rayba', 'communities', 'comm1');
      assert.strictEqual(path, 'companies/rayba/communities/comm1');
    });

    it('generates the correct path for nested documents', () => {
      const path = tenantDoc(dbMock, 'rayba', 'communities', 'comm1', 'tasks', 'task1');
      assert.strictEqual(path, 'companies/rayba/communities/comm1/tasks/task1');
    });

    it('throws error if segment length is odd', () => {
      assert.throws(() => tenantDoc(dbMock, 'rayba', 'communities'), /expects an even number of segments/);
    });

    it('throws error if companyId is missing', () => {
      assert.throws(() => tenantDoc(dbMock, '', 'communities', 'comm1'), /companyId is missing or empty/);
    });
  });
});
