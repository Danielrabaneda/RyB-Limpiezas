export function getCurrentServiceGroup(groupedServices, service) {
  return Array.isArray(groupedServices) && groupedServices.length > 0
    ? groupedServices
    : service
      ? [service]
      : [];
}
