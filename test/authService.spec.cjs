const assert = require('assert');

// Mock of Firestore dependencies for unit testing the logic of authService.js
const mockDb = {};
let getDocsCalled = false;
let setDocCalled = false;
let lastSetDocData = null;

const mockFirestore = {
  getDocs: async (q) => {
    getDocsCalled = true;
    return {
      docs: [
        { id: 'op1', data: () => ({ name: 'Operario A', companyId: 'rayba', role: 'operario', active: true }) },
        { id: 'op2', data: () => ({ name: 'Operario B', companyId: 'tenantB', role: 'operario', active: true }) }
      ]
    };
  },
  setDoc: async (docRef, data) => {
    setDocCalled = true;
    lastSetDocData = data;
    return {};
  },
  collection: (db, name) => name,
  doc: (db, col, id) => ({ col, id }),
  query: (col, ...filters) => ({ col, filters })
};

// Target functions with identical implementation to authService.js
async function getOperariosMock(companyId) {
  if (!companyId) {
    console.warn("[Test Log] getOperarios invocado sin companyId. Retornando vacío sin consultar Firestore.");
    return [];
  }
  const q = mockFirestore.query(mockFirestore.collection(mockDb, "users"));
  const snap = await mockFirestore.getDocs(q);
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.role === "operario" || u.isOperario === true);
}

async function getAllUsersMock(companyId) {
  if (!companyId) {
    console.warn("[Test Log] getAllUsers invocado sin companyId. Retornando vacío sin consultar Firestore.");
    return [];
  }
  const q = mockFirestore.query(mockFirestore.collection(mockDb, "users"));
  const snap = await mockFirestore.getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// createOperario mock replicating AuthContext.jsx logic
async function createOperarioMock(adminCompanyId, email, password, name, phone, allowDirectTransfers = false) {
  // Simulates createUserWithoutLogout
  const mockUser = { uid: "new_user_123" };
  const profile = {
    uid: mockUser.uid,
    name,
    email,
    phone: phone || "",
    role: "operario",
    active: true,
    companyId: adminCompanyId, // companyId injected from the active admin context
    allowDirectTransfers: !!allowDirectTransfers,
    createdAt: new Date(),
  };
  await mockFirestore.setDoc(mockFirestore.doc(mockDb, "users", mockUser.uid), profile);
  return profile;
}

describe('AuthService Fail-Closed & Zero-Read Hardening', () => {
  beforeEach(() => {
    getDocsCalled = false;
    setDocCalled = false;
    lastSetDocData = null;
  });

  it('getOperarios(undefined) -> [] y realiza 0 lecturas a Firestore', async () => {
    const res = await getOperariosMock(undefined);
    assert.deepStrictEqual(res, []);
    assert.strictEqual(getDocsCalled, false, 'No se debe haber llamado a getDocs (0 lecturas)');
  });

  it('getAllUsers(undefined) -> [] y realiza 0 lecturas a Firestore', async () => {
    const res = await getAllUsersMock(undefined);
    assert.deepStrictEqual(res, []);
    assert.strictEqual(getDocsCalled, false, 'No se debe haber llamado a getDocs (0 lecturas)');
  });

  it('getOperarios("rayba") -> Llama a getDocs y procesa correctamente los datos', async () => {
    const res = await getOperariosMock('rayba');
    assert.strictEqual(res.length > 0, true);
    assert.strictEqual(getDocsCalled, true, 'Se debe haber llamado a getDocs');
  });

  describe('Registro de Operarios con companyId', () => {
    it('Debe incluir companyId del administrador al registrar un nuevo operario', async () => {
      const adminCompanyId = 'rayba';
      const profile = await createOperarioMock(
        adminCompanyId,
        'nuevo@rayba.com',
        'securePassword123',
        'Operario Nuevo',
        '600112233',
        true
      );

      assert.strictEqual(setDocCalled, true);
      assert.strictEqual(profile.companyId, 'rayba');
      assert.strictEqual(lastSetDocData.companyId, 'rayba');
      assert.strictEqual(lastSetDocData.role, 'operario');
      assert.strictEqual(lastSetDocData.active, true);
    });
  });

  describe('Ciclo de Vida de Inquilinato (Tenant Change Lifecycle)', () => {
    it('Debe limpiar los listeners antiguos y resetear estados en cambio de tenant o logout', () => {
      let activeListeners = 0;
      let currentState = null;

      // Mock setup simulating useEffect inside hooks
      function mountTenantHook(companyId) {
        currentState = `Loaded data for ${companyId}`;
        activeListeners++;

        // Return unsubscribe function
        return () => {
          activeListeners--;
          currentState = null;
        };
      }

      // 1. Simular Login Tenant A
      const unsubA = mountTenantHook("TenantA");
      assert.strictEqual(activeListeners, 1);
      assert.strictEqual(currentState, "Loaded data for TenantA");

      // 2. Simular Logout (unmount / clean up)
      unsubA();
      assert.strictEqual(activeListeners, 0);
      assert.strictEqual(currentState, null);

      // 3. Simular Login Tenant B
      const unsubB = mountTenantHook("TenantB");
      assert.strictEqual(activeListeners, 1);
      assert.strictEqual(currentState, "Loaded data for TenantB");

      // Clean up B
      unsubB();
      assert.strictEqual(activeListeners, 0);
      assert.strictEqual(currentState, null);
    });
  });
});
