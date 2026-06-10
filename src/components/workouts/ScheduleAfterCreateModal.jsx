import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { invalidatePrograms } from "@/lib/queryKeys";
import { invalidateSchedule, invalidateWorkouts } from "@/lib/queryKeys";
import { addDays, format, nextMonday, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, CalendarCheck, SkipForward, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";


export default function ScheduleAfterCreateModal({ program, workouts, open, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const defaultStart = format(nextMonday(new Date()), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(defaultStart);
  const [isScheduling, setIsScheduling] = useState(false);

  const cycleLength = useMemo(
    () => (program?.cycle_length || program?.days_per_week || (workouts?.filter(w => w.exercises?.length > 0).length) || 4),
    [program, workouts]
  );

  // Preview: cycle 1 schedule with proper rest-day spreading
  const scheduledWorkouts = useMemo(() => {
    if (!startDate || !workouts) return [];
    return workouts
      .filter((w) => w.exercises?.length > 0)
      .map((w) => ({
        date: format(addDays(parseISO(startDate), w.day_index - 1), "yyyy-MM-dd"),
        title: w.title,
        dayIndex: w.day_index,
      }));
  }, [startDate, workouts, cycleLength]);

  const handleSkip = () => {
    onClose();
    navigate(`/program/${program.id}`);
  };

  const handleSchedule = async () => {
    if (!startDate || !program?.id) return;
    setIsScheduling(true);

    try {
      // Create enrollment — getProgramSchedule will compute all dates from this.
      // We do NOT create duplicate Workout records; that caused dumbbell icons
      // to appear alongside the program BookOpen icons on the schedule.
      await db.entities.ProgramEnrollment.create({
        program_id: program.id,
        created_by: user.id,
        status: "active",
        started_at: startDate,
        start_date: startDate,
        current_day: 1,
        current_day_index: 1,
        current_week: 1,
        current_cycle: 1,
        completed_workouts: [],
        progression_state: {},
        cycle_length: cycleLength,
        num_cycles: program.num_cycles || program.duration_weeks || 4,
      });

      invalidateSchedule(queryClient);
      invalidateWorkouts(queryClient);
      invalidatePrograms(queryClient);
      const numCycles = program.num_cycles || program.duration_weeks || 4;
      toast.success(`Program enrolled! ${numCycles} cycles scheduled starting ${format(parseISO(startDate), "MMM d")}`);
      onClose();
      navigate(`/program/${program.id}`);
    } catch (err) {
      console.error("Schedule error:", err);
      toast.error("Failed to schedule program");
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleSkip()}>
      <DialogContent className="max-w-2xl flex flex-col p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 shrink-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-brand" />
            Schedule Your Program
          </DialogTitle>
        </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <p className="text-sm text-ink-muted">
            <strong>{program?.name}</strong> was created successfully! Want to schedule it on your calendar now?
          </p>

          <div>
            <Label className="flex items-center gap-1.5 mb-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Start Date
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd")}
            />
          </div>

          {/* Calendar Preview */}
          {scheduledWorkouts.length > 0 && (
            <div className="border rounded-lg p-4 bg-charcoal-surface">
              <h3 className="text-sm font-semibold text-ink-muted mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand" />
                Cycle 1 Schedule Preview
              </h3>

              <div className="space-y-2">
                {scheduledWorkouts.map((workout, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-charcoal-surface border border-charcoal-border rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-brand/[5%] text-brand border-brand/20">
                        Day {workout.dayIndex}
                      </Badge>
                      <span className="font-medium text-sm text-ink">{workout.title}</span>
                    </div>
                    <span className="text-xs text-ink-muted">
                      {format(new Date(workout.date), "EEE, MMM d")}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t text-xs text-ink-muted space-y-1">
                <p>Rest days automatically distributed between training days.</p>
                <p>All {program?.num_cycles || program?.duration_weeks || 4} cycles will appear on your schedule.</p>
              </div>
            </div>
          )}

        </div>

        <div className="shrink-0 border-t bg-charcoal-surface  px-6 py-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleSkip}
              className="flex-1"
              disabled={isScheduling}
            >
              <SkipForward className="w-4 h-4 mr-1.5" />
              Skip
            </Button>
            <Button
              onClick={handleSchedule}
              variant="primary"
              className="flex-1 bg-brand"
              disabled={isScheduling}
            >
              <CalendarCheck className="w-4 h-4 mr-1.5" />
              {isScheduling ? "Scheduling..." : "Schedule Program"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
