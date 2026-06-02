import { useMemo } from "react";
import { Link } from "react-router-dom";
import { calculateReadinessScore, getReadinessCategory } from "@/utils/recoveryUtils";
import { Zap, ArrowRight } from "lucide-react";

export default function ReadinessRing({ recoveryMetrics = [], todayCheckin = null }) {
  const latestMetrics = recoveryMetrics[0]; // Metrics are sorted descending by date
  
  const score = useMemo(() => 
    calculateReadinessScore(latestMetrics, todayCheckin),
    [latestMetrics, todayCheckin]
  );

  const category = getReadinessCategory(score);

  const ringSize = 100;
  const strokeWidth = 8;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = score != null ? circumference - (score / 100) * circumference : circumference;

  return (
    <Link to="/recovery" className="block group">
      <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-4 h-full transition-all group-hover:border-brand/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Zap className="w-4 h-4 text-brand" />
            Readiness
          </div>
          <ArrowRight className="w-4 h-4 text-[#555555] group-hover:text-brand transition-colors" />
        </div>

        <div className="flex flex-col items-center">
          <div className="relative mb-3">
            <svg width={ringSize} height={ringSize} className="-rotate-90">
              {/* Background ring */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke="#2a2a2a"
                strokeWidth={strokeWidth}
              />
              {/* Progress ring */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className={`transition-all duration-1000 ease-out ${score >= 85 ? 'text-brand' : score >= 70 ? 'text-[#4ade80]' : score >= 50 ? 'text-[#fbbf24]' : 'text-[#f87171]'}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white leading-none">
                {score ?? "—"}
              </span>
              <span className="text-[10px] text-[#555555] font-bold uppercase tracking-wider mt-0.5">
                Score
              </span>
            </div>
          </div>

          <div className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full ${category.bg} ${category.color}`}>
            {category.label}
          </div>
          
          <p className="text-[10px] text-[#555555] mt-4 text-center leading-relaxed">
            Based on sleep, body battery,<br />and reported energy.
          </p>
        </div>
      </div>
    </Link>
  );
}
