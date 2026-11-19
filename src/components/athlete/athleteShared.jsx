import { Badge } from "@/components/ui/badge";

// ── helpers ───────────────────────────────────────────────────────────────────

// Badge agrees with the measured rate: a lift still gaining load is never
// "Stalled", whatever the stall-risk model says. Status is state, not alarm,
// so no red here; warn is the strongest tint.
export function StallBadge({ risk, rate }) {
  if (risk == null) return null;
  const gaining = Number(rate) > 0;
  if (risk >= 0.75 && !gaining) return <Badge className="bg-warn/15 text-warn border-none text-caption">Stalled</Badge>;
  if (risk >= 0.4) return <Badge className="bg-charcoal-surface2 text-muted-2 border-none text-caption">{gaining ? "Slowing" : "Watch"}</Badge>;
  return <Badge className="bg-teal/15 text-teal border-none text-caption">Progressing</Badge>;
}

export function FatigueColor({ score }) {
  const color = score >= 0.75 ? "text-bad" : score >= 0.5 ? "text-warn" : "text-teal";
  return <span className={`font-technical font-extrabold ${color}`}>{(score * 100).toFixed(0)}%</span>;
}

export function SectionHeader({ icon: Icon, title, color = "text-teal" }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <h2 className="text-micro text-ink">{title}</h2>
    </div>
  );
}
