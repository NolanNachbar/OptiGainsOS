import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Dumbbell, Activity, Apple, Scale, BookOpen, Briefcase,
  Lightbulb, Bot, ChevronLeft, Coins,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const COACHES = [
  { key: "performance",  label: "Performance",  icon: Dumbbell },
  { key: "endurance",    label: "Endurance",    icon: Activity },
  { key: "nutrition",    label: "Nutrition",    icon: Apple },
  { key: "body_comp",    label: "Body Comp",    icon: Scale },
  { key: "learning",     label: "Learning",     icon: BookOpen },
  { key: "career",       label: "Career",       icon: Briefcase },
];

/** Coach-persona tag — tiny uppercase teal chip. */
function CoachTag({ children }) {
  return (
    <span className="text-[9px] font-extrabold tracking-[0.08em] uppercase text-teal bg-teal/10 rounded-[7px] px-[7px] py-[3px] whitespace-nowrap shrink-0">
      {children}
    </span>
  );
}

function BriefEntry({ brief }) {
  const json = brief.brief_json || {};
  const date = format(parseISO(brief.date), "EEEE, MMMM d");
  const totalTokens = (brief.input_tokens || 0) + (brief.output_tokens || 0);
  const cachedTokens = brief.cache_read_tokens || 0;
  const approxCost = totalTokens > 0
    ? `~$${(((totalTokens - cachedTokens) * 0.00000025) + (cachedTokens * 0.000000025)).toFixed(4)}`
    : null;

  return (
    <div className="glass overflow-hidden mb-4 rise-in">
      <div className="px-5 py-3.5 border-b hairline flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-teal" />
          <span className="text-sm font-extrabold text-ink">{date}</span>
        </div>
        {approxCost && (
          <div className="flex items-center gap-1.5">
            <Coins className="w-3 h-3 text-muted-2" />
            <span className="font-technical text-[10px] font-semibold text-muted-2">{approxCost}</span>
          </div>
        )}
      </div>

      {json.insight && (
        <div className="mx-5 mt-4 flex items-start gap-2.5 p-3 glass-inset">
          <Lightbulb className="w-3.5 h-3.5 text-teal shrink-0 mt-0.5" />
          <p className="text-[13px] font-semibold text-ink leading-[1.55]">{json.insight}</p>
        </div>
      )}

      <div className="px-5 py-4 space-y-4">
        {COACHES.filter(c => json[c.key]).map(coach => (
          <div key={coach.key} className="flex items-start gap-2.5">
            <CoachTag>{coach.label}</CoachTag>
            <p className="text-[11.5px] font-semibold text-muted-2 leading-[1.45] whitespace-pre-wrap">{json[coach.key]}</p>
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
      </div>
    </div>
  );
}

export default function BriefHistory() {
  const { user } = useAuth();

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
          <Link to="/dashboard" className="inline-flex p-3 -ml-3 text-muted-2 hover:text-ink transition-colors">
            <ChevronLeft className="w-5 h-5" />
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
              <div key={i} className="h-32 glass animate-pulse" />
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
          </div>
        ) : (
          briefs.map(brief => <BriefEntry key={brief.id} brief={brief} />)
        )}
      </div>
    </div>
  );
}
