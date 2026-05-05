/**
 * Script de limpieza: elimina servicios duplicados en Firestore
 * 
 * Un "duplicado" es cuando existe más de un documento en scheduledServices
 * con la misma combinación de:
 *   - communityTaskId
 *   - assignedUserId
 *   - scheduledDate (misma fecha en formato yyyy-MM-dd)
 * 
 * En caso de duplicado, conservamos el que tiene status != 'pending'
 * (es decir, el que ya fue trabajado), o en caso de empate, el más antiguo (menor createdAt).
 * 
 * INSTRUCCIONES:
 * Ejecutar desde la consola del navegador con la app abierta (como admin).
 * O desde Node con credenciales de Firebase Admin.
 */

import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { format } from 'date-fns';

async function cleanupDuplicateServices() {
  console.log('[Cleanup] Iniciando limpieza de duplicados...');
  
  const snap = await getDocs(collection(db, 'scheduledServices'));
  const docs = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  
  console.log(`[Cleanup] Total de servicios en Firestore: ${docs.length}`);
  
  // Agrupar por clave única
  const groups = {};
  for (const svc of docs) {
    const dateObj = svc.scheduledDate?.toDate ? svc.scheduledDate.toDate() : new Date(svc.scheduledDate);
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const key = `${svc.communityTaskId}_${svc.assignedUserId}_${dateStr}`;
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(svc);
  }
  
  // Encontrar grupos con duplicados
  const duplicateGroups = Object.entries(groups).filter(([, svcs]) => svcs.length > 1);
  console.log(`[Cleanup] Grupos con duplicados: ${duplicateGroups.length}`);
  
  let totalDeleted = 0;
  
  for (const [key, svcs] of duplicateGroups) {
    console.log(`[Cleanup] Duplicado encontrado para: ${key}`);
    svcs.forEach(s => console.log(`  - id: ${s.id}, status: ${s.status}, createdAt: ${s.createdAt?.toDate?.() || s.createdAt}`));
    
    // Ordenar: primero no-pending (ya trabajados), luego por createdAt asc
    const sorted = [...svcs].sort((a, b) => {
      const aWorked = a.status !== 'pending' ? 0 : 1;
      const bWorked = b.status !== 'pending' ? 0 : 1;
      if (aWorked !== bWorked) return aWorked - bWorked;
      // ambos del mismo tipo, ordenar por createdAt
      const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
      const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
      return aTime - bTime;
    });
    
    // Conservar el primero, eliminar el resto
    const [keep, ...toDelete] = sorted;
    console.log(`  → Conservando: ${keep.id} (status: ${keep.status})`);
    
    for (const del of toDelete) {
      console.log(`  → Eliminando: ${del.id} (status: ${del.status})`);
      await deleteDoc(doc(db, 'scheduledServices', del.id));
      totalDeleted++;
    }
  }
  
  console.log(`[Cleanup] Limpieza completada. ${totalDeleted} duplicados eliminados.`);
  return totalDeleted;
}

cleanupDuplicateServices().then(n => {
  console.log('✅ Limpieza finalizada. Eliminados:', n);
}).catch(err => {
  console.error('❌ Error durante la limpieza:', err);
});
