"use strict";

const MADRID_TIME_ZONE = "Europe/Madrid";

function getMadridDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function clampAutoCloseEndTime(preferredEndTime, lastCheckInTime, cutoffTime) {
  let endTime = new Date(preferredEndTime);
  if (lastCheckInTime && endTime < lastCheckInTime) {
    endTime = new Date(lastCheckInTime);
  }
  if (endTime > cutoffTime) {
    endTime = new Date(cutoffTime);
  }
  return endTime;
}

module.exports = {
  MADRID_TIME_ZONE,
  clampAutoCloseEndTime,
  getMadridDateKey,
};
