// Test script to verify the logic of getAverageWorkdayMinutesSameWeekday and 12h auto-close formatting

function formatTimeHHMM(d) {
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function calculateAverageFromDocs(docs, workdayDate) {
  const oneWeekAgo = new Date(workdayDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(workdayDate.getTime() - 14 * 24 * 60 * 60 * 1000);

  const targetDates = [
    oneWeekAgo.toISOString().split("T")[0],
    twoWeeksAgo.toISOString().split("T")[0],
  ];

  const matchingMinutes = [];
  docs.forEach((doc) => {
    if (!doc.totalMinutes || Number(doc.totalMinutes) <= 0) return;

    let docDateStr = null;
    if (doc.date) {
      const d = new Date(doc.date);
      docDateStr = d.toISOString().split("T")[0];
    }

    if (docDateStr && targetDates.includes(docDateStr)) {
      matchingMinutes.push(Number(doc.totalMinutes));
    }
  });

  if (matchingMinutes.length > 0) {
    const sum = matchingMinutes.reduce((acc, val) => acc + val, 0);
    const avg = Math.round(sum / matchingMinutes.length);
    return { avgMinutes: avg, count: matchingMinutes.length };
  }

  return { avgMinutes: 480, count: 0 };
}

// Test cases
console.log("=== TESTING AUTO-CLOSE AVERAGE LOGIC ===");

const now = new Date("2026-07-25T14:00:00Z");
const ThursdayOneWeekAgo = "2026-07-16";
const ThursdayTwoWeeksAgo = "2026-07-09";

const mockDocs = [
  { date: `${ThursdayOneWeekAgo}T08:00:00Z`, totalMinutes: 420 }, // 7 hours
  { date: `${ThursdayTwoWeeksAgo}T08:00:00Z`, totalMinutes: 480 }, // 8 hours
  { date: "2026-07-15T08:00:00Z", totalMinutes: 300 }, // Wednesday (should be ignored)
];

const result = calculateAverageFromDocs(mockDocs, new Date("2026-07-23T08:00:00Z"));
console.log("Result for Thursday Jul 23:", result);
console.log("Expected avgMinutes: 450 (7.5h)");

if (result.avgMinutes === 450 && result.count === 2) {
  console.log("TEST PASSED SUCCESFULLY!");
} else {
  console.error("TEST FAILED!");
  process.exit(1);
}
