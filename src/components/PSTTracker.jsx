import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Waves, Plus, Trophy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getTodayString } from "@/utils/dateUtils";
import { format, parseISO } from "date-fns";

// BUD/S competitive PST targets
const PST_TARGETS = {
  swim:    { label: "500yd Swim", unit: "sec", target: 540,  lower_is_better: true,  competitive: 480 },
  pushups: { label: "Push-ups",   unit: "reps", target: 100, lower_is_better: false, competitive: 100 },
  situps:  { label: "Sit-ups",    unit: "reps", target: 100, lower_is_better: false, competitive: 100 },
  pullups: { label: "Pull-ups",   unit: "reps", target: 20,  lower_is_better: false, competitive: 20  },
  run:     { label: "1.5mi Run",  unit: "sec",  target: 570, lower_is_better: true,  competitive: 540 },
};

// Shared section-header pattern (mirrors the SectionHeader in AthleteState):
// hue-coded icon + section-label heading. Kept local since the AthleteState
// copy is not exported; markup is intentionally identical so siblings match.
function SectionHeader({ icon: Icon, title, color = "text-teal" }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <h2 className="section-label !text-ink">{title}</h2>
    </div>
  );
}

function fmtTime(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PSTBar({ event, value }) {
  const cfg = PST_TARGETS[event];
  if (!value) return (
    <div className="flex items-center justify-between text-sm mb-3">
      <span className="text-muted-2 font-semibold w-28">{cfg.label}</span>
      <span className="text-muted-2 font-semibold text-xs">Not logged</span>
    </div>
  );

  let pct;
  if (cfg.lower_is_better) {
    // Lower is better: pct = competitive/value (capped at 1)
    pct = Math.min((cfg.competitive / value) * 100, 100);
  } else {
    pct = Math.min((value / cfg.target) * 100, 100);
  }

  const isTimed = event === "swim" || event === "run";
  const display = isTimed ? fmtTime(value) : `${value}`;
  const targetDisplay = isTimed ? fmtTime(cfg.target) : `${cfg.target}`;
  // PST scores are performance data, not biometrics — fill carries each event's
  // own data hue (timed swim/run = carb-blue, rep events = endurance teal),
  // leaving the ok/info physiological spectrum reserved for true biometrics.
  const hue = isTimed
    ? { text: "text-carb", bar: "bg-carb" }
    : { text: "text-teal", bar: "bg-teal" };

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-secondary font-bold">{cfg.label}</span>
        <span className={`font-technical font-bold ${hue.text}`}>
          {display} <span className="text-muted-2 font-semibold">/ target {targetDisplay}</span>
        </span>
      </div>
      <div className="h-1.5 bg-track rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(.2,.7,.3,1)] ${hue.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// A numeric time field with a PERSISTENT inline unit suffix. The suffix is
// painted as ink pinned to the right edge (not a placeholder) so the unit
// survives after entry; the input carries right-padding so the typed number
// never collides with it. A left-aligned ink-muted '0' placeholder
// (pst-test-logger-4) reads in an untouched field; a typed 0 still renders as
// full-weight ink distinct from the muted placeholder. The suffix sits at
// text-secondary, heavier than the empty placeholder, and the input/suffix
// both carry tabular-nums so digits never shift width.
//
// When `max` is set (the seconds fields) the value is clamped to 0..max on
// change AND blur (pst-test-logger-6), with a neutral ink-muted inline hint
// shown when a clamp fires so the cap is explained without poaching the
// physiological warn spectrum (form-validation reads as neutral ink, SYS-09c).
function TimeField({ unit, value, onChange, disabled, max, placeholder = "0" }) {
  const [clamped, setClamped] = useState(false);
  const cap = max != null ? parseInt(max) : null;

  const apply = (raw) => {
    if (cap != null && raw !== "") {
      const n = parseInt(raw);
      if (!Number.isNaN(n) && n > cap) {
        setClamped(true);
        onChange(String(cap));
        return;
      }
    }
    setClamped(false);
    onChange(raw);
  };

  return (
    <div className="flex-1">
      <div className="relative">
        <Input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min="0"
          max={max}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={e => apply(e.target.value)}
          onBlur={e => apply(e.target.value)}
          className="pr-10 tabular-nums"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-secondary tabular-nums"
        >
          {unit}
        </span>
      </div>
      {clamped && cap != null && (
        <p className="mt-1 text-[10px] font-semibold text-muted-2 tabular-nums">Max {cap}</p>
      )}
    </div>
  );
}

export default function PSTTracker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    test_date: getTodayString(),
    swim_min: "", swim_sec: "",
    pushups: "", situps: "", pullups: "",
    run_min: "", run_sec: "",
    notes: "",
  });

  const { data: tests = [], isLoading } = useQuery({
    queryKey: ["pst-tests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pst_tests")
        .select("*")
        .eq("created_by", user.id)
        .order("test_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const swim_seconds = form.swim_min ? parseInt(form.swim_min) * 60 + parseInt(form.swim_sec || 0) : null;
      const run_seconds  = form.run_min  ? parseInt(form.run_min)  * 60 + parseInt(form.run_sec  || 0) : null;
      const row = {
        created_by:   user.id,
        test_date:    form.test_date,
        swim_seconds: swim_seconds || null,
        pushups:      form.pushups  ? parseInt(form.pushups)  : null,
        situps:       form.situps   ? parseInt(form.situps)   : null,
        pullups:      form.pullups  ? parseInt(form.pullups)  : null,
        run_seconds:  run_seconds   || null,
        notes:        form.notes    || null,
      };
      const { error } = await supabase.from("pst_tests").upsert(row, { onConflict: "created_by,test_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pst-tests", user?.id] });
      setShowForm(false);
      toast.success("PST test logged");
    },
    onError: () => toast.error("Failed to save PST test"),
  });

  const latest = tests[0];
  const prev   = tests[1];

  // Gate Save (pst-test-logger-2): the form must carry at least one score
  // before it can upsert, or an empty submit writes an all-null record. The
  // date alone is not a score, so it is excluded from the check.
  const hasAnyScore = [
    form.swim_min, form.swim_sec,
    form.pushups, form.situps, form.pullups,
    form.run_min, form.run_sec,
  ].some(v => String(v).trim() !== "");

  return (
    <Card className="glass glass-interactive">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between gap-2">
          {/* Shared SectionHeader pattern (icon + section-label !text-ink),
              matching the AthleteState sibling cards, with Log Test kept as a
              trailing action. Waves carries the endurance hue (teal). */}
          <SectionHeader icon={Waves} title="PST Performance" />
          <Button variant="ghost" size="sm" className="min-h-[44px] gap-1 text-xs px-4" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5" /> Log Test
          </Button>
        </div>
        {latest?.test_date && (
          <p className="font-technical text-[10px] font-semibold text-muted-2 mt-1">Last tested: {format(parseISO(latest.test_date), "MMM d, yyyy")}</p>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {isLoading ? (
          <p className="text-xs font-semibold text-muted-2">Loading…</p>
        ) : !latest ? (
          <div className="text-center py-4">
            <Trophy className="w-8 h-8 mx-auto text-faint mb-2" />
            <p className="text-sm font-semibold text-muted-2">No PST data yet.</p>
            <p className="text-xs font-semibold text-faint mt-1">Log your first test to track progress.</p>
          </div>
        ) : (
          <>
            <PSTBar event="swim"    value={latest.swim_seconds} />
            <PSTBar event="pushups" value={latest.pushups} />
            <PSTBar event="situps"  value={latest.situps} />
            <PSTBar event="pullups" value={latest.pullups} />
            <PSTBar event="run"     value={latest.run_seconds} />

            {/* Comparison with previous */}
            {prev && (
              <div className="mt-3 pt-3 border-t hairline">
                <p className="section-label mb-2">vs previous ({format(parseISO(prev.test_date), "MMM d, yyyy")})</p>
                <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
                  {[
                    { label: "Swim", cur: latest.swim_seconds, prv: prev.swim_seconds, lower: true },
                    { label: "Push", cur: latest.pushups,      prv: prev.pushups,      lower: false },
                    { label: "Sit",  cur: latest.situps,       prv: prev.situps,       lower: false },
                    { label: "Pull", cur: latest.pullups,      prv: prev.pullups,      lower: false },
                    { label: "Run",  cur: latest.run_seconds,  prv: prev.run_seconds,  lower: true },
                  ].map(({ label, cur, prv, lower }) => {
                    const delta = cur != null && prv != null ? cur - prv : null;
                    const improved = delta != null && (lower ? delta < 0 : delta > 0);
                    return (
                      <div key={label}>
                        <p className="text-muted-2 font-semibold">{label}</p>
                        {delta != null ? (
                          // Direction is carried by the leading sign + ink WEIGHT
                          // (pst-test-logger-7): an improvement reads in the `ok`
                          // physiological-positive token, a regression stays
                          // neutral ink, instead of overloading the teal action
                          // hue as a generic "good" decoration.
                          <p className={`font-technical font-bold ${improved ? "text-ok" : "text-muted-2"}`}>
                            {lower ? (delta < 0 ? "-" : "+") : (delta > 0 ? "+" : "")}{lower ? Math.abs(delta) + "s" : Math.abs(delta)}
                          </p>
                        ) : (
                          <p className="text-faint">—</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Log PST Test dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm p-0">
          <div className="px-6 pt-6">
            <DialogHeader>
              <DialogTitle>Log PST Test</DialogTitle>
              <DialogDescription>Record your latest scores; targets are BUD/S competitive standards.</DialogDescription>
            </DialogHeader>
          </div>
          {/* pst-test-logger-1: the action bar at the bottom is sticky bottom-0
              inside this scroll region. The fields cluster carries a bottom pad
              equal to the bar's FULL painted height so the last field (Notes)
              scrolls clear ABOVE the pinned bar at every scroll position instead
              of its border tucking under / intersecting the action-bar box. The
              bar paints: pt-3 lid (0.75rem) + 44px lg button + pb (0.75rem) +
              bottom safe-area inset. We add an 8px clearance gap on top of that
              so the Notes textarea border keeps daylight from the bar at max
              scroll. */}
          <div className="px-6">
            <div
              className="space-y-3"
              style={{ paddingBottom: 'calc(0.75rem + 44px + 0.75rem + env(safe-area-inset-bottom) + 8px)' }}
            >
            <div>
              <label className="form-label mb-1 block">Date</label>
              <Input
                type="date"
                disabled={saveMutation.isPending}
                value={form.test_date}
                onChange={e => setForm(f => ({ ...f, test_date: e.target.value }))}
                className="[color-scheme:dark]"
              />
            </div>
            {/* Timed cluster — swim + run share the min/sec entry shape. */}
            <div className="space-y-3">
              <div>
                <label className="form-label mb-1 block">{PST_TARGETS.swim.label}</label>
                <div className="flex gap-2">
                  <TimeField unit="min" value={form.swim_min} disabled={saveMutation.isPending} onChange={v => setForm(f => ({ ...f, swim_min: v }))} />
                  <TimeField unit="sec" max="59" value={form.swim_sec} disabled={saveMutation.isPending} onChange={v => setForm(f => ({ ...f, swim_sec: v }))} />
                </div>
              </div>
              <div>
                <label className="form-label mb-1 block">{PST_TARGETS.run.label}</label>
                <div className="flex gap-2">
                  <TimeField unit="min" value={form.run_min} disabled={saveMutation.isPending} onChange={v => setForm(f => ({ ...f, run_min: v }))} />
                  <TimeField unit="sec" max="59" value={form.run_sec} disabled={saveMutation.isPending} onChange={v => setForm(f => ({ ...f, run_sec: v }))} />
                </div>
              </div>
            </div>
            {/* Hairline divider separates timed events from rep-count events. */}
            <div className="border-t hairline" />
            {/* Rep cluster — stacks full-width at 390px (44px-tall fields, no
                cramped 3-up), settling into 3 columns from md up. */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-2">
              {["pushups", "situps", "pullups"].map(field => (
                <div key={field}>
                  <label className="form-label mb-1 block">{PST_TARGETS[field].label}</label>
                  <Input type="number" inputMode="numeric" pattern="[0-9]*" min="0" disabled={saveMutation.isPending} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} className="tabular-nums" />
                </div>
              ))}
            </div>
            <div>
              <label className="form-label mb-1 block">Notes</label>
              <Textarea rows={2} placeholder="Optional notes" disabled={saveMutation.isPending} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            </div>
            {/* Sticky action footer — at 390px the form is tall enough to push the
                actions below the fold, so pin Cancel/Save to the sheet's bottom
                edge on the sheet material with a hairline lid + safe-area inset so
                they stay in the thumb zone without scrolling. -mx-6 cancels the
                content px-6 so the bar spans the sheet edge to edge. Sits OUTSIDE
                the padded fields div (pst-5) so the Notes box clears it on scroll. */}
            <div
              className="sticky bottom-0 -mx-6 flex gap-3 border-t hairline px-6 pt-3 glass-sheet"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <Button variant="ghost" size="lg" className="flex-1" disabled={saveMutation.isPending} onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="volt" size="lg" className="flex-1" disabled={saveMutation.isPending || !hasAnyScore} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 spin-loop" /> Saving…
                  </>
                ) : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
