export const COMPLIANCE_CONTROL_IDS = [
  "activities",
  "risks",
  "breaches",
  "access",
  "rights",
  "processors",
  "geolocation",
];

export function getComplianceProgress(program = {}) {
  const reviewed = COMPLIANCE_CONTROL_IDS.filter(
    (id) => program[id]?.reviewed === true,
  ).length;
  const total = COMPLIANCE_CONTROL_IDS.length;
  return {
    reviewed,
    total,
    percentage: Math.round((reviewed / total) * 100),
  };
}
