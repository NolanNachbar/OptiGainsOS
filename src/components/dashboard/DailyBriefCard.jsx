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
  { key: "performance",  label: "Performance Coach",  icon: Dumbbell,   color: "text-brand" },
  { key: "endurance",    label: "Endurance Coach",    icon: Activity,   color: "text-blue-400" },
  { key: "nutrition",    label: "Nutrition Coach",    icon: Apple,      color: "text-green-400" },
  { key: "body_comp",    label: "Body Comp Analyst",  icon: Scale,      color: "text-yellow-400" },
  { key: "learning",     label: "Learning Coach",     icon: BookOpen,   color: "text-purple-400" },
  { key: "career",       label: "Career Coach",       icon: Briefcase,  color: "text-indigo-400" },
];

function CoachSection({ coach, content }) {
  const [open, setOpen] = useState(false);
  const Icon = coach.icon;
  const preview = content?.slice(0, 90) + (content?.length > 90 ? "…" : "");

  return (
    <div className="border-b border-charcoal-border last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-charcoal-surface2 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-3.5 h-3.5 shrink-0 ${coach.color}`} />
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{coach.label}</span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-600" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-600" />}
      </button>
      {!open && content && (
        <p className="px-4 pb-3 text-xs text-slate-500 leading-relaxed">{preview}</p>
      )}
      {open && content && (
        <p className="px-4 pb-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{content}</p>
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
      <Card className="bg-charcoal-surface border-charcoal-border shadow-dark-card">
        <CardContent className="py-5 px-4 flex flex-col items-center text-center gap-3">
          <div className="p-3 rounded-full bg-brand/10">
            <Bot className="w-5 h-5 text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">No AI Brief Yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Run the Desktop Agent to generate today's coaching brief. It reads your last 7 days of data and writes the result here.
            </p>
          </div>
          <Link to="/brief-history">
            <Button variant="ghost" size="sm" className="text-slate-500 text-xs gap-1.5 border-charcoal-border">
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
    <Card className="bg-charcoal-surface border-charcoal-border shadow-dark-card">
      <CardHeader className={`pt-4 px-4 ${isCollapsed ? 'pb-4' : 'pb-0'}`}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-brand" />
            AI Daily Brief
          </CardTitle>
          <div className="flex items-center gap-3">
            {generatedAt && (
              <span className="text-[10px] text-slate-500 font-mono">Generated {generatedAt}</span>
            )}
            <Link to="/brief-history">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-slate-500 uppercase tracking-wider hover:text-brand px-2 border-charcoal-border">
                History
              </Button>
            </Link>
            <button
              onClick={toggleCollapse}
              className="p-1 text-slate-500 hover:text-brand transition-colors rounded"
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </CardHeader>

      {!isCollapsed && (
        <>
          {json.insight && (
            <div className="mx-4 mt-3 mb-1 flex items-start gap-2.5 p-3 rounded-lg bg-brand/[5%] border border-brand/10">
              <Lightbulb className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
              <p className="text-xs text-slate-300 leading-relaxed italic">{json.insight}</p>
            </div>
          )}

          <CardContent className="p-0 mt-2">
            {COACHES.map(coach => (
              <CoachSection key={coach.key} coach={coach} content={json[coach.key]} />
            ))}
          </CardContent>

          {approxCost && (
            <div className="px-4 py-2 border-t border-charcoal-border flex items-center gap-1.5 font-mono">
              <Bot className="w-3 h-3 text-slate-600" />
              <span className="text-[9px] text-slate-600">
                {brief.model_used || "claude-haiku-4-5"} · {totalTokens.toLocaleString()} tokens · {approxCost}
              </span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
