import { getWeekOfMonth, lastDayOfMonth } from 'date-fns';

for (let month = 0; month < 12; month++) {
  const d = lastDayOfMonth(new Date(2026, month, 1));
  console.log(`Month ${month+1} last day week num:`, getWeekOfMonth(d, { weekStartsOn: 1 }));
}
