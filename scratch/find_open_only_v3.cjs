const fs = require("fs");
const path = require("path");

const userId = "AuSojNbpE8dN7JbD3g3RWLyGGaH3"; // Alexandra Párraga
const stepsDir =
  "C:/Users/Hp/.gemini/antigravity/brain/be6fae65-5b88-45e7-89a7-6eaf6b16e0c6/.system_generated/steps";

function scanAll() {
  console.log(`=== RUNNING REFINED SCAN FOR USER: ${userId} ===`);
  const folders = fs.readdirSync(stepsDir);
  for (const folder of folders) {
    const filePath = path.join(stepsDir, folder, "output.txt");
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      if (!data.documents) continue;

      data.documents.forEach((doc) => {
        const fields = doc.fields || {};
        const docUserId =
          fields.userId?.stringValue || fields.assignedUserId?.stringValue;
        if (docUserId === userId) {
          const docId = doc.name.split("/").pop();
          const colName = doc.name.split("/").slice(-2)[0];
          const status = fields.status?.stringValue;

          let isStaleOrOpen = false;
          let checkOutTime = null;

          if (colName === "workdays" && status === "active") {
            isStaleOrOpen = true;
          } else if (colName === "checkIns") {
            const hasCheckOut =
              fields.checkOutTime &&
              fields.checkOutTime.nullValue === undefined;
            if (!hasCheckOut) {
              isStaleOrOpen = true;
            } else {
              checkOutTime = fields.checkOutTime.timestampValue;
            }
          } else if (
            colName === "scheduledServices" &&
            status === "in_progress"
          ) {
            isStaleOrOpen = true;
          }

          // Also print if date is around May 14th, 2026 (2026-05-14)
          const dateVal =
            fields.date?.timestampValue ||
            fields.checkInTime?.timestampValue ||
            fields.startTime?.timestampValue;
          const isThursdayMay14 = dateVal && dateVal.includes("2026-05-14");

          if (isStaleOrOpen || isThursdayMay14) {
            console.log(
              `\n[MATCH in step ${folder} / ${colName}] ID: ${docId}`,
            );
            console.log(`  Name: ${doc.name}`);
            if (fields.date)
              console.log(`  Date: ${fields.date.timestampValue}`);
            if (fields.startTime)
              console.log(`  StartTime: ${fields.startTime.timestampValue}`);
            if (fields.endTime)
              console.log(`  EndTime: ${fields.endTime.timestampValue}`);
            if (status) console.log(`  Status: ${status}`);
            if (fields.checkInTime)
              console.log(
                `  CheckInTime: ${fields.checkInTime.timestampValue}`,
              );
            if (fields.checkOutTime)
              console.log(
                `  CheckOutTimeRaw: ${JSON.stringify(fields.checkOutTime)}`,
              );
            if (checkOutTime) console.log(`  CheckOutTime: ${checkOutTime}`);
            if (fields.communityId)
              console.log(`  CommunityId: ${fields.communityId.stringValue}`);
            if (fields.scheduledServiceId)
              console.log(
                `  ScheduledServiceId: ${fields.scheduledServiceId.stringValue}`,
              );
          }
        }
      });
    } catch (e) {
      // Ignored
    }
  }
}

scanAll();
