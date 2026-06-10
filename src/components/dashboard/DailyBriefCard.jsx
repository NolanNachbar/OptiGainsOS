import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dumbbell, Activity, Apple, Scale, BookOpen, Briefcase,
  Lightbulb, ChevronDown, ChevronUp, Bot, History, Coins,
} from "lucide-react";
import { Link } from "react-router-dom";
import { getTodayString } from "@/utils/dateUtils";
import { format, parseISO } from "date-fns";

const COACHES = [
  { key: "performance",  label: "Performance",  icon: Dumbbell },
  { key: "endurance",    label: "Endurance",    icon: Activity },
  { key: "nutrition",    label: "Nutrition",    icon: Apple },
  { key: "body_comp",    label: "Body Comp",    icon: Scale },
  { key: "learning",     label: "Learning",     icon: BookOpen },
  { key: "career",       label: "Career",       icon: Briefcase },
];

/** Coach-persona tag — tiny uppercase teal chip (the an-coach <b>). */
function CoachTag({ children }) {
  return (
    <span className="text-[9px] font-extrabold tracking-[0.08em] uppercase text-teal bg-[rgba(94,220,210,0.10)] rounded-[7px] px-[7px] py-[3px] whitespace-nowrap shrink-0">
      {children}
    </span>
  );
}

function CoachSection({ coach, content }) {
  const [open, setOpen] = useState(false);
  const preview = content?.slice(0, 90) + (content?.length > 90 ? "…" : "");

  return (
    <div className="border-b hairline last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <CoachTag>{coach.label}</CoachTag>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-faint" /> : <ChevronDown className="w-3.5 h-3.5 text-faint" />}
      </button>
      {!open && content && (
        <p className="px-4 pb-3 text-[11.5px] font-semibold text-muted-2 leading-relaxed">{preview}</p>
      )}
      {open && content && (
        <p className="px-4 pb-4 text-sm font-semibold text-secondary leading-relaxed whitespace-pre-wrap">{content}</p>
      )}
    </div>
  );
}

export default function DailyBriefCard({ today, hideWhenEmpty = false }) {
  const { user } = useAuth();
  const todayStr = today || getTodayString();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try { return localStorage.getItem("ai_brief_collapsed") === "true"; } catch { return false; }
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
            <Button variant="ghost" size="sm" className="text-muted-2 text-xs gap-1.5">
              <History className="w-3.5 h-3.5" /> View Past Briefs
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const json = brief.brief_json || {};
  const generatedAt = brief.generated_at ? format(parseISO(brief.generated_at), "h:mm a") : null;
  const totalTokens = (brief.input_tokens || 0) + (brief.output_tokens || 0);
  const cachedTokens = brief.cache_read_tokens || 0;
  const approxCost = totalTokens > 0
    ? `~$${((totalTokens * 0.00000025) + (cachedTokens * 0.000000025)).toFixed(4)}`
    : null;

  return (
    <Card className="glass glass-interactive">
      <CardHeader className={`pt-4 px-4 ${isCollapsed ? 'pb-4' : 'pb-0'}`}>
        <div className="flex items-center justify-between">
          <CardTitle className="section-label !text-ink flex items-center gap-2 normal-case">
            <Bot className="w-4 h-4 text-teal" />
            AI Daily Brief
          </CardTitle>
          <div className="flex items-center gap-3">
            {generatedAt && (
              <span className="font-technical text-[10px] font-semibold text-faint">Generated {generatedAt}</span>
            )}
            <Link to="/brief-history">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-2 uppercase tracking-wider hover:text-ink px-2">
                History
              </Button>
            </Link>
            <button
              onClick={toggleCollapse}
              className="p-1 text-muted-2 hover:text-ink transition-colors rounded"
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
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

          <div className="mt-2">
            {COACHES.map(coach => (
              <CoachSection key={coach.key} coach={coach} content={json[coach.key]} />
            ))}
          </div>

          {approxCost && (
            <div className="px-4 py-2 border-t hairline flex items-center gap-1.5">
              <Bot className="w-3 h-3 text-faint" />
              <span className="font-technical text-[9px] font-semibold text-faint">
                {brief.model_used || "claude-haiku-4-5"} · {totalTokens.toLocaleString()} tokens · {approxCost}
              </span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
