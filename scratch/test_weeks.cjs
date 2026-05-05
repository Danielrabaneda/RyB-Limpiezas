const { getWeekOfMonth, lastDayOfMonth, startOfWeek } = require('date-fns');

function test(dateStr) {
  const date = new Date(dateStr);
  const weekNum = getWeekOfMonth(date, { weekStartsOn: 1 });
  
  const lastDay = lastDayOfMonth(date);
  const lastWeekNum = getWeekOfMonth(lastDay, { weekStartsOn: 1 });
  
  console.log(`Date: ${dateStr} | WeekOfMonth: ${weekNum} | LastWeekOfMonth: ${lastWeekNum} | Match: ${weekNum === lastWeekNum}`);
}

console.log('Testing April 2026:');
test('2026-04-20'); // Week 4
test('2026-04-26'); // Week 4 (Sunday)
test('2026-04-27'); // Week 5
test('2026-04-30'); // Week 5

console.log('\nTesting May 2026:');
test('2026-05-01'); // Week 1 (Friday)
test('2026-05-25'); // Week 5?
test('2026-05-31'); // Week 5 (Sunday)
