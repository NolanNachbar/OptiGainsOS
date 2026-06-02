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
    <div className="border-b border-[#2a2a2a] last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#222] transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <Icon className={`w-3.5 h-3.5 shrink-0 ${coach.color}`} />
          <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">{coach.label}</span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-[#555]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#555]" />}
      </button>
      {!open && content && (
        <p className="px-4 pb-3 text-xs text-[#555555] leading-relaxed">{preview}</p>
      )}
      {open && content && (
        <p className="px-4 pb-4 text-sm text-[#e0e0e0] leading-relaxed whitespace-pre-wrap">{content}</p>
      )}
    </div>
  );
}

export default function DailyBriefCard({ today }) {
  const { user } = useAuth();
  const todayStr = today || getTodayString();

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
    return (
      <Card className="bg-[#1a1a1a] border-[#2a2a2a] mb-6">
        <CardContent className="py-6 px-5 flex flex-col items-center text-center gap-3">
          <div className="p-3 rounded-full bg-brand/10">
            <Bot className="w-5 h-5 text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">No AI Brief Yet</p>
            <p className="text-xs text-[#555555] mt-1 max-w-xs">
              Run the Desktop Agent to generate today's coaching brief. It reads your last 7 days of data and writes the result here.
            </p>
          </div>
          <Link to="/brief-history">
            <Button variant="ghost" size="sm" className="text-[#555555] text-xs gap-1.5">
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
    <Card className="bg-[#1a1a1a] border-[#2a2a2a] mb-6">
      <CardHeader className="pb-0 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-brand" />
            AI Daily Brief
          </CardTitle>
          <div className="flex items-center gap-3">
            {generatedAt && (
              <span className="text-[10px] text-[#555555]">Generated {generatedAt}</span>
            )}
            <Link to="/brief-history">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-[#555555] uppercase tracking-wider hover:text-brand px-2">
                History
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>

      {json.insight && (
        <div className="mx-5 mt-4 mb-2 flex items-start gap-2.5 p-3 rounded-lg bg-brand/[5%] border border-brand/10">
          <Lightbulb className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
          <p className="text-xs text-[#e0e0e0] leading-relaxed italic">{json.insight}</p>
        </div>
      )}

      <CardContent className="p-0 mt-3">
        {COACHES.map(coach => (
          <CoachSection key={coach.key} coach={coach} content={json[coach.key]} />
        ))}
      </CardContent>

      {approxCost && (
        <div className="px-5 py-2.5 border-t border-[#2a2a2a] flex items-center gap-1.5">
          <Coins className="w-3 h-3 text-[#555555]" />
          <span className="text-[10px] text-[#555555]">
            {brief.model_used || "claude-haiku-4-5"} · {totalTokens.toLocaleString()} tokens · {approxCost}
          </span>
        </div>
      )}
    </Card>
  );
}
