import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dumbbell, Activity, Apple, Scale, BookOpen,
  Lightbulb, ChevronDown, ChevronUp, Bot, History,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getTodayString } from "@/utils/dateUtils";
import { format, parseISO } from "date-fns";

// Career was cut from the IA — its coach is dropped here so the brief never
// renders an orphaned section.
const COACHES = [
  { key: "performance",  label: "Performance",  icon: Dumbbell },
  { key: "endurance",    label: "Endurance",    icon: Activity },
  { key: "nutrition",    label: "Nutrition",    icon: Apple },
  { key: "body_comp",    label: "Body Comp",    icon: Scale },
  { key: "learning",     label: "Learning",     icon: BookOpen },
];

/** Coach-persona tag — tiny uppercase chip. Teal ONLY when the section is open
 *  (the active datum); collapsed it rests as neutral ink so teal stays a state
 *  signal, not a per-row decoration on five identical chips. */
function CoachTag({ children, active = false }) {
  return (
    <span
      className={`text-[10px] font-extrabold tracking-wider uppercase rounded-sm px-2 py-1 whitespace-nowrap shrink-0 transition-colors duration-200 [transition-timing-function:var(--ease)] ${
        active ? "text-teal bg-teal/10" : "text-secondary"
      }`}
    >
      {children}
    </span>
  );
}

function CoachSection({ coach, content, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = coach.icon;

  return (
    <div className="border-b hairline last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 min-h-[44px] px-4 py-3 tile-interactive text-left"
      >
        {Icon && (
          <span className="shrink-0 grid place-items-center w-7 h-7 rounded-lg glass-inset">
            <Icon className="w-4 h-4 text-secondary" aria-hidden="true" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <CoachTag active={open}>{coach.label}</CoachTag>
          {!open && content && (
            <p className="text-[12px] font-semibold text-muted-2 truncate mt-1">{content}</p>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-faint shrink-0 transition-transform duration-200 [transition-timing-function:var(--ease)] ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {content && (
        <div
          className="grid overflow-hidden"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            opacity: open ? 1 : 0,
            transition: "grid-template-rows 220ms var(--ease), opacity 220ms var(--ease)",
          }}
        >
          <div className="min-h-0">
            <p className="px-4 pb-3 pt-0 text-sm text-ink leading-[1.55] whitespace-pre-wrap">{content}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DailyBriefCard({ today, hideWhenEmpty = false, defaultCollapsed = false }) {
  const { user } = useAuth();
  const todayStr = today || getTodayString();
  // Honor a saved preference; otherwise fall back to the caller's default
  // (the home keeps the brief collapsed so it never dominates the page height,
  //  while Analyze leaves it open since the brief is that page's main content).
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem("ai_brief_collapsed");
      return saved === null ? defaultCollapsed : saved === "true";
    } catch { return defaultCollapsed; }
  });

  const toggleCollapse = () => {
    const nextVal = !isCollapsed;
    setIsCollapsed(nextVal);
    try { localStorage.setItem("ai_brief_collapsed", String(nextVal)); } catch {}
  };

  const { data: brief, isLoading } = useQuery({
    queryKey: ["daily-brief", todayStr, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_briefs")
        .select("*")
        .eq("created_by", user.id)
        .eq("date", todayStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return null;

  if (!brief) {
    if (hideWhenEmpty) return null;
    return (
      <Card className="glass">
        <CardContent className="pt-5 pb-5 px-4 flex flex-col items-center text-center gap-3">
          <div className="p-3 rounded-full bg-teal/10">
            <Bot className="w-5 h-5 text-teal" />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">No AI Brief Yet</p>
            <p className="text-xs font-semibold text-muted-2 mt-1 max-w-xs">
              Run the Desktop Agent to generate today's coaching brief. It reads your last 7 days of data and writes the result here.
            </p>
          </div>
          <Link to="/brief-history">
            <Button variant="dim" size="sm" className="text-muted-2 text-xs gap-1.5">
              <History className="w-3.5 h-3.5" /> View Past Briefs
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const json = brief.brief_json || {};
  const generatedAt = brief.generated_at ? format(parseISO(brief.generated_at), "h:mm a") : null;

  return (
    <Card className="glass glass-interactive">
      <CardHeader className={`pt-4 px-4 ${isCollapsed ? 'pb-4' : 'pb-0'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0">
            <CardTitle className="section-label !text-ink flex items-center gap-2 min-w-0">
              <Bot className="w-4 h-4 text-teal shrink-0" />
              <span className="truncate">AI Daily Brief</span>
            </CardTitle>
            {generatedAt && (
              <span className="sm:hidden font-technical tabular-nums text-[10px] font-semibold text-faint whitespace-nowrap mt-0.5 pl-6">Generated {generatedAt}</span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {generatedAt && (
              <span className="hidden sm:inline font-technical tabular-nums text-[10px] font-semibold text-faint whitespace-nowrap">Generated {generatedAt}</span>
            )}
            <Link to="/brief-history">
              <Button variant="dim" size="sm" className="min-h-[44px] text-xs font-semibold text-secondary hover:text-ink gap-1.5 px-3">
                <History className="w-3.5 h-3.5" /> History
              </Button>
            </Link>
            <button
              onClick={toggleCollapse}
              aria-label={isCollapsed ? "Expand brief" : "Collapse brief"}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1 transition-colors duration-200 [transition-timing-function:var(--ease)] rounded group"
            >
              <span className="grid place-items-center w-7 h-7 rounded-full glass-inset text-muted-2 group-hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]">
                {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </span>
            </button>
          </div>
        </div>
      </CardHeader>

      {!isCollapsed && (
        <>
          {json.insight && (
            <div className="mx-4 mt-3 mb-1 flex items-start gap-2.5 p-3 glass-inset">
              <Lightbulb className="w-3.5 h-3.5 text-teal shrink-0 mt-0.5" />
              <p className="text-[13px] font-semibold text-ink leading-[1.55]">{json.insight}</p>
            </div>
          )}

          <div className="mt-2 mb-1">
            {(() => {
              // Open only the FIRST coach section that has content; the rest stay
              // collapsed so the brief lands within one viewport instead of a tall
              // stack of five auto-expanded sections. Only render coaches that have
              // content — a section with no body is a dead toggle (chevron flips,
              // nothing expands).
              const withContent = COACHES.filter(c => json[c.key]);
              return withContent.map((coach, i) => (
                <CoachSection
                  key={coach.key}
                  coach={coach}
                  content={json[coach.key]}
                  defaultOpen={i === 0}
                />
              ));
            })()}
          </div>
        </>
      )}
    </Card>
  );
}
