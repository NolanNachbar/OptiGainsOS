// OverrideProgramWorkout — swap a programmed day for something else.
//
// The engine plans the week; this is the escape hatch for the days it got wrong
// or that he just doesn't want. Pick anything out of the library, or build a
// custom one, and the rest of the week re-plans around the swap while the day
// he chose is left alone (see useOverrideProgramWorkout for why locked exists).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Repeat2, Search, Plus } from "lucide-react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useOverrideProgramWorkout } from "@/hooks/useOverrideProgramWorkout";

export default function OverrideProgramWorkout({ programWorkout, onDone }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const override = useOverrideProgramWorkout();

  const { data: library = [], isLoading } = useQuery({
    queryKey: ["workoutLibrary", user?.id],
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user && open,
  });

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = library.filter((w) => (w.exercises || []).length > 0);
    if (!needle) return rows.slice(0, 60);
    return rows.filter((w) => (w.title || "").toLowerCase().includes(needle)).slice(0, 60);
  }, [library, q]);

  if (!programWorkout?.id) return null;

  const pick = async (workout) => {
    await override.mutateAsync({
      programWorkout,
      replacement: workout,
      source: workout.id,
    });
    setOpen(false);
    onDone?.();
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Repeat2 className="w-4 h-4" />
        Override
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Swap this day</DialogTitle>
            <DialogDescription>
              {programWorkout.scheduled_date} is programmed as {programWorkout.title}.
              Pick what you're doing instead; the rest of the week re-plans around it.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the library"
              className="pl-9"
            />
          </div>

          <div className="max-h-[46vh] overflow-y-auto -mx-1 px-1 mt-2 space-y-1">
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-ink-muted py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading library…
              </div>
            )}
            {!isLoading && matches.length === 0 && (
              <p className="text-sm text-ink-muted py-4">Nothing in the library matches that.</p>
            )}
            {matches.map((w) => (
              <button
                key={w.id}
                type="button"
                disabled={override.isPending}
                onClick={() => pick(w)}
                className="w-full text-left rounded-lg border border-charcoal-border px-3 py-2 hover:border-brand/40 transition-colors disabled:opacity-60"
              >
                <span className="block font-semibold text-sm">{w.title}</span>
                <span className="block text-[11px] text-ink-muted">
                  {(w.exercises || []).length} exercises
                  {w.folder ? ` · ${w.folder}` : ""}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {/* A custom workout is built in the normal builder and then applied,
                rather than a second inline editor that would drift from it. */}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                navigate(`/create-workout?override=${programWorkout.id}`)
              }
            >
              <Plus className="w-4 h-4" />
              Build a custom one
            </Button>
            {override.isPending && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Re-planning the week…
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
