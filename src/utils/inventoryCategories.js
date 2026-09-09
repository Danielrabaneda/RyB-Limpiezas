export const CATEGORIES = [
  {
    id: "quimicos",
    name: "Químicos / Limpieza",
    emoji: "🧪",
    badgeClass: "badge-cat-quimicos",
  },
  {
    id: "bolsas",
    name: "Bolsas y Plásticos",
    emoji: "🛍️",
    badgeClass: "badge-cat-bolsas",
  },
  {
    id: "epis",
    name: "EPIS y Guantes",
    emoji: "🧤",
    badgeClass: "badge-cat-epis",
  },
  {
    id: "utensilios",
    name: "Utensilios y Bayetas",
    emoji: "🧽",
    badgeClass: "badge-cat-utensilios",
  },
  {
    id: "general",
    name: "Otros / General",
    emoji: "📦",
    badgeClass: "badge-cat-general",
  },
];

export const autoCategorize = (name) => {
  if (!name) return "general";
  const lower = name.toLowerCase();
  if (
    lower.includes("lejía") ||
    lower.includes("legia") ||
    lower.includes("amoniaco") ||
    lower.includes("fregasuelos") ||
    lower.includes("ambientador") ||
    lower.includes("lavavajillas") ||
    lower.includes("limpia cristales") ||
    lower.includes("limpiador") ||
    lower.includes("desinfectante") ||
    lower.includes("quimico") ||
    lower.includes("jabón") ||
    lower.includes("jabon")
  ) {
    return "quimicos";
  }
  if (lower.includes("bolsa")) {
    return "bolsas";
  }
  if (
    lower.includes("guante") ||
    lower.includes("mascarilla") ||
    lower.includes("gel") ||
    lower.includes("protección") ||
    lower.includes("epis") ||
    lower.includes("botiquín") ||
    lower.includes("botiquin")
  ) {
    return "epis";
  }
  if (
    lower.includes("paño") ||
    lower.includes("trapo") ||
    lower.includes("bayeta") ||
    lower.includes("fregona") ||
    lower.includes("cepillo") ||
    lower.includes("escoba") ||
    lower.includes("mopa") ||
    lower.includes("cubo") ||
    lower.includes("paleta") ||
    lower.includes("estropajo") ||
    lower.includes("esponja")
  ) {
    return "utensilios";
  }
  return "general";
};
