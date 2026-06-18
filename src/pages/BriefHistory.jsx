import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Dumbbell, Activity, Apple, Scale, BookOpen, Briefcase,
  Lightbulb, Bot, ChevronLeft, ChevronDown, Coins,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { estimateBriefCost } from "@/utils/briefCost";

const COACHES = [
  { key: "performance",  label: "Performance",  icon: Dumbbell,  hue: "!text-teal bg-teal/10" },
  { key: "endurance",    label: "Endurance",    icon: Activity,  hue: "!text-carb bg-carb/10" },
  { key: "nutrition",    label: "Nutrition",    icon: Apple,     hue: "!text-leaf bg-leaf/10" },
  { key: "body_comp",    label: "Body Comp",    icon: Scale,     hue: "!text-violet bg-violet/10" },
  { key: "learning",     label: "Learning",     icon: BookOpen,  hue: "!text-teal bg-teal/10" },
  { key: "career",       label: "Career",       icon: Briefcase, hue: "!text-gold bg-gold/10" },
];

/** Coach-persona tag — tiny uppercase hue-coded chip. */
function CoachTag({ children, hue = "!text-teal bg-teal/10" }) {
  return (
    <span className={`section-label ${hue} rounded-md px-2 py-0.5 whitespace-nowrap shrink-0`}>
      {children}
    </span>
  );
}

const RISE_STAGGER = ["rise-in", "rise-in-2", "rise-in-3"];

function BriefEntry({ brief, index = 0 }) {
  const json = brief.brief_json || {};
  const date = format(parseISO(brief.date), "EEEE, MMMM d");
  const approxCost = estimateBriefCost(brief);
  const hasCoachContent = COACHES.some((c) => json[c.key]);
  const hasContent = !!json.insight || hasCoachContent || json.today_actions?.length > 0;
  const riseClass = index < RISE_STAGGER.length ? RISE_STAGGER[index] : "";

  const [open, setOpen] = useState(index === 0);

  return (
    <div className={`glass overflow-hidden mb-4 ${riseClass}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`w-full px-5 py-3.5 flex items-center justify-between gap-2 text-left min-h-[44px] transition-colors hover:bg-white/[0.02] ${open ? "border-b hairline" : ""}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 text-teal shrink-0" />
          <span className="text-sm font-extrabold text-ink truncate">{date}</span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {approxCost && (
            <span className="flex items-center gap-1.5">
              <Coins className="w-3 h-3 text-muted-2" />
              <span className="font-technical text-xs font-semibold text-muted-2">{approxCost}</span>
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-2 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </div>
      </button>

      {!open ? (
        <div className="px-5 py-3.5">
          {json.insight ? (
            <p className="text-sm font-semibold text-secondary leading-relaxed line-clamp-2">{json.insight}</p>
          ) : (
            <p className="text-xs font-semibold text-faint italic">
              {hasContent ? "Tap to view coach notes." : "Brief generated, no narrative content."}
            </p>
          )}
        </div>
      ) : (
        <>
          {json.insight && (
            <div className="mx-5 mt-4 flex items-start gap-2.5 p-3 glass-inset">
              <Lightbulb className="w-3.5 h-3.5 text-teal shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-ink leading-relaxed">{json.insight}</p>
            </div>
          )}

          <div className="px-5 py-4 space-y-4">
            {COACHES.filter(c => json[c.key]).map(coach => (
              <div key={coach.key} className="flex items-start gap-2.5">
                <CoachTag hue={coach.hue}>{coach.label}</CoachTag>
                <p className="text-sm font-semibold text-secondary leading-relaxed whitespace-pre-wrap">{json[coach.key]}</p>
              </div>
            ))}

            {json.today_actions?.length > 0 && (
              <div>
                <p className="section-label mb-2">Actions</p>
                <ul className="space-y-1">
                  {json.today_actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm font-semibold text-secondary">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal/60 shrink-0" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!hasContent && (
              <p className="text-xs font-semibold text-faint italic">
                Brief generated, no narrative content.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const PAGE_SIZE = 7;

export default function BriefHistory() {
  const { user } = useAuth();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: briefs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["daily-briefs-history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_briefs")
        .select("*")
        .eq("created_by", user.id)
        .order("date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="px-4 py-6 md:px-8 bg-charcoal min-h-screen">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8 rise-in">
          <Link to="/dashboard" aria-label="Back to dashboard" className="inline-flex p-3 -ml-3 text-muted-2 hover:text-ink transition-colors">
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="type-display text-[22px] flex items-center gap-2">
              <Bot className="w-5 h-5 text-teal" /> Brief History
            </h1>
            <p className="text-xs font-semibold text-muted-2 mt-0.5">Last 30 AI-generated daily briefs</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 glass animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-8 text-center glass-inset">
            <p className="text-sm font-semibold text-muted-2">Couldn&apos;t load briefs.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : briefs.length === 0 ? (
          <div className="py-20 text-center">
            <Bot className="w-10 h-10 text-faint mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted-2">No briefs generated yet.</p>
            <p className="text-xs font-semibold text-faint mt-1">Run your Desktop Agent to generate the first one.</p>
            <Button asChild variant="outline" size="sm" className="mt-4 min-h-[44px]">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        ) : (
          <>
            {briefs.slice(0, visibleCount).map((brief, i) => (
              <BriefEntry key={brief.id} brief={brief} index={i} />
            ))}
            {briefs.length > visibleCount && (
              <Button
                variant="outline"
                size="sm"
                className="w-full min-h-[44px] mt-1"
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              >
                Show more ({briefs.length - visibleCount})
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
