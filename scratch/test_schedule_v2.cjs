const { 
  format, startOfDay, endOfDay, addDays, getDay, getDate, getMonth, getYear,
  startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth,
  isSameDay, isSameWeek, getWeekOfMonth, isWithinInterval, lastDayOfMonth,
  isBefore, differenceInCalendarWeeks
} = require('date-fns');

function shouldScheduleOnDay(task, date, options = {}) {
  const { isForecasting = false } = options;
  const dayOfWeek = getDay(date); // 0=Sunday, 1=Monday...
  const dayOfMonth = getDate(date);
  const currentMonthIdx = getMonth(date); // 0-11
  
  const explicitStart = task.startDate ? new Date(task.startDate + (task.startDate.includes('T') ? '' : 'T00:00:00')) : null;
  const taskStart = explicitStart;
  
  const taskEnd = task.endDate ? new Date(task.endDate + (task.endDate.includes('T') ? '' : 'T23:59:59')) : null;

  const taskCreationDate = startOfDay(new Date(task.createdAt || '2026-05-02T19:22:45Z'));
  
  // NEW LOGIC
  const isAfterEnd = taskEnd && startOfDay(date) > startOfDay(taskEnd);
  const isBeforeStart = taskStart && startOfDay(date) < startOfDay(taskStart);

  if (!isForecasting) {
    if (isBeforeStart || isAfterEnd) return false;
    const evalMonthStart = startOfMonth(date);
    const creationMonthStart = startOfMonth(taskCreationDate);
    if (isBefore(evalMonthStart, creationMonthStart)) return false;
  } else {
    if (taskStart && getYear(date) < getYear(taskStart)) return false;
    if (taskEnd && getYear(date) > getYear(taskEnd)) return false;
  }

  const periodicMultiMonth = ['bimonthly', 'trimonthly', 'quadrimonthly', 'semiannual', 'eightmonthly', 'annual'];
  const isPeriodic = periodicMultiMonth.includes(task.frequencyType);

  let anchorMonth = 0;
  let anchorYear = 2024; 
  
  const taskMonthOfYear = task.monthOfYear !== undefined && task.monthOfYear !== null && task.monthOfYear !== '' ? parseInt(task.monthOfYear) : NaN;
  
  if (!isNaN(taskMonthOfYear)) {
    anchorMonth = taskMonthOfYear;
    anchorYear = taskStart ? getYear(taskStart) : getYear(taskCreationDate);
  } else if (isPeriodic) {
    anchorMonth = 0;
    anchorYear = 2024;
  } else if (taskStart) {
    anchorMonth = getMonth(taskStart);
    anchorYear = getYear(taskStart);
  } else {
    anchorMonth = getMonth(taskCreationDate);
    anchorYear = getYear(taskCreationDate);
  }

  const monthDiff = (getYear(date) - anchorYear) * 12 + (currentMonthIdx - anchorMonth);

  if (isPeriodic) {
    const freqMap = {
      'bimonthly': 2,
      'trimonthly': 3,
      'quadrimonthly': 4,
      'semiannual': 6,
      'eightmonthly': 8,
      'annual': 12
    };
    const frequency = freqMap[task.frequencyType] || 1;
    // NEW MODULO
    const normalizedDiff = ((monthDiff % frequency) + frequency) % frequency;
    if (normalizedDiff !== 0) return false;
  }

  const isDefaultDay = () => {
    if (taskStart) {
      const targetDay = getDate(taskStart);
      const lastDate = getDate(lastDayOfMonth(date));
      return dayOfMonth === Math.min(targetDay, lastDate);
    }
    return dayOfMonth === 1;
  };

  if (task.frequencyType === 'bimonthly') {
    return isDefaultDay();
  }
  return false;
}

const task = {
  frequencyType: 'bimonthly',
  startDate: '2026-05-15',
  createdAt: '2026-05-02T19:22:45Z'
};

const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
console.log('--- Forecasting for 2026 (NEW LOGIC) ---');
months.forEach(mIdx => {
  const mDate = new Date(2026, mIdx, 1);
  const mStart = startOfMonth(mDate);
  const mEnd = endOfMonth(mDate);
  const days = eachDayOfInterval({ start: mStart, end: mEnd });
  const matchingDay = days.find(day => shouldScheduleOnDay(task, day, { isForecasting: true }));
  console.log(`Month ${mIdx + 1}: ${matchingDay ? 'YES (' + format(matchingDay, 'yyyy-MM-dd') + ')' : 'NO'}`);
});
