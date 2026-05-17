import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

function downloadCSV(filename, rows) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(",")
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

export default function DataExport({ weightEntries = [], foodEntries = [] }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const [workoutLogs, workouts] = await Promise.all([
        db.entities.WorkoutLog.filter({ created_by: user.id }),
        db.entities.Workout.filter({ created_by: user.id }),
      ]);

      const workoutNameMap = Object.fromEntries(workouts.map((w) => [w.id, w.title]));

      // Body weight CSV
      const weightRows = [
        ["date", "weight"],
        ...[...weightEntries]
          .sort((a, b) => new Date(a.recorded_date) - new Date(b.recorded_date))
          .map((e) => [e.recorded_date, e.weight]),
      ];
      downloadCSV("body_weight.csv", weightRows);

      // Food log CSV
      const foodRows = [
        ["date", "meal", "food_name", "calories", "protein_g", "carbs_g", "fats_g"],
        ...[...foodEntries]
          .sort((a, b) => new Date(a.log_date) - new Date(b.log_date))
          .map((e) => [
            e.log_date,
            e.meal_type,
            e.food_name,
            e.calories,
            e.protein_grams,
            e.carbs_grams,
            e.fats_grams,
          ]),
      ];
      downloadCSV("food_log.csv", foodRows);

      // Lifting log CSV — flatten each log's exercises and sets into rows
      const liftRows = [
        ["date", "workout_name", "exercise", "set", "weight", "reps", "completed"],
      ];
      for (const log of [...workoutLogs].sort(
        (a, b) => new Date(a.log_date) - new Date(b.log_date)
      )) {
        const name = workoutNameMap[log.workout_id] || "Quick Workout";
        for (const ex of log.exercises || []) {
          for (const s of ex.sets || []) {
            liftRows.push([
              log.log_date,
              name,
              ex.name,
              s.set_number,
              s.weight,
              s.reps,
              s.completed ? "yes" : "no",
            ]);
          }
        }
      }
      downloadCSV("lifting_log.csv", liftRows);

      toast.success("3 files downloaded: body_weight.csv, food_log.csv, lifting_log.csv");
    } catch (err) {
      console.error(err);
      toast.error("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <p className="font-medium text-slate-900 dark:text-white">Export Your Data</p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Download your food log, body weight, and lifting history as CSV files
        </p>
      </div>
      <Button variant="outline" onClick={handleExport} disabled={loading} className="ml-4 shrink-0">
        <Download className="w-4 h-4 mr-1.5" />
        {loading ? "Exporting…" : "Export"}
      </Button>
    </div>
  );
}
