import { ThinkingOrb } from "thinking-orbs";

const ORB_SIZES = {
  page: 64,
  section: 32,
  inline: 32,
};

const ORB_DISPLAY_SIZES = {
  page: 76.8,
  section: 38.4,
  inline: 38.4,
};

export default function LoadingOrb({
  label = "Cargando…",
  state = "working",
  variant = "section",
  theme = "light",
  className = "",
}) {
  const size = ORB_SIZES[variant] || ORB_SIZES.section;
  const displaySize = ORB_DISPLAY_SIZES[variant] || ORB_DISPLAY_SIZES.section;

  return (
    <div
      className={`loading-orb loading-orb-${variant} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <ThinkingOrb
        state={state}
        size={size}
        theme={theme}
        style={{ width: displaySize, height: displaySize }}
        aria-hidden="true"
      />
      {label && <span>{label}</span>}
    </div>
  );
}
