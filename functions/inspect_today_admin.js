const admin = require("firebase-admin");
admin.initializeApp({
  projectId: "ryb-limpiezas-app",
});

const db = admin.firestore();

async function main() {
  console.log("=== USERS (OPERARIOS) ===");
  const usersSnap = await db.collection("users").get();
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  users.forEach((u) => {
    console.log(
      `- User: ${u.name} (Email: ${u.email || u.id}, UID: ${u.id || u.uid})`,
    );
  });

  const todayStart = new Date("2026-07-06T00:00:00");
  const todayEnd = new Date("2026-07-06T23:59:59");

  console.log("\n=== SERVICES FOR TODAY (2026-07-06) ===");
  const servicesSnap = await db.collection("scheduledServices").get();
  const services = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const todayServices = services.filter((s) => {
    if (!s.scheduledDate) return false;
    const date = s.scheduledDate.toDate
      ? s.scheduledDate.toDate()
      : new Date(s.scheduledDate);
    return date >= todayStart && date <= todayEnd;
  });

  todayServices.forEach((s) => {
    const date = s.scheduledDate.toDate
      ? s.scheduledDate.toDate()
      : new Date(s.scheduledDate);
    console.log(`- Service ID: ${s.id}`);
    console.log(
      `  Community: ${s.communityName || "N/A"} (ID: ${s.communityId})`,
    );
    console.log(`  Task: ${s.taskName || "N/A"}`);
    console.log(`  Status: ${s.status}`);
    console.log(
      `  Assigned: ${s.assignedUserName || "N/A"} (UID: ${s.assignedUserId})`,
    );
    console.log(`  Companions: ${JSON.stringify(s.companionIds || [])}`);
    console.log(`  Logs: ${JSON.stringify(s.companionLogs || [])}`);
  });

  console.log("\n=== CHECK-INS FOR TODAY (2026-07-06) ===");
  const checkInsSnap = await db.collection("checkIns").get();
  const checkIns = checkInsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const todayCheckIns = checkIns.filter((c) => {
    const date = c.checkInTime?.toDate
      ? c.checkInTime.toDate()
      : new Date(c.checkInTime);
    return date >= todayStart && date <= todayEnd;
  });

  todayCheckIns.forEach((c) => {
    const checkinDate = c.checkInTime?.toDate
      ? c.checkInTime.toDate().toISOString()
      : new Date(c.checkInTime).toISOString();
    const checkoutDate = c.checkOutTime?.toDate
      ? c.checkOutTime.toDate().toISOString()
      : "OPEN (null)";
    console.log(`- CheckIn ID: ${c.id}`);
    console.log(`  User: ${c.userId}`);
    console.log(`  Service ID: ${c.scheduledServiceId}`);
    console.log(`  In: ${checkinDate}`);
    console.log(`  Out: ${checkoutDate}`);
  });

  console.log("\n=== WORKDAYS FOR TODAY (2026-07-06) ===");
  const workdaysSnap = await db.collection("workdays").get();
  const workdays = workdaysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const todayWorkdays = workdays.filter((w) => {
    if (!w.date) return false;
    const date = w.date.toDate ? w.date.toDate() : new Date(w.date);
    return date >= todayStart && date <= todayEnd;
  });

  todayWorkdays.forEach((w) => {
    const date = w.date.toDate
      ? w.date.toDate().toISOString().split("T")[0]
      : new Date(w.date).toISOString().split("T")[0];
    console.log(`- Workday ID: ${w.id}`);
    console.log(`  User: ${w.userId}`);
    console.log(`  Date: ${date}`);
    console.log(
      `  Start: ${w.startTime?.toDate ? w.startTime.toDate().toISOString() : "N/A"}`,
    );
    console.log(
      `  End: ${w.endTime?.toDate ? w.endTime.toDate().toISOString() : "N/A"}`,
    );
    console.log(`  Companion: ${w.currentCompanionId || "None"}`);
  });

  process.exit(0);
}

main().catch(console.error);
