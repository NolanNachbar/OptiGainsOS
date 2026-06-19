import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Edit, Copy, Trash2, FolderOpen, Download } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function WorkoutCard({ workout, userId, onEdit, onClone, onDelete }) {
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

  // Guard against corrupted auto-saved durations (minute totals in the hundreds).
  const validDuration =
    workout.duration_minutes && workout.duration_minutes > 0 && workout.duration_minutes <= 240
      ? workout.duration_minutes
      : null;

  const handleExport = () => {
    const exportData = {
      _vektor_version: 1,
      title: workout.title,
      description: workout.description,
      focus: workout.focus,
      duration_minutes: workout.duration_minutes,
      exercises: workout.exercises,
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="group relative overflow-hidden glass glass-interactive">
        <div className="pb-2 pt-4 px-4 md:px-6">
          {(workout.focus && workout.focus !== "strength") || workout.folder ? (
            <div className="flex flex-wrap gap-1.5 pr-12 min-w-0">
              {workout.focus && workout.focus !== "strength" && (
                <Badge
                  variant="outline"
                  className="text-xs capitalize text-ink-muted hairline"
                >
                  {workout.focus}
                </Badge>
              )}
              {workout.folder && (
                <Badge
                  variant="slate"
                  className="max-w-[120px] truncate text-xs"
                >
                  <FolderOpen className="w-3 h-3 mr-1 shrink-0" />
                  <span className="truncate">{workout.folder}</span>
                </Badge>
              )}
            </div>
          ) : null}

          {isOwner && (
              <div className="absolute right-2 top-2 z-10" ref={menuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpenMenu(!openMenu)}
                  className="h-11 w-11 text-ink-muted hover:text-ink-muted"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
                {openMenu && (
                  <div className="absolute right-0 top-12 glass-elevated rounded-xl py-1 z-20 min-w-[140px]">
                    <button
                      onClick={() => { onEdit(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-white/[0.06] flex items-center gap-2"
                    >
                      <Edit className="w-3.5 h-3.5" />Edit
                    </button>
                    <button
                      onClick={() => { onClone(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-white/[0.06] flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5" />Clone
                    </button>
                    <button
                      onClick={() => { handleExport(); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-white/[0.06] flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />Export JSON
                    </button>
                    <button
                      onClick={() => { onDelete(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-bad hover:bg-bad/10 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </div>
                )}
              </div>
          )}

          <h3 className="text-base font-bold text-ink line-clamp-2 mt-1.5 leading-snug pr-12">
            {workout.title}
          </h3>
          {workout.description && (
            <p className="text-xs text-ink-muted line-clamp-2 mt-1 leading-relaxed">
              {workout.description}
            </p>
          )}
        </div>

        <div className="pt-0 pb-4 px-4 md:px-6 space-y-3">
          {/* Stats row */}
          <div className="flex">
            {validDuration && (
              <div className="flex-1 flex flex-col">
                <span className="section-label">Duration</span>
                <span className="font-technical text-lg font-bold text-ink mt-0.5">{validDuration} min</span>
              </div>
            )}
            <div className={`flex-1 flex flex-col ${validDuration ? 'border-l hairline pl-4' : ''}`}>
              <span className="section-label">Exercises</span>
              <span className="font-technical text-lg font-bold text-ink mt-0.5">{workout.exercises?.length || 0}</span>
            </div>
          </div>

          {/* View Details */}
          <Link to={`/workout-detail?id=${workout.id}`} className="block">
            <Button
              variant="dim"
              size="lg"
              className="w-full"
            >
              View Details
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
