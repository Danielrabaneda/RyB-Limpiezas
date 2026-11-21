function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

// Firestore can temporarily contain more than one active workday for the same
// operator (legacy identities and older duplicate sessions). Companion changes
// update `updatedAt`, so choosing the most recently changed session preserves
// the operator's explicit choice after the app is mounted again.
export function selectCanonicalActiveWorkday(workdays) {
  return [...workdays]
    .filter((workday) => workday?.status === "active")
    .sort((a, b) => {
      const updatedDifference = toMillis(b.updatedAt) - toMillis(a.updatedAt);
      if (updatedDifference !== 0) return updatedDifference;

      const startDifference = toMillis(b.startTime) - toMillis(a.startTime);
      if (startDifference !== 0) return startDifference;

      return String(b.id || "").localeCompare(String(a.id || ""));
    })[0] || null;
}
