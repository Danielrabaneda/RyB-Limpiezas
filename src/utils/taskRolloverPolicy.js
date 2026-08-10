function normalizeTaskName(taskName = "") {
  return String(taskName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function shouldNeverCarryTask(taskName) {
  const normalizedName = normalizeTaskName(taskName);
  return (
    normalizedName.includes("escalera") ||
    normalizedName.includes("portal")
  );
}
