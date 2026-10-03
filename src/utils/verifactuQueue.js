const partsFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function queueDate(value) {
  if (value == null) return null;
  try {
    const date = typeof value.toDate === 'function' ? value.toDate()
      : typeof value.seconds === 'number' ? new Date(value.seconds * 1000)
      : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = Object.fromEntries(partsFormatter.formatToParts(date).map(p => [p.type, p.value]));
    return { year: parts.year, month: parts.month, label: `${parts.day}/${parts.month}/${parts.year}` };
  } catch { return null; }
}

export function selectQueuePage(items, year = '', month = '', page = 1, pageSize = 10) {
  const filtered = items.filter(item => {
    const date = queueDate(item.createdAt);
    return (!year || date?.year === year) && (!month || date?.month === month);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.max(1, Math.min(page, pages));
  return { items: filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    total: filtered.length, pages, currentPage };
}
