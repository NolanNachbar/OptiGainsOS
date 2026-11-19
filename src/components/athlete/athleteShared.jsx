import { Badge } from "@/components/ui/badge";

// ── helpers ───────────────────────────────────────────────────────────────────

export function StallBadge({ risk }) {
  if (risk == null) return null;
  if (risk >= 0.75) return <Badge className="bg-bad/15 text-bad border-none text-caption">Stalled</Badge>;
  if (risk >= 0.4)  return <Badge className="bg-warn/15 text-warn border-none text-caption">Watch</Badge>;
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
