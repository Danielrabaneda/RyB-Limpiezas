const fs = require('fs');
const path = require('path');

const userId = 'AuSojNbpE8dN7JbD3g3RWLyGGaH3'; // Alexandra Párraga
const stepsDir = 'C:/Users/Hp/.gemini/antigravity/brain/be6fae65-5b88-45e7-89a7-6eaf6b16e0c6/.system_generated/steps';

function scanAll() {
  const folders = fs.readdirSync(stepsDir);
  for (const folder of folders) {
    const filePath = path.join(stepsDir, folder, 'output.txt');
    if (!fs.existsSync(filePath)) continue;
    
    console.log(`\n=== SCANNING STEP ${folder} (file: ${filePath}) ===`);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (!data.documents) {
        console.log(`No documents found in step ${folder}`);
        continue;
      }
      
      data.documents.forEach(doc => {
        const fields = doc.fields || {};
        
        // Check for userId or assignedUserId matching our target operator
        const docUserId = fields.userId?.stringValue || fields.assignedUserId?.stringValue;
        if (docUserId === userId) {
          const docId = doc.name.split('/').pop();
          const colName = doc.name.split('/').slice(-2)[0];
          const status = fields.status?.stringValue;
          const checkOutTime = fields.checkOutTime?.nullValue !== undefined ? null : fields.checkOutTime?.timestampValue;
          
          console.log(`[MATCH in ${colName}] ID: ${docId}`);
          console.log(`  Name: ${doc.name}`);
          if (fields.date) console.log(`  Date: ${fields.date.timestampValue}`);
          if (fields.startTime) console.log(`  StartTime: ${fields.startTime.timestampValue}`);
          if (fields.endTime) console.log(`  EndTime: ${fields.endTime.timestampValue}`);
          if (status) console.log(`  Status: ${status}`);
          if (fields.checkInTime) console.log(`  CheckInTime: ${fields.checkInTime.timestampValue}`);
          if (fields.checkOutTime) console.log(`  CheckOutTime: ${checkOutTime}`);
          if (fields.communityId) console.log(`  CommunityId: ${fields.communityId.stringValue}`);
          if (fields.scheduledServiceId) console.log(`  ScheduledServiceId: ${fields.scheduledServiceId.stringValue}`);
        }
      });
    } catch (e) {
      console.log(`Error parsing step ${folder}: ${e.message}`);
    }
  }
}

scanAll();
