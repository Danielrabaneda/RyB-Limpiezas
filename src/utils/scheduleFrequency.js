const FREQUENCY_MONTHS = {
  bimonthly: 2,
  trimonthly: 3,
  quadrimonthly: 4,
  semiannual: 6,
  eightmonthly: 8,
  annual: 12,
};

const MONTH_LABELS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export function getExplicitScheduleMonth(task) {
  if (
    task.monthOfYear !== undefined &&
    task.monthOfYear !== null &&
    task.monthOfYear !== ""
  ) {
    const selectedMonth = Number(task.monthOfYear);
    if (Number.isInteger(selectedMonth) && selectedMonth >= 0 && selectedMonth <= 11) {
      return selectedMonth;
    }
  }

  if (typeof task.startDate === "string") {
    const match = task.startDate.match(/^\d{4}-(\d{2})-\d{2}/);
    if (match) return Number(match[1]) - 1;
  }

  const startDate = task.startDate?.toDate
    ? task.startDate.toDate()
    : task.startDate instanceof Date
      ? task.startDate
      : null;
  return startDate && !Number.isNaN(startDate.getTime())
    ? startDate.getMonth()
    : null;
}

export function getFrequencyMonthPreview(task) {
  const step = FREQUENCY_MONTHS[task.frequencyType];
  if (!step) return "";

  const anchorMonth = getExplicitScheduleMonth(task) ?? 0;
  const labels = [];
  const visited = new Set();
  let month = anchorMonth;
  while (!visited.has(month)) {
    visited.add(month);
    labels.push(MONTH_LABELS[month]);
    month = (month + step) % 12;
  }
  return labels.join(", ");
}
