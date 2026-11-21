const madridDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parsePortalTimestamp(timestamp) {
  if (!timestamp) return null;
  if (typeof timestamp.toDate === "function") return timestamp.toDate();
  if (typeof timestamp.seconds === "number") return new Date(timestamp.seconds * 1000);
  if (typeof timestamp._seconds === "number") return new Date(timestamp._seconds * 1000);
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getPortalDateKey(timestamp) {
  const date = parsePortalTimestamp(timestamp);
  if (!date) return null;
  const parts = Object.fromEntries(madridDayFormatter.formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function groupPortalVisits(reports) {
  const groups = new Map();
  for (const report of reports || []) {
    const timestamp = report.checkInTime || report.createdAt;
    const dateKey = getPortalDateKey(timestamp) || `unknown-${report.id}`;
    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        dateKey, timestamp, reports: [], attendanceKeys: new Set(), tasksByName: new Map(),
      });
    }
    const group = groups.get(dateKey);
    group.reports.push(report);
    group.attendanceKeys.add(report.attendanceKey || report.id);

    const details = Array.isArray(report.completedTaskDetails) &&
      report.completedTaskDetails.length > 0
      ? report.completedTaskDetails
      : (report.completedTasks || []).map((name) => ({ name, isOtherTask: false }));
    for (const task of details) {
      const name = String(task.name || "").trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase("es");
      const previous = group.tasksByName.get(key);
      group.tasksByName.set(key, {
        name: previous?.name || name,
        isOtherTask: previous?.isOtherTask === true || task.isOtherTask === true,
      });
    }
  }
  return [...groups.values()].map(({ tasksByName, attendanceKeys, ...group }) => ({
    ...group,
    attendanceCount: attendanceKeys.size,
    tasks: [...tasksByName.values()],
  }));
}
