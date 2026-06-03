import fs from 'fs';

const userId = 'AuSojNbpE8dN7JbD3g3RWLyGGaH3'; // Alexandra Párraga

const workdaysFile = 'C:/Users/Hp/.gemini/antigravity/brain/be6fae65-5b88-45e7-89a7-6eaf6b16e0c6/.system_generated/steps/206/output.txt';
const checkInsFile = 'C:/Users/Hp/.gemini/antigravity/brain/be6fae65-5b88-45e7-89a7-6eaf6b16e0c6/.system_generated/steps/218/output.txt';
const servicesFile = 'C:/Users/Hp/.gemini/antigravity/brain/be6fae65-5b88-45e7-89a7-6eaf6b16e0c6/.system_generated/steps/221/output.txt';

function parseFirestoreJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
    return null;
  }
}

function runParse() {
  console.log(`--- SCANNING FOR OPEN/ACTIVE SESSIONS FOR USER: ${userId} ---`);

  // 1. Scan Workdays
  const wdData = parseFirestoreJson(workdaysFile);
  let activeWdCount = 0;
  if (wdData && wdData.documents) {
    wdData.documents.forEach(doc => {
      const fields = doc.fields || {};
      const docUserId = fields.userId?.stringValue;
      if (docUserId === userId) {
        const status = fields.status?.stringValue;
        if (status === 'active') {
          activeWdCount++;
          const docId = doc.name.split('/').pop();
          const date = fields.date?.timestampValue;
          const startTime = fields.startTime?.timestampValue;
          console.log(`[FOUND OPEN WORKDAY]`);
          console.log(`  Document ID: ${docId}`);
          console.log(`  Date: ${date}`);
          console.log(`  StartTime: ${startTime}`);
          console.log(`  Status: ${status}`);
        }
      }
    });
  }
  console.log(`Open Workdays found: ${activeWdCount}`);

  // 2. Scan Check-Ins
  const ciData = parseFirestoreJson(checkInsFile);
  let openCiCount = 0;
  if (ciData && ciData.documents) {
    ciData.documents.forEach(doc => {
      const fields = doc.fields || {};
      const docUserId = fields.userId?.stringValue;
      if (docUserId === userId) {
        const checkOutTime = fields.checkOutTime?.nullValue !== undefined ? null : fields.checkOutTime?.timestampValue;
        if (checkOutTime === null || checkOutTime === undefined) {
          openCiCount++;
          const docId = doc.name.split('/').pop();
          const checkInTime = fields.checkInTime?.timestampValue;
          const scheduledServiceId = fields.scheduledServiceId?.stringValue;
          const communityId = fields.communityId?.stringValue;
          console.log(`[FOUND OPEN CHECK-IN]`);
          console.log(`  Document ID: ${docId}`);
          console.log(`  Service ID: ${scheduledServiceId}`);
          console.log(`  Community ID: ${communityId}`);
          console.log(`  Check-in Time: ${checkInTime}`);
        }
      }
    });
  }
  console.log(`Open Check-ins found: ${openCiCount}`);

  // 3. Scan Scheduled Services
  const ssData = parseFirestoreJson(servicesFile);
  let inProgressServiceCount = 0;
  if (ssData && ssData.documents) {
    ssData.documents.forEach(doc => {
      const fields = doc.fields || {};
      const docUserId = fields.assignedUserId?.stringValue;
      if (docUserId === userId) {
        const status = fields.status?.stringValue;
        if (status === 'in_progress') {
          inProgressServiceCount++;
          const docId = doc.name.split('/').pop();
          const date = fields.date?.timestampValue;
          const communityId = fields.communityId?.stringValue;
          console.log(`[FOUND IN_PROGRESS SERVICE]`);
          console.log(`  Document ID: ${docId}`);
          console.log(`  Date: ${date}`);
          console.log(`  Community ID: ${communityId}`);
          console.log(`  Status: ${status}`);
        }
      }
    });
  }
  console.log(`In-Progress Services found: ${inProgressServiceCount}`);
}

runParse();
