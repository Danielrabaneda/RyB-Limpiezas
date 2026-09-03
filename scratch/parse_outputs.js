import fs from "fs";

const userId = "AuSojNbpE8dN7JbD3g3RWLyGGaH3"; // Alexandra Párraga

const workdaysFile =
  "C:/Users/Hp/.gemini/antigravity/brain/be6fae65-5b88-45e7-89a7-6eaf6b16e0c6/.system_generated/steps/206/output.txt";
const checkInsFile =
  "C:/Users/Hp/.gemini/antigravity/brain/be6fae65-5b88-45e7-89a7-6eaf6b16e0c6/.system_generated/steps/218/output.txt";
const servicesFile =
  "C:/Users/Hp/.gemini/antigravity/brain/be6fae65-5b88-45e7-89a7-6eaf6b16e0c6/.system_generated/steps/221/output.txt";

function parseFirestoreJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
    return null;
  }
}

function runParse() {
  console.log(`--- PARSING LOCAL FIRESTORE DUMPS FOR USER ${userId} ---`);

  // 1. Parse Workdays
  const wdData = parseFirestoreJson(workdaysFile);
  if (wdData && wdData.documents) {
    console.log(`\nAnalyzing ${wdData.documents.length} workday documents...`);
    wdData.documents.forEach((doc) => {
      const fields = doc.fields || {};
      const docUserId = fields.userId?.stringValue;
      if (docUserId === userId) {
        const docId = doc.name.split("/").pop();
        const status = fields.status?.stringValue;
        const date = fields.date?.timestampValue;
        const startTime = fields.startTime?.timestampValue;
        const endTime = fields.endTime?.timestampValue;
        console.log(
          `[Workday] ID: ${docId}, Status: ${status}, Date: ${date}, StartTime: ${startTime}, EndTime: ${endTime}`,
        );
      }
    });
  }

  // 2. Parse Check-Ins
  const ciData = parseFirestoreJson(checkInsFile);
  if (ciData && ciData.documents) {
    console.log(`\nAnalyzing ${ciData.documents.length} check-in documents...`);
    ciData.documents.forEach((doc) => {
      const fields = doc.fields || {};
      const docUserId = fields.userId?.stringValue;
      if (docUserId === userId) {
        const docId = doc.name.split("/").pop();
        const checkOutTime =
          fields.checkOutTime?.nullValue !== undefined
            ? null
            : fields.checkOutTime?.timestampValue;
        const checkInTime = fields.checkInTime?.timestampValue;
        const scheduledServiceId = fields.scheduledServiceId?.stringValue;
        console.log(
          `[CheckIn] ID: ${docId}, CheckInTime: ${checkInTime}, CheckOutTime: ${checkOutTime}, ServiceId: ${scheduledServiceId}`,
        );
      }
    });
  }

  // 3. Parse Scheduled Services
  const ssData = parseFirestoreJson(servicesFile);
  if (ssData && ssData.documents) {
    console.log(
      `\nAnalyzing ${ssData.documents.length} scheduled service documents...`,
    );
    ssData.documents.forEach((doc) => {
      const fields = doc.fields || {};
      const docUserId = fields.assignedUserId?.stringValue;
      if (docUserId === userId) {
        const docId = doc.name.split("/").pop();
        const status = fields.status?.stringValue;
        const date = fields.date?.timestampValue;
        console.log(
          `[ScheduledService] ID: ${docId}, Status: ${status}, Date: ${date}`,
        );
      }
    });
  }
}

runParse();
