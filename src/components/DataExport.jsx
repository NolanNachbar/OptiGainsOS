import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

function downloadCSV(filename, rows) {
  const csv = rows
    .map((r) =>
      r.map((cell) => {
        const s = String(cell ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EXPORTS = [
  {
    id: "lifting",
    label: "Lifting Log",
    description: "All workout logs with sets, reps, weight, and RPE",
    fn: async (user) => {
      const [workoutLogs, workouts] = await Promise.all([
        db.entities.WorkoutLog.filter({ created_by: user.id }),
        db.entities.Workout.filter({ created_by: user.id }),
      ]);
      const nameMap = Object.fromEntries(workouts.map((w) => [w.id, w.title]));
      const rows = [["date", "workout", "exercise", "set", "weight", "reps", "rpe", "completed"]];
      for (const log of [...workoutLogs].sort((a, b) => new Date(a.log_date) - new Date(b.log_date))) {
        for (const ex of log.exercises || []) {
          for (const s of ex.sets || []) {
            rows.push([log.log_date, nameMap[log.workout_id] || "Quick Workout", ex.name, s.set_number, s.weight, s.reps, s.rpe ?? "", s.completed ? "yes" : "no"]);
          }
        }
      }
      downloadCSV("lifting_log.csv", rows);
    },
  },
  {
    id: "food",
    label: "Food Log",
    description: "All food entries with macros",
    fn: async (user, { foodEntries }) => {
      const rows = [["date", "meal", "food_name", "calories", "protein_g", "carbs_g", "fats_g"]];
      [...foodEntries].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((e) => {
        rows.push([e.date, e.meal_type, e.food_name, e.calories, e.protein_grams, e.carbs_grams, e.fats_grams]);
      });
      downloadCSV("food_log.csv", rows);
    },
  },
  {
    id: "weight",
    label: "Body Weight",
    description: "Daily body weight entries",
    fn: async (user, { weightEntries }) => {
      const rows = [["date", "weight", "notes"]];
      [...weightEntries].sort((a, b) => new Date(a.recorded_date) - new Date(b.recorded_date)).forEach((e) => {
        rows.push([e.recorded_date, e.weight, e.notes || ""]);
      });
      downloadCSV("body_weight.csv", rows);
    },
  },
  {
    id: "recovery",
    label: "Recovery Metrics",
    description: "HRV, sleep, steps, and body battery from Garmin/Apple Health",
    fn: async (user) => {
      const { data } = await supabase.from("recovery_metrics").select("*").eq("created_by", user.id).order("date");
      const rows = [["date", "source", "hrv", "sleep_min", "sleep_score", "body_battery", "resting_hr", "steps", "training_load_acute", "training_load_chronic"]];
      (data || []).forEach((r) => rows.push([r.date, r.source, r.hrv ?? "", r.sleep_duration_min ?? "", r.sleep_score ?? "", r.body_battery ?? "", r.resting_hr ?? "", r.steps ?? "", r.training_load_acute ?? "", r.training_load_chronic ?? ""]));
      downloadCSV("recovery_metrics.csv", rows);
    },
  },
  {
    id: "supplements",
    label: "Supplement Log",
    description: "All supplement doses with timestamps",
    fn: async (user) => {
      const { data } = await supabase.from("supplement_logs").select("*").eq("created_by", user.id).order("taken_at");
      const rows = [["taken_at", "supplement", "dose", "unit", "notes"]];
      (data || []).forEach((r) => rows.push([r.taken_at, r.supplement_name, r.dose ?? "", r.unit ?? "", r.notes ?? ""]));
      downloadCSV("supplement_log.csv", rows);
    },
  },
  {
    id: "reading",
    label: "Reading Log",
    description: "Books with status, ratings, and notes",
    fn: async (user) => {
      const { data } = await supabase.from("reading_log").select("*").eq("created_by", user.id).order("created_at");
      const rows = [["title", "author", "category", "status", "rating", "started_at", "finished_at", "notes"]];
      (data || []).forEach((r) => rows.push([r.title, r.author ?? "", r.category ?? "", r.status, r.rating ?? "", r.started_at ?? "", r.finished_at ?? "", r.notes ?? ""]));
      downloadCSV("reading_log.csv", rows);
    },
  },
  {
    id: "career",
    label: "Job Applications",
    description: "Application pipeline with status and notes",
    fn: async (user) => {
      const { data } = await supabase.from("job_applications").select("*").eq("created_by", user.id).order("date_applied");
      const rows = [["company", "role", "date_applied", "status", "notes", "next_action", "next_action_date"]];
      (data || []).forEach((r) => rows.push([r.company, r.role, r.date_applied ?? "", r.status, r.notes ?? "", r.next_action ?? "", r.next_action_date ?? ""]));
      downloadCSV("job_applications.csv", rows);
    },
  },
  {
    id: "measurements",
    label: "Measurements",
    description: "Body measurements history in cm",
    fn: async (user) => {
      const { data } = await supabase.from("measurements").select("*").eq("created_by", user.id).order("date");
      const rows = [["date", "chest_cm", "waist_cm", "hips_cm", "left_arm_cm", "right_arm_cm", "left_quad_cm", "right_quad_cm", "neck_cm", "notes"]];
      (data || []).forEach((r) => rows.push([r.date, r.chest_cm ?? "", r.waist_cm ?? "", r.hips_cm ?? "", r.left_arm_cm ?? "", r.right_arm_cm ?? "", r.left_quad_cm ?? "", r.right_quad_cm ?? "", r.neck_cm ?? "", r.notes ?? ""]));
      downloadCSV("measurements.csv", rows);
    },
  },
];

export default function DataExport({ weightEntries = [], foodEntries = [] }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const run = async (exp) => {
    setLoading(exp.id);
    try {
      await exp.fn(user, { weightEntries, foodEntries });
      toast.success(`${exp.label} downloaded`);
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setLoading(null);
    }
  };

  const runAll = async () => {
    setLoading("all");
    let count = 0;
    for (const exp of EXPORTS) {
      try {
        await exp.fn(user, { weightEntries, foodEntries });
        count++;
      } catch {}
    }
    toast.success(`${count} files downloaded`);
    setLoading(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-medium text-white">Export Your Data</p>
          <p className="text-sm text-[#a0a0a0]">{EXPORTS.length} datasets available as CSV</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={runAll} disabled={!!loading} className="shrink-0">
            <Download className="w-4 h-4 mr-1.5" />
            {loading === "all" ? "Exporting…" : "Export All"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)} className="shrink-0 px-2">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 mt-3 pt-3 border-t border-[#2a2a2a]">
          {EXPORTS.map((exp) => (
            <div key={exp.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[#111] border border-[#2a2a2a]">
              <div>
                <p className="text-sm text-white font-medium">{exp.label}</p>
                <p className="text-xs text-[#555555]">{exp.description}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-3 text-xs shrink-0" disabled={!!loading} onClick={() => run(exp)}>
                {loading === exp.id ? "…" : <Download className="w-3.5 h-3.5" />}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
