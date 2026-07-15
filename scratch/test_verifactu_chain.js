import { doc, collection, addDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../src/config/firebase.js';
import { 
  createInvoice, 
  emitInvoice, 
  updateInvoice, 
  deleteInvoice 
} from '../src/services/invoiceService.js';

async function main() {
  console.log('=== INICIANDO TEST DE VERIFACTU ===');

  const invoiceIds = [];

  try {
    // 0. Autenticarse como administrador para cumplir con las reglas de Firestore
    console.log('Iniciando sesión como administrador...');
    await signInWithEmailAndPassword(auth, 'admin@ryblimpiezas.com', 'Admin2024!');
    console.log('Autenticación correcta. Ejecutando test...');

    // 1. Crear 3 facturas en estado borrador (draft)
    console.log('\n1. Creando 3 facturas de prueba en borrador...');
    for (let i = 1; i <= 3; i++) {
      const id = await createInvoice({
        status: 'draft',
        year: 2026,
        month: 6,
        client: {
          name: `Comunidad Test Verifactu ${i}`,
          cif: 'B12345678',
          billingAddress: 'Calle de Prueba 123'
        },
        items: [
          {
            description: `Servicio de limpieza mensual ${i}`,
            quantity: 1,
            price: 100 * i,
            total: 100 * i
          }
        ],
        subtotal: 100 * i,
        taxRate: 21,
        taxAmount: 21 * i,
        totalAmount: 121 * i,
        paymentMethod: 'transferencia'
      });
      invoiceIds.push(id);
      console.log(`Borrador #${i} creado con ID: ${id}`);
    }

    // 2. Emitir las facturas secuencialmente
    console.log('\n2. Emitiendo facturas secuencialmente para encadenar hashes...');
    for (let i = 0; i < invoiceIds.length; i++) {
      const id = invoiceIds[i];
      await emitInvoice(id);
      console.log(`Factura #${i + 1} emitida correctamente.`);
    }

    // 3. Recuperar y verificar los hashes
    console.log('\n3. Verificando encadenamiento de hashes (huella)...');
    const invoicesData = [];
    for (const id of invoiceIds) {
      const snap = await getDoc(doc(db, 'invoices', id));
      invoicesData.push(snap.data());
    }

    invoicesData.forEach((inv, index) => {
      console.log(`\nFactura #${index + 1} (Nº: ${inv.invoiceNumber}):`);
      console.log(`  Hash:          ${inv.hash}`);
      console.log(`  PreviousHash:  ${inv.previousHash || '(Primera de la cadena)'}`);
    });

    // Validar el encadenamiento
    const chain1Valid = invoicesData[1].previousHash === invoicesData[0].hash;
    const chain2Valid = invoicesData[2].previousHash === invoicesData[1].hash;

    console.log('\nResultados de la validación del hash encadenado:');
    console.log(`  ¿Coincide previousHash F2 con hash F1?: ${chain1Valid ? 'SÍ (VÁLIDO) ✅' : 'NO (ERROR) ❌'}`);
    console.log(`  ¿Coincide previousHash F3 con hash F2?: ${chain2Valid ? 'SÍ (VÁLIDO) ✅' : 'NO (ERROR) ❌'}`);

    if (!chain1Valid || !chain2Valid) {
      throw new Error('La validación del encadenamiento de hashes ha fallado.');
    }

    // 4. Probar la inmutabilidad (debe lanzar error al intentar modificar/borrar las emitidas)
    console.log('\n4. Probando inmutabilidad en facturas emitidas...');
    
    // Intento de actualización
    try {
      console.log('Intentando actualizar una factura emitida...');
      await updateInvoice(invoiceIds[0], { totalAmount: 9999 });
      console.log('❌ ERROR: Se permitió actualizar una factura emitida.');
    } catch (err) {
      console.log(`✅ CORRECTO: Error esperado al actualizar: "${err.message}"`);
    }

    // Intento de eliminación
    try {
      console.log('Intentando eliminar una factura emitida...');
      await deleteInvoice(invoiceIds[1]);
      console.log('❌ ERROR: Se permitió eliminar una factura emitida.');
    } catch (err) {
      console.log(`✅ CORRECTO: Error esperado al eliminar: "${err.message}"`);
    }

  } catch (error) {
    console.error('Test fallido:', error);
  } finally {
    // 5. Limpieza de base de datos
    console.log('\n5. Limpiando facturas de prueba creadas...');
    for (const id of invoiceIds) {
      try {
        await deleteDoc(doc(db, 'invoices', id));
        console.log(`Factura de prueba ${id} eliminada.`);
      } catch (cleanErr) {
        console.error(`Error al limpiar factura ${id}:`, cleanErr);
      }
    }
    console.log('=== TEST FINALIZADO ===');
  }
}

main();
