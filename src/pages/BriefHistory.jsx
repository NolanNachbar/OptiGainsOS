import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import {
  Dumbbell, Activity, Apple, Scale, BookOpen, Briefcase,
  Lightbulb, Bot, ChevronLeft, Coins,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const COACHES = [
  { key: "performance",  label: "Performance",  icon: Dumbbell,   color: "text-brand" },
  { key: "endurance",    label: "Endurance",    icon: Activity,   color: "text-blue-400" },
  { key: "nutrition",    label: "Nutrition",    icon: Apple,      color: "text-green-400" },
  { key: "body_comp",    label: "Body Comp",    icon: Scale,      color: "text-yellow-400" },
  { key: "learning",     label: "Learning",     icon: BookOpen,   color: "text-purple-400" },
  { key: "career",       label: "Career",       icon: Briefcase,  color: "text-indigo-400" },
];

function BriefEntry({ brief }) {
  const json = brief.brief_json || {};
  const date = format(parseISO(brief.date), "EEEE, MMMM d");
  const totalTokens = (brief.input_tokens || 0) + (brief.output_tokens || 0);
  const cachedTokens = brief.cache_read_tokens || 0;
  const approxCost = totalTokens > 0
    ? `~$${((totalTokens * 0.00000025) + (cachedTokens * 0.000000025)).toFixed(4)}`
    : null;

  return (
    <div className="rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden mb-4">
      <div className="px-5 py-3.5 border-b border-[#2a2a2a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-brand" />
          <span className="text-sm font-bold text-white">{date}</span>
        </div>
        {approxCost && (
          <div className="flex items-center gap-1.5">
            <Coins className="w-3 h-3 text-[#555555]" />
            <span className="text-[10px] text-[#555555]">{approxCost}</span>
          </div>
        )}
      </div>

      {json.insight && (
        <div className="mx-5 mt-4 flex items-start gap-2.5 p-3 rounded-lg bg-brand/[5%] border border-brand/10">
          <Lightbulb className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
          <p className="text-xs text-[#e0e0e0] leading-relaxed italic">{json.insight}</p>
        </div>
      )}

      <div className="px-5 py-4 space-y-4">
        {COACHES.filter(c => json[c.key]).map(coach => {
          const Icon = coach.icon;
          return (
            <div key={coach.key}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={`w-3.5 h-3.5 ${coach.color}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#555555]">{coach.label}</span>
              </div>
              <p className="text-sm text-[#a0a0a0] leading-relaxed whitespace-pre-wrap">{json[coach.key]}</p>
            </div>
          );
        })}

        {json.today_actions?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#555555] mb-2">Actions</p>
            <ul className="space-y-1">
              {json.today_actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#a0a0a0]">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#333] shrink-0" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BriefHistory() {
  const { user } = useAuth();

  const { data: briefs = [], isLoading } = useQuery({
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
    <div className="px-4 py-6 md:px-8 bg-[#121212] min-h-screen">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/dashboard" className="text-[#555555] hover:text-brand transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-brand" /> Brief History
            </h1>
            <p className="text-xs text-[#555555] mt-0.5">Last 30 AI-generated daily briefs</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 rounded-2xl bg-[#1a1a1a] animate-pulse" />
            ))}
          </div>
        ) : briefs.length === 0 ? (
          <div className="py-20 text-center">
            <Bot className="w-10 h-10 text-[#2a2a2a] mx-auto mb-3" />
            <p className="text-sm text-[#555555]">No briefs generated yet.</p>
            <p className="text-xs text-[#333] mt-1">Run your Desktop Agent to generate the first one.</p>
          </div>
        ) : (
          briefs.map(brief => <BriefEntry key={brief.id} brief={brief} />)
        )}
      </div>
    </div>
  );
}
