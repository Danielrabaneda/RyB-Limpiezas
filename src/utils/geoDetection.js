export function findLatestDetection(detections, serviceId, type) {
  return detections
    .filter(
      (detection) =>
        detection.serviceId === serviceId && detection.type === type,
    )
    .sort((a, b) => {
      const aTime = a.detectedAt?.toDate
        ? a.detectedAt.toDate().getTime()
        : new Date(a.detectedAt).getTime();
      const bTime = b.detectedAt?.toDate
        ? b.detectedAt.toDate().getTime()
        : new Date(b.detectedAt).getTime();
      return bTime - aTime;
    })[0] || null;
}
