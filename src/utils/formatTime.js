export const formatDecimalHours = (decimalHours) => {
  if (
    decimalHours === undefined ||
    decimalHours === null ||
    isNaN(decimalHours)
  )
    return "0:00 h";
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, "0")} h`;
};

export const formatMinutes = (minutes) => {
  if (!minutes || isNaN(minutes)) return "0:00 h";
  const totalMinutes = Math.round(minutes);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, "0")} h`;
};

/**
 * Formats a Date object or Timestamp to "HH:MM" string.
 * @param {Date|Object} date
 * @returns {string}
 */
export const formatTimeToHHMM = (date) => {
  if (!date) return "";
  const d = date.toDate ? date.toDate() : new Date(date);
  if (isNaN(d.getTime())) return "";
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
};

/**
 * Parses a "HH:MM" string and returns a Date object set to today's date at that time.
 * @param {string} timeStr - format "HH:MM"
 * @param {Date} [referenceDate] - reference base date, defaults to today
 * @returns {Date|null}
 */
export const parseHHMM = (timeStr, referenceDate = new Date()) => {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;

  const d = new Date(referenceDate);
  d.setHours(h, m, 0, 0);
  return d;
};
