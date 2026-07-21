const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

async function run() {
  const companyId = 'rayba';
  const checkInsColl = db.collection(`companies/${companyId}/checkIns`);
  const snapshot = await checkInsColl.get();
  
  console.log(`Total check-ins: ${snapshot.size}`);
  
  const todayStr = '2026-07-20';
  const todayDocs = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const checkInTime = data.checkInTime ? data.checkInTime.toDate() : null;
    const checkOutTime = data.checkOutTime ? data.checkOutTime.toDate() : null;
    
    // Check if checkInTime is today
    if (checkInTime && checkInTime.toISOString().startsWith(todayStr)) {
      todayDocs.push({
        id: doc.id,
        userId: data.userId,
        scheduledServiceId: data.scheduledServiceId,
        checkInTime: checkInTime.toISOString(),
        checkOutTime: checkOutTime ? checkOutTime.toISOString() : null,
        exceptionReason: data.exceptionReason || null,
        exceptionReasonOut: data.exceptionReasonOut || null
      });
    }
  });
  
  console.log('Today check-ins:');
  console.log(JSON.stringify(todayDocs, null, 2));
}

run().catch(console.error);
