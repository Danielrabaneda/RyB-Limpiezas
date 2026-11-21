function timestampToMillis(value) {
  if (!value) return 0;
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function getActiveOperatorIds({
  workdays = [],
  checkIns = [],
  services = [],
  communities = [],
  operators = [],
}) {
  const canonicalUserId = (value) => {
    if (!value) return "";
    const rawUid =
      typeof value === "object" ? value.uid || value.id || "" : value;
    return (
      operators.find(
        (operator) =>
          operator.uid === rawUid || operator.legacyUid === rawUid,
      )?.uid || rawUid
    );
  };

  const latestWorkdayByUser = new Map();
  workdays.forEach((workday) => {
    if (!workday.userId) return;
    const uid = canonicalUserId(workday.userId);
    const rawActivityTime =
      workday.status === "active"
        ? workday.startTime
        : workday.endTime || workday.updatedAt || workday.startTime;
    const activityTime = timestampToMillis(rawActivityTime);
    const current = latestWorkdayByUser.get(uid);

    if (!current || activityTime >= current.activityTime) {
      latestWorkdayByUser.set(uid, { workday, activityTime });
    }
  });

  const hasActiveWorkday = (uid) => {
    if (!uid) return false;
    return (
      latestWorkdayByUser.get(canonicalUserId(uid))?.workday?.status ===
      "active"
    );
  };

  const activeUserIds = new Set();
  latestWorkdayByUser.forEach(({ workday }, uid) => {
    if (workday.status !== "active") return;
    activeUserIds.add(uid);
    if (
      workday.currentCompanionId &&
      hasActiveWorkday(workday.currentCompanionId)
    ) {
      activeUserIds.add(canonicalUserId(workday.currentCompanionId));
    }
  });

  const servicesById = new Map(services.map((service) => [service.id, service]));
  const communitiesById = new Map(
    communities.map((community) => [community.id, community]),
  );

  checkIns
    .filter((checkIn) => !checkIn.checkOutTime)
    .forEach((checkIn) => {
      const uid = canonicalUserId(checkIn.userId);
      if (!uid) return;

      const service = checkIn.scheduledServiceId
        ? servicesById.get(checkIn.scheduledServiceId)
        : null;
      const communityId = checkIn.communityId || service?.communityId;
      const hasIndividualTimeTracking =
        communitiesById.get(communityId)?.individualTimeTracking === true;

      // A normal service check-in does not outlive a closed general workday.
      // Individual-tracking services are the exception: their open check-in is
      // the service-specific work period, so it makes the operator active.
      if (!activeUserIds.has(uid) && !hasIndividualTimeTracking) return;
      activeUserIds.add(uid);

      if (service && Array.isArray(service.companionIds)) {
        service.companionIds.forEach((companionId) => {
          if (companionId && hasActiveWorkday(companionId)) {
            activeUserIds.add(canonicalUserId(companionId));
          }
        });
      }
    });

  return Array.from(activeUserIds);
}
