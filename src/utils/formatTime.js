export const formatDecimalHours = (decimalHours) => {
  if (decimalHours === undefined || decimalHours === null || isNaN(decimalHours)) return '0:00 h';
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, '0')} h`;
};

export const formatMinutes = (minutes) => {
  if (!minutes || isNaN(minutes)) return '0:00 h';
  const totalMinutes = Math.round(minutes);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, '0')} h`;
};
