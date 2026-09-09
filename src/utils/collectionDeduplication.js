export function uniqueByStableId(items = []) {
  const unique = new Map();
  for (const item of items) {
    if (!item?.id || item.hiddenDuplicate === true) continue;
    const key = item.occurrenceId || item.id;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, item);
      continue;
    }
    const existingScore =
      (existing.status && existing.status !== "pending" ? 2 : 0) +
      (existing.isTransferred || existing.isRescheduled ? 1 : 0);
    const candidateScore =
      (item.status && item.status !== "pending" ? 2 : 0) +
      (item.isTransferred || item.isRescheduled ? 1 : 0);
    if (candidateScore >= existingScore) unique.set(key, item);
  }
  return Array.from(unique.values());
}

export function uniqueOperators(operators = []) {
  const unique = new Map();
  for (const operator of operators) {
    const key = operator?.uid || operator?.legacyUid;
    if (!key) continue;
    if (!unique.has(key)) unique.set(key, operator);
  }
  return Array.from(unique.values());
}
