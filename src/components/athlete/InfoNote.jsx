import { Info, ChevronDown } from "lucide-react";

// ── InfoNote — a tap-to-reveal legend (Info popover via native details) ─────────
// Moves verbose chart-legend paragraphs out of the default view so cards stay
// scannable; tapping the Info dot discloses the explanation in place.
export default function InfoNote({ children, label = "What do these mean?" }) {
  return (
    <details className="group mt-1">
      <summary className="list-none flex items-center gap-1.5 cursor-pointer min-h-[44px] py-2.5 text-micro font-bold uppercase tracking-[0.08em] text-faint hover:text-muted-2 transition-colors duration-200 ease-[var(--ease)]">
        <Info className="w-3.5 h-3.5" />
        <span>{label}</span>
        <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 ease-[var(--ease)] group-open:rotate-180" />
      </summary>
      <p className="text-caption font-semibold text-muted-2 mt-1.5 leading-relaxed">{children}</p>
    </details>
  );
}
