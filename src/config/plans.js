export const PLAN_CATALOG = {
  autonomo: {
    label: "Autónomo",
    color: "#059669",
    operarios: 5,
    communities: 50,
    admins: null,
    storageGb: 2,
    monthlyPrice: 19,
  },
  starter: {
    label: "Starter",
    color: "#0ea5e9",
    operarios: 10,
    communities: 100,
    admins: null,
    storageGb: 5,
    monthlyPrice: 39,
  },
  professional: {
    label: "Professional",
    color: "#7c3aed",
    operarios: 30,
    communities: 300,
    admins: null,
    storageGb: 25,
    monthlyPrice: 79,
  },
  business: {
    label: "Business",
    color: "#ea580c",
    operarios: 100,
    communities: 1000,
    admins: null,
    storageGb: 100,
    monthlyPrice: 149,
  },
  enterprise: {
    label: "Enterprise",
    color: "#0f172a",
    operarios: null,
    communities: null,
    admins: null,
    storageGb: null,
    monthlyPrice: null,
  },
};

export function formatLimit(value) {
  return value === null ? "Ilimitado" : value.toLocaleString("es-ES");
}
