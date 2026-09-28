// WeekTemplateSwap: "run one of my saved splits this week instead." Sits on the
// Schedule tab under the week nav. The engine's plan stays the default; this is
// the week-sized version of the per-day override (see useWeekTemplate).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { LayoutTemplate, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  templateFolders, planTemplateWeek, useApplyWeekTemplate, useClearWeekTemplate, TEMPLATE_SOURCE_PREFIX,
} from "@/hooks/useWeekTemplate";

const NO_ROWS = [];
const NO_DATES = new Set();

export default function WeekTemplateSwap({ programId, weekDates, today }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState(null);
  const apply = useApplyWeekTemplate();
  const clear = useClearWeekTemplate();
  const first = weekDates[0];
  const last = weekDates[weekDates.length - 1];
  const weekOver = last < today;

  // This week's planned rows plus the dates he has already trained or started,
  // which a template never rewrites.
  const { data } = useQuery({
    queryKey: ["weekTemplateRows", user?.id, programId, first],
    queryFn: async () => {
      const [rowsRes, logsRes, sessRes] = await Promise.all([
        supabase.from("program_workouts")
          .select("id, scheduled_date, title, focus, exercises, duration_minutes, locked, override_source")
          .eq("created_by", user.id).eq("program_id", programId)
          .gte("scheduled_date", first).lte("scheduled_date", last),
        supabase.from("workout_logs").select("log_date")
          .eq("created_by", user.id).gte("log_date", first).lte("log_date", last),
        supabase.from("workout_sessions").select("started_at")
          .eq("created_by", user.id).gte("started_at", first),
      ]);
      for (const r of [rowsRes, logsRes, sessRes]) if (r.error) throw r.error;
      const touched = new Set([
        ...(logsRes.data || []).map((r) => String(r.log_date).slice(0, 10)),
        ...(sessRes.data || []).map((r) => String(r.started_at).slice(0, 10)),
      ]);
      return { rows: rowsRes.data || [], touched };
    },
    enabled: !!user && !!programId && !weekOver,
  });
  const rows = data?.rows || NO_ROWS;
  const touched = data?.touched || NO_DATES;
  const activeTemplate = rows
    .map((r) => r.override_source || "")
    .find((s) => s.startsWith(TEMPLATE_SOURCE_PREFIX))
    ?.slice(TEMPLATE_SOURCE_PREFIX.length);

  const { data: library = [], isLoading: libLoading } = useQuery({
    queryKey: ["workoutLibrary", user?.id],
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user && open,
  });
  const folders = useMemo(() => templateFolders(library), [library]);
  const chosen = folders.find((f) => f.folder === folder) || null;
  const plan = useMemo(
    () => (chosen ? planTemplateWeek(rows, chosen.workouts, touched, today) : []),
    [chosen, rows, touched, today]
  );

  if (!programId || weekOver) return null;

  const onApply = () => apply.mutate({ plan, folder: chosen.folder }, {
    onSuccess: (n) => { toast.success(`${chosen.folder} set for ${n} day${n === 1 ? "" : "s"} this week`); setOpen(false); setFolder(null); },
    onError: (e) => toast.error(e.message || "Couldn't apply the template"),
  });
  const onClear = () => clear.mutate({ rows, touched }, {
    onSuccess: () => toast.success("Back to the engine's plan. The week re-plans in a minute or two."),
    onError: (e) => toast.error(e.message || "Couldn't clear the template"),
  });

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <span className="text-xs text-muted-2 truncate">
          {activeTemplate ? <>Running <span className="text-ink font-semibold">{activeTemplate}</span> this week</> : "Engine's plan"}
        </span>
        <div className="flex gap-2 shrink-0">
          {activeTemplate && (
            <button
              type="button" onClick={onClear} disabled={clear.isPending}
              className="glass-interactive min-h-[44px] px-3 rounded-xl border border-charcoal-border text-xs font-bold text-ink-secondary disabled:opacity-60"
            >
              {clear.isPending ? "Resetting…" : "Use engine plan"}
            </button>
          )}
          <button
            type="button" onClick={() => setOpen(true)}
            className="glass-interactive min-h-[44px] px-3 rounded-xl border border-charcoal-border flex items-center gap-1.5 text-xs font-bold text-ink-secondary"
          >
            <LayoutTemplate className="w-3.5 h-3.5" /> Use a template
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setFolder(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Run a template this week</DialogTitle>
            <DialogDescription>
              Your saved split replaces the engine&apos;s lifting on every day left in
              {" "}{format(parseISO(first), "MMM d")} to {format(parseISO(last), "MMM d")}. cycling the split
              (a 4-day split runs Day 1 to 4, then starts over). Next week the engine plans again.
            </DialogDescription>
          </DialogHeader>

          {libLoading && (
            <div className="flex items-center gap-2 text-sm text-ink-muted py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your workouts…
            </div>
          )}
          {!libLoading && folders.length === 0 && (
            <p className="text-sm text-ink-muted py-2">
              No templates yet. Save two or more workouts into the same folder (for a PPL: a
              folder with 1 Push, 2 Pull, 3 Legs) and it shows up here.
            </p>
          )}

          <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
            {folders.map((f) => (
              <button
                key={f.folder} type="button" onClick={() => setFolder(f.folder)}
                aria-pressed={folder === f.folder}
                className={`w-full text-left rounded-lg border px-3 py-2 ${folder === f.folder ? "border-brand/50 bg-brand/[8%]" : "border-charcoal-border"}`}
              >
                <span className="block font-semibold text-sm">{f.folder}</span>
                <span className="block text-[11px] text-ink-muted truncate">{f.workouts.map((w) => w.title).join(" · ")}</span>
              </button>
            ))}
          </div>

          {chosen && (
            <div className="mt-2">
              {plan.length === 0 ? (
                <p className="text-sm text-ink-muted">No days left in this week to plan.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {plan.map(({ row, workout }) => (
                    <li key={row.id} className="flex justify-between gap-3">
                      <span className="text-ink-muted shrink-0">{format(parseISO(row.scheduled_date), "EEE MMM d")}</span>
                      <span className="text-ink font-semibold truncate">{workout.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button" onClick={onApply} disabled={apply.isPending || plan.length === 0}
                className="cta-action w-full mt-3 disabled:opacity-60"
              >
                {apply.isPending ? "Applying…" : `Run ${chosen.folder} this week`}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
