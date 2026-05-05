const { getWeekOfMonth, lastDayOfMonth, startOfWeek, getMonth, isSameDay, startOfDay } = require('date-fns');

function shouldScheduleOnDay(task, date) {
  const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday...
  const dayOfMonth = date.getDate();
  const currentMonthIdx = date.getMonth(); // 0-11
  
  if (task.weekOfMonth) {
    const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
    if (parseInt(task.weekOfMonth) === 5) {
      const lastDay = lastDayOfMonth(date);
      const lastWeekNum = getWeekOfMonth(lastDay, { weekStartsOn: 1 });
      if (weekNum !== lastWeekNum) return false;
    } else {
      if (weekNum !== parseInt(task.weekOfMonth)) return false;
    }
  }

  const isDefaultDay = () => {
    if (task.weekOfMonth) {
      const mon = startOfWeek(date, { weekStartsOn: 1 });
      let anchorDate = mon;
      if (getMonth(mon) !== currentMonthIdx) {
        anchorDate = new Date(date.getFullYear(), currentMonthIdx, 1);
      }
      return isSameDay(date, anchorDate);
    }
    return dayOfMonth === 1;
  };

  switch (task.frequencyType) {
    case 'monthly':
      if (task.monthDays && task.monthDays.length > 0) {
        return task.monthDays.includes(dayOfMonth);
      }
      return isDefaultDay();
    default:
      return false;
  }
}

const task = {
  weekOfMonth: '5',
  frequencyType: 'monthly',
  createdAt: new Date('2024-01-01')
};

// Test for April 2026
const results = [];
for (let d = 1; d <= 30; d++) {
  const date = new Date(2026, 3, d);
  if (shouldScheduleOnDay(task, date)) {
    results.push(date.toISOString());
  }
}
console.log("April 2026 matches:", results);

// Test for May 2026
const resultsMay = [];
for (let d = 1; d <= 31; d++) {
  const date = new Date(2026, 4, d);
  if (shouldScheduleOnDay(task, date)) {
    resultsMay.push(date.toISOString());
  }
}
console.log("May 2026 matches:", resultsMay);
