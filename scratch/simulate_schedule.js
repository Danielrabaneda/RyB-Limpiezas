import { 
  startOfDay, endOfDay, addDays, format, getDay, getDate, getMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth,
  isSameDay, getWeekOfMonth, isWithinInterval, lastDayOfMonth
} from 'date-fns';

function shouldScheduleOnDay(task, date) {
  const dayOfWeek = getDay(date); // 0=Sunday, 1=Monday...
  const dayOfMonth = getDate(date);
  const currentMonthIdx = getMonth(date); // 0-11
  const currentMonth = currentMonthIdx + 1; // 1-12
  
  // 1. Boundary Checks (Start and End dates)
  const explicitStart = task.startDate ? new Date(task.startDate) : null;
  const punctualStart = task.punctualDate ? new Date(task.punctualDate) : null;
  const taskStart = explicitStart || punctualStart;
  
  const taskEnd = task.endDate ? new Date(task.endDate) : null;

  // Evitar programar tareas hacia atrás desde la fecha de creación (no retroactivo)
  const taskCreationDateRaw = task.createdAt ? new Date(task.createdAt) : new Date();
  const taskCreationDate = startOfDay(taskCreationDateRaw);
  
  // No programar si la fecha a evaluar es anterior a la fecha en que se programó/creó la tarea
  if (date < taskCreationDate) return false;

  if (taskStart && date < startOfDay(taskStart)) return false;
  if (taskEnd && date > endOfDay(taskEnd)) return false;

  // 2. Service Mode Logic
  if (task.serviceMode === 'once') {
    return taskStart ? isSameDay(date, taskStart) : false;
  }

  // 3. Month and Week Filters
  // Filter by Month of Year if specified (task.monthOfYear is 0-indexed: 0-11)
  if (task.monthOfYear !== undefined && task.monthOfYear !== null && task.monthOfYear !== '') {
    if (currentMonthIdx !== parseInt(task.monthOfYear)) return false;
  }

  // Filter by Week of Month if specified
  if (task.weekOfMonth) {
    const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
    if (parseInt(task.weekOfMonth) === 5) {
      // 5 significa "Última semana"
      const lastDay = lastDayOfMonth(date);
      const lastWeekNum = getWeekOfMonth(lastDay, { weekStartsOn: 1 });
      if (weekNum !== lastWeekNum) return false;
    } else {
      if (weekNum !== parseInt(task.weekOfMonth)) return false;
    }
  }

  if (task.flexibleWeek) {
    const mon = startOfWeek(date, { weekStartsOn: 1 });
    let anchorDate = mon;
    if (getMonth(mon) !== currentMonthIdx) {
      anchorDate = new Date(date.getFullYear(), currentMonthIdx, 1);
    }
    
    if (!isSameDay(date, anchorDate)) return false;

    // Asegurarse de que cumple también el mes si no tenía weekOfMonth
    if (!task.weekOfMonth && (task.frequencyType === 'monthly' || task.frequencyType === 'bimonthly' || task.frequencyType === 'trimonthly' || task.frequencyType === 'semiannual' || task.frequencyType === 'annual')) {
      const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
      if (weekNum !== 1) return false; // si solo dicen mensualmente, sin semana especifica, usamos la semana 1.
    }

    switch (task.frequencyType) {
       case 'bimonthly': if (currentMonthIdx % 2 !== 0) return false; break;
       case 'trimonthly': if (currentMonthIdx % 3 !== 0) return false; break;
       case 'semiannual': if (currentMonthIdx % 6 !== 0) return false; break;
       case 'annual': if (currentMonthIdx !== 0) return false; break;
       case 'biweekly': 
          if (taskStart) {
            const weeksDiff = Math.floor((date.getTime() - startOfDay(taskStart).getTime()) / (7 * 24 * 60 * 60 * 1000));
            if (weeksDiff % 2 !== 0) return false; 
          }
          break;
    }
    
    return true;
  }

  // 4. Frequency Logic (Only for period or periodic modes)
  
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
    case 'weekly':
      if (task.weekDays && task.weekDays.length > 0) {
        return task.weekDays.includes(dayOfWeek);
      }
      return dayOfWeek === 1;
      
    case 'biweekly':
      if (task.weekDays && task.weekDays.length > 0) {
        if (taskStart) {
          const diffInMs = date.getTime() - startOfDay(taskStart).getTime();
          const weeksSinceStart = Math.floor(diffInMs / (7 * 24 * 60 * 60 * 1000));
          return task.weekDays.includes(dayOfWeek) && weeksSinceStart % 2 === 0;
        }
        const weekNum = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
        return task.weekDays.includes(dayOfWeek) && weekNum % 2 === 0;
      }
      return false;
      
    case 'monthly':
      if (task.monthDays && task.monthDays.length > 0) {
        return task.monthDays.includes(dayOfMonth);
      }
      return isDefaultDay();

    case 'bimonthly': 
      if (taskStart) {
        const monthDiff = (date.getFullYear() - taskStart.getFullYear()) * 12 + (date.getMonth() - taskStart.getMonth());
        if (monthDiff % 2 !== 0) return false;
      } else if (currentMonth % 2 === 0) return false;
      return task.monthDays?.length > 0 ? task.monthDays.includes(dayOfMonth) : isDefaultDay();

    default:
      if (task.serviceMode === 'period') return true; 
      return false;
  }
}

const task = {
  frequencyType: 'monthly',
  weekOfMonth: "5",
  flexibleWeek: false,
  monthDays: [],
  weekDays: [],
  serviceMode: 'periodic',
  createdAt: new Date("2026-04-01T00:00:00")
};

const days = eachDayOfInterval({ start: new Date("2026-04-23T00:00:00"), end: addDays(new Date("2026-04-23T00:00:00"), 90) });

const generated = [];
for (const day of days) {
  if (shouldScheduleOnDay(task, day)) {
    generated.push(format(day, 'yyyy-MM-dd (EEEE)'));
  }
}

console.log("Generated dates:");
console.log(generated);
