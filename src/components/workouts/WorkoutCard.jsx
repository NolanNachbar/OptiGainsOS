import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, MoreVertical, Edit, Copy, Trash2, FolderOpen, Download } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const DIFF_BORDER = { beginner: '#10b981', intermediate: '#f59e0b', advanced: '#ef4444', expert: '#a855f7' };

// Capitalized and color-coded difficulty badges
const DIFFICULTY_STYLES = {
  beginner: {
    label: "Beginner",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700",
  },
  intermediate: {
    label: "Intermediate",
    className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
  },
  advanced: {
    label: "Advanced",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
  },
  expert: {
    label: "Expert",
    className: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700",
  },
};

export default function WorkoutCard({ workout, reaction, onReactionChange, userId, onEdit, onClone, onDelete }) {
  const borderColor = DIFF_BORDER[workout.difficulty?.toLowerCase()] || '#7c3aed';
  const [openMenu, setOpenMenu] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openMenu && menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenu]);

  const isOwner = workout.created_by === userId;

  const handleExport = () => {
    const exportData = {
      _sisyphus_version: 1,
      title: workout.title,
      description: workout.description,
      type: workout.type,
      difficulty: workout.difficulty,
      duration_minutes: workout.duration_minutes,
      exercises: workout.exercises,
      equipment_needed: workout.equipment_needed,
      target_goals: workout.target_goals,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workout.title.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`"${workout.title}" exported`);
  };
  const diffStyle = DIFFICULTY_STYLES[workout.difficulty?.toLowerCase()] || {
    label: workout.difficulty || "Unknown",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="group relative overflow-hidden rounded-xl border-l-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 shadow-md hover:shadow-lg transition-all duration-200"
        style={{ borderLeftColor: borderColor }}
      >
        <div className="pb-2 pt-4 px-6">
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              {/* Difficulty badge — capitalized + colored */}
              <Badge
                variant="outline"
                className={`text-xs font-semibold capitalize border ${diffStyle.className}`}
              >
                {diffStyle.label}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs capitalize text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600"
              >
                {workout.type}
              </Badge>
              {workout.folder && (
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700 max-w-[120px] truncate text-xs"
                >
                  <FolderOpen className="w-3 h-3 mr-1 shrink-0" />
                  <span className="truncate">{workout.folder}</span>
                </Badge>
              )}
            </div>

            {isOwner && (
              <div className="relative flex-shrink-0" ref={menuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpenMenu(!openMenu)}
                  className="h-7 w-7 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
                {openMenu && (
                  <div className="absolute right-0 top-8 bg-white dark:bg-slate-700 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 py-1 z-20 min-w-[140px]">
                    <button
                      onClick={() => { onEdit(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2"
                    >
                      <Edit className="w-3.5 h-3.5" />Edit
                    </button>
                    <button
                      onClick={() => { onClone(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5" />Clone
                    </button>
                    <button
                      onClick={() => { handleExport(); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />Export JSON
                    </button>
                    <button
                      onClick={() => { onDelete(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-2 mt-1.5 leading-snug">
            {workout.title}
          </h3>
          {workout.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed">
              {workout.description}
            </p>
          )}
        </div>

        <div className="pt-0 pb-4 px-6 space-y-3">
          {/* Stats row */}
          <div className="flex">
            {workout.duration_minutes && (
              <div className="flex-1 flex flex-col">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Duration</span>
                <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">{workout.duration_minutes} min</span>
              </div>
            )}
            <div className={`flex-1 flex flex-col ${workout.duration_minutes ? 'border-l border-slate-100 dark:border-slate-700 pl-4' : ''}`}>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Exercises</span>
              <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">{workout.exercises?.length || 0}</span>
            </div>
          </div>

          {/* Reaction buttons — native <button> so our bg/border classes
               always win without fighting shadcn variant specificity */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onReactionChange(workout.id, "like")}
              className={[
                "flex-1 inline-flex items-center justify-center gap-1 rounded-md border text-xs font-semibold h-8 px-3 transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
                reaction === "like"
                  ? "bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600 hover:border-emerald-600"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-400",
              ].join(" ")}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              Like
            </button>

            <button
              type="button"
              onClick={() => onReactionChange(workout.id, "dislike")}
              className={[
                "inline-flex items-center justify-center rounded-md border h-8 w-8 transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1",
                reaction === "dislike"
                  ? "bg-red-500 border-red-500 text-white hover:bg-red-600 hover:border-red-600"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-400 hover:text-red-500",
              ].join(" ")}
              aria-label="Not for me"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* View Details */}
          <Link to={`/workout-detail?id=${workout.id}`} className="block">
            <Button
              variant="primary"
              className="w-full text-sm bg-purple-600 hover:bg-purple-700 text-white border-none shadow-sm"
            >
              View Details
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
