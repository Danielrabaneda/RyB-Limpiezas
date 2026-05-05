import { getWeekOfMonth, lastDayOfMonth } from 'date-fns';

const date = new Date("2026-03-31T00:00:00");
const lastD = lastDayOfMonth(date);
console.log(getWeekOfMonth(date, { weekStartsOn: 1 }));
console.log(getWeekOfMonth(lastD, { weekStartsOn: 1 }));
