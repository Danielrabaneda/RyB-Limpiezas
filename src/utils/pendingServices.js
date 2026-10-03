import {
  differenceInCalendarDays,
  endOfDay,
  isSameDay,
  startOfDay,
} from "date-fns";

export function scheduledServiceDate(service) {
  const value = service?.scheduledDate;
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pendingServiceAgeDays(service, today = new Date()) {
  const date = scheduledServiceDate(service);
  if (!date) return 0;
  return Math.max(0, differenceInCalendarDays(startOfDay(today), startOfDay(date)));
}

export function pendingServiceType(service) {
  const name = String(service?.taskName || "").toLocaleLowerCase("es");
  if (name.includes("garaje")) return "garaje";
  if (name.includes("portal")) return "portal";
  if (name.includes("escalera")) return "escalera";
  if (name.includes("oficina")) return "oficina";
  return "otros";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function filterPendingServices(
  services,
  filters = {},
  { communitiesById = {}, operariosById = {}, today = new Date() } = {},
) {
  const todayEnd = endOfDay(today);
  const search = normalize(filters.search);
  const from = filters.dateFrom
    ? startOfDay(new Date(`${filters.dateFrom}T12:00:00`))
    : null;
  const to = filters.dateTo
    ? endOfDay(new Date(`${filters.dateTo}T12:00:00`))
    : null;

  const result = (services || []).filter((service) => {
    const date = scheduledServiceDate(service);
    if (!date || date > todayEnd || (service.status && service.status !== "pending")) {
      return false;
    }

    if (filters.operarioId && service.assignedUserId !== filters.operarioId) {
      return false;
    }
    if (filters.communityId && service.communityId !== filters.communityId) {
      return false;
    }
    if (filters.type && filters.type !== "todos" && pendingServiceType(service) !== filters.type) {
      return false;
    }
    if (from && date < from) return false;
    if (to && date > to) return false;

    const age = pendingServiceAgeDays(service, today);
    if (filters.timing === "overdue" && age < 1) return false;
    if (filters.timing === "today" && !isSameDay(date, today)) return false;
    if (filters.timing === "older7" && age < 7) return false;
    if (filters.timing === "older30" && age < 30) return false;

    if (search) {
      const community = communitiesById[service.communityId];
      const operario = operariosById[service.assignedUserId];
      const haystack = normalize(
        [
          service.taskName,
          community?.name,
          community?.address,
          operario?.displayName,
          operario?.name,
          operario?.email,
        ].join(" "),
      );
      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  const direction = filters.sort === "newest" ? -1 : 1;
  return result.sort(
    (a, b) =>
      direction *
      (scheduledServiceDate(a).getTime() - scheduledServiceDate(b).getTime()),
  );
}
