// Shared filter-pill class builder for the Workouts screens.
const FILTER_PILL_BASE =
  "px-3.5 min-h-[44px] rounded-full text-caption font-bold tracking-[0.06em] uppercase transition-colors duration-200 ease-[var(--ease)] active:scale-[0.97]";
export const filterPill = (active) =>
  `${FILTER_PILL_BASE} ${active ? "glass-inset bg-track text-ink" : "glass-inset text-ink-muted hover:text-ink"}`;
