export function getCurrentServiceGroup(groupedServices, service) {
  if (Array.isArray(groupedServices) && groupedServices.length > 0) {
    return groupedServices;
  }

  return service ? [service] : [];
}
