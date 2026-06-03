import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dumbbell, TrendingUp, Ban, ChevronDown, ChevronRight, CalendarPlus } from "lucide-react";
import { getTodayString } from "@/utils/dateUtils";

export default function NextWorkoutCard({ today }) {
  const { user } = useAuth();
  const todayStr = today || getTodayString();
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: brief, isLoading } = useQuery({
    queryKey: ["daily-brief", todayStr, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_briefs")
        .select("brief_json")
        .eq("created_by", user.id)
        .eq("date", todayStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  const nw = brief?.brief_json?.next_workout;

  const applyMutation = useMutation({
    mutationFn: async () => {
      const workout = await db.entities.Workout.create({
        title: nw.session_type,
        description: nw.rationale || "",
        focus: "strength",
        duration_minutes: 45,
        exercises: (nw.exercises || []).map((ex) => ({
          name: ex.name,
          sets: ex.sets || 3,
          reps: String(ex.reps || "10"),
          rest_seconds: 90,
          notes: ex.notes || ex.load_note || "",
          pattern: "",
        })),
        created_by: user.id,
      });
      await db.entities.WorkoutSchedule.create({
        workout_id: workout.id,
        scheduled_date: todayStr,
        time_of_day: "anytime",
        completed: false,
        created_by: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      setConfirmOpen(false);
    },
  });

  if (isLoading || !nw) return null;

  return (
    <>
      <Card className="bg-[#1a1a1a] border-[#2a2a2a] mb-6">
        <CardHeader
          className="pb-2 pt-4 px-5 cursor-pointer select-none"
          onClick={() => setExpanded((v) => !v)}
        >
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#555555]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#555555]" />
            )}
            <Dumbbell className="w-4 h-4 text-brand" />
            AI Suggested Workout — <span className="text-brand">{nw.session_type}</span>
          </CardTitle>
          {!expanded && nw.rationale && (
            <p className="text-xs text-[#555555] mt-1 line-clamp-1 pl-6">{nw.rationale}</p>
          )}
        </CardHeader>

        {expanded && (
          <CardContent className="px-5 pb-4 space-y-3">
            {nw.rationale && (
              <p className="text-xs text-[#a0a0a0]">{nw.rationale}</p>
            )}

            {(nw.exercises || []).length > 0 && (
              <div className="space-y-1.5">
                {nw.exercises.map((ex, i) => (
                  <div key={i} className="flex items-start justify-between text-sm">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-brand/20 text-brand text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-white">{ex.name}</span>
                        {ex.notes && (
                          <p className="text-xs text-[#555555] mt-0.5 italic">{ex.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-xs text-[#a0a0a0]">
                        {ex.sets}×{ex.reps}
                      </span>
                      {ex.load_note && (
                        <p className="text-[10px] text-brand">{ex.load_note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(nw.volume_gaps_addressed || []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#2a2a2a]">
                <TrendingUp className="w-3.5 h-3.5 text-brand shrink-0" />
                <span className="text-[10px] text-[#555555] uppercase tracking-wider">Addresses:</span>
                {nw.volume_gaps_addressed.map((m, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] border-brand/30 text-brand">
                    {m}
                  </Badge>
                ))}
              </div>
            )}

            {(nw.muscles_to_avoid || []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span className="text-[10px] text-[#555555] uppercase tracking-wider">Avoid:</span>
                {nw.muscles_to_avoid.map((m, i) => (
                  <span key={i} className="text-[10px] text-red-400">{m}</span>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-[#2a2a2a]">
              <Button
                size="sm"
                variant="outline"
                className="border-brand/40 text-brand hover:bg-brand/10 hover:text-brand text-xs gap-1.5"
                onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                Apply to Schedule
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Apply AI Suggestion?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#a0a0a0]">
            This will create and schedule a <span className="text-white font-medium">{nw.session_type}</span> workout
            for today. Your existing scheduled workouts are not affected unless you confirm.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-[#a0a0a0]"
              onClick={() => setConfirmOpen(false)}
            >
              Keep My Schedule
            </Button>
            <Button
              size="sm"
              className="bg-brand text-black hover:bg-brand/80"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? "Applying…" : "Apply"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
