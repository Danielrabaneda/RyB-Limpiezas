export function getCommunityCoordinates(community) {
  if (!community || typeof community !== "object") return null;
  const location = community.location || {};
  const latitude = Number(location._lat ?? location.latitude ?? community.latitude);
  const longitude = Number(
    location._long ?? location.longitude ?? community.longitude,
  );
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function getCommunityNavigationDestination(community = {}) {
  if (!community || typeof community !== "object") return null;
  const coordinates = getCommunityCoordinates(community);
  if (coordinates) {
    return {
      value: `${coordinates.latitude},${coordinates.longitude}`,
      label: community.name || community.address || "Destino",
      usesCoordinates: true,
    };
  }

  const address = String(community.address || "").trim();
  if (!address) return null;
  return {
    value: address,
    label: community.name || address,
    usesCoordinates: false,
  };
}

export function canNavigateToCommunity(community) {
  return Boolean(getCommunityNavigationDestination(community));
}

export function buildCommunityNavigationUrl(
  community,
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
) {
  const destination = getCommunityNavigationDestination(community);
  if (!destination) return null;

  if (/android/i.test(userAgent)) {
    const query = destination.usesCoordinates
      ? `${destination.value}(${destination.label})`
      : destination.value;
    return `geo:0,0?q=${encodeURIComponent(query)}`;
  }

  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return `maps://?daddr=${encodeURIComponent(destination.value)}&dirflg=d`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination.value)}`;
}

export function openCommunityNavigation(community) {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const url = buildCommunityNavigationUrl(community, userAgent);
  if (!url || typeof window === "undefined") return false;

  if (/android|iphone|ipad|ipod/i.test(userAgent)) {
    window.location.assign(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return true;
}
