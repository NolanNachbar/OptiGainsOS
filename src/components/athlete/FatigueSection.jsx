import { Badge } from "@/components/ui/badge";
import { MetricTile } from "@/components/ui/system";
import { TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import InfoNote from "./InfoNote";
import { SummaryStrip } from "./SummaryStrip";

export default function FatigueSection({ data }) {
  if (!data) return null;

  let tsbColor = data.tsb > 5 ? "text-teal" : data.tsb > -5 ? "text-muted-2" : "text-bad";
  let tsbIcon  = data.tsb > 5 ? TrendingUp : data.tsb > -5 ? CheckCircle2 : TrendingDown;
  if (data.tsb == null) { tsbColor = "text-muted-2"; tsbIcon = null; }
  const TSBIcon  = tsbIcon;

  return (
    <div className="space-y-4">
      {/* TSB visual */}
      <div className="flex items-center gap-4">
        {TSBIcon && <TSBIcon className={`w-6 h-6 ${tsbColor}`} />}
        <div>
          {/* Neutral value with the severity carried by the icon — matches the
              SummaryStrip TSB tile (MetricTile renders its value neutral), so
              the same TSB reads consistently in both surfaces. */}
          <div className="hero-metric text-3xl text-ink">{data.tsb > 0 ? "+" : ""}{data.tsb?.toFixed(1)}</div>
          <div className="text-micro text-ink-muted">Training Stress Balance</div>
        </div>
        <Badge className="ml-auto bg-charcoal-surface2 rounded-control text-muted-2 border-none capitalize text-xs">
          {(data.interpretation || "").replace(/_/g, " ")}
        </Badge>
      </div>

      {/* ATL / CTL / CNS / ACWR — 2-up at 390px (4 narrow columns clipped the
          labels on a phone), widening to the 4-up row at sm+. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "ATL", value: data.atl?.toFixed(1), desc: "7d acute load", hue: "var(--hue-violet)", warn: data.atl > 80 },
          { label: "CTL", value: data.ctl?.toFixed(1), desc: "42d chronic load", hue: "var(--hue-teal)" },
          { label: "CNS", value: `${((data.cns_fatigue || 0) * 100).toFixed(0)}%`, desc: "CNS fatigue", hue: "var(--hue-violet)", warn: data.cns_fatigue > 0.7 },
          { label: "ACWR", value: data.acwr?.toFixed(2) ?? "--", desc: "acute:chronic", hue: "var(--hue-teal)", warn: data.acwr > 1.5 },
        ].map(({ label, value, desc, hue, warn }) => (
          <div key={label} className="bg-charcoal-surface2 rounded-control px-3 py-2 text-center">
            <div className="text-micro text-ink-muted flex items-center justify-center gap-1.5">
              <i className="w-[5px] h-[5px] rounded-full shrink-0" style={{ background: hue }} />
              {label}
            </div>
            <div className={`font-technical text-sm font-extrabold mt-0.5 ${warn ? "text-warn" : "text-ink"}`}>{value}</div>
            <div className="text-caption font-semibold text-muted-2 mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      <InfoNote label="What is TSB?">
        TSB = CTL − ATL. Positive = fresh (deload/peak). Negative = fatigued (accumulated load). Target −5 to +10 for peak performance.
      </InfoNote>
    </div>
  );
}

// ── Endurance section ─────────────────────────────────────────────────────────
