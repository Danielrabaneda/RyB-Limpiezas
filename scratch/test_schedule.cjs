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
  
  if (!isForecasting) {
    const evalMonthStart = startOfMonth(date);
    const creationMonthStart = startOfMonth(taskCreationDate);
    if (isBefore(evalMonthStart, creationMonthStart)) return false;
  }

  if (taskStart && startOfDay(date) < startOfDay(taskStart)) return false;
  if (taskEnd && startOfDay(date) > startOfDay(taskEnd)) return false;

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
    if (monthDiff < 0 || monthDiff % frequency !== 0) return false;
  }

  const isWeekdayMatch = (dOfWeek) => {
    if (!task.weekDays || task.weekDays.length === 0) return false;
    return task.weekDays.some(wd => parseInt(wd) === dOfWeek);
  };

  const isDefaultDay = () => {
    if (task.weekDays && task.weekDays.length > 0) {
      let targetWeek = task.weekOfMonth ? parseInt(task.weekOfMonth) : null;
      if (!targetWeek) {
        const refDate = taskStart || taskCreationDate;
        targetWeek = getWeekOfMonth(refDate, { weekStartsOn: 1 });
      }
      if (targetWeek) {
        const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
        let weekMatches = (weekNum === targetWeek);
        if (targetWeek === 5) {
          const lastDay = lastDayOfMonth(date);
          const lastWeekNum = getWeekOfMonth(lastDay, { weekStartsOn: 1 });
          weekMatches = (weekNum === lastWeekNum);
        }
        if (!weekMatches) return false;
        return isWeekdayMatch(dayOfWeek);
      }
      return isWeekdayMatch(dayOfWeek) && dayOfMonth <= 7;
    }

    if (task.weekOfMonth) {
      return dayOfWeek === 1; 
    }

    if (taskStart) {
      const targetDay = getDate(taskStart);
      const lastDate = getDate(lastDayOfMonth(date));
      return dayOfMonth === Math.min(targetDay, lastDate);
    }

    const creationDay = getDate(taskCreationDate);
    const lastDate = getDate(lastDayOfMonth(date));
    return dayOfMonth === Math.min(creationDay, lastDate);
  };

  if (task.frequencyType === 'bimonthly') {
    return isDefaultDay();
  }
  return false;
}

const task = {
  frequencyType: 'bimonthly',
  startDate: '2026-05-15',
  createdAt: '2026-05-02T19:22:45Z',
  weekDays: []
};

const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
console.log('--- Forecasting for 2026 ---');
months.forEach(mIdx => {
  const mDate = new Date(2026, mIdx, 1);
  const mStart = startOfMonth(mDate);
  const mEnd = endOfMonth(mDate);
  const days = eachDayOfInterval({ start: mStart, end: mEnd });
  const matchingDay = days.find(day => shouldScheduleOnDay(task, day, { isForecasting: true }));
  console.log(`Month ${mIdx + 1}: ${matchingDay ? 'YES (' + format(matchingDay, 'yyyy-MM-dd') + ')' : 'NO'}`);
});
