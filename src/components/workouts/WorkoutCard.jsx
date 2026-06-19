import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Edit, Copy, Trash2, FolderOpen, Download } from "lucide-react";
import { toast } from "sonner";

const RISE = ["rise-in", "rise-in-2", "rise-in-3"];

export default function WorkoutCard({ workout, userId, onEdit, onClone, onDelete, index = 0 }) {
  const [openMenu, setOpenMenu] = useState(false);
  // Collision-aware kebab: flip the menu above the trigger when the card sits
  // near the viewport bottom so Delete never clips under the dock.
  const [flipUp, setFlipUp] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
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

  const toggleMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!openMenu && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // ~220px menu height + dock clearance; flip up if it would collide.
      setFlipUp(rect.bottom + 220 > window.innerHeight - 80);
    }
    setOpenMenu((v) => !v);
  };

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
    <div className={RISE[index % 3]}>
      <Link to={`/workout-detail?id=${workout.id}`} className="group relative overflow-hidden tile tile-interactive block">
        <div className="pb-2 pt-3 px-4 md:px-6">
          {/* Badge zone only reserves space when a badge actually exists, so
              badge-less cards don't carry ~28px of dead air up top. */}
          {(workout.folder || (workout.focus && workout.focus !== "strength")) && (
          <div className="flex flex-wrap gap-1.5 pr-12 min-w-0 mb-1">
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
                variant="outline"
                className="max-w-[120px] truncate text-xs text-ink-muted hairline"
              >
                <FolderOpen className="w-3 h-3 mr-1 shrink-0" />
                <span className="truncate">{workout.folder}</span>
              </Badge>
            )}
          </div>
          )}

          {isOwner && (
              <div className="absolute right-2 top-2 z-10" ref={menuRef}>
                <Button
                  ref={triggerRef}
                  variant="ghost"
                  size="icon"
                  onClick={toggleMenu}
                  aria-label="Workout options"
                  className="min-h-[44px] min-w-[44px] text-ink-muted hover:text-ink"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
                {openMenu && (
                  <div className={`absolute right-0 glass-elevated rounded-xl py-1 z-20 min-w-[140px] ${flipUp ? "bottom-12" : "top-12"}`}>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-[var(--glass-bg)] flex items-center gap-2"
                    >
                      <Edit className="w-3.5 h-3.5" />Edit
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClone(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-[var(--glass-bg)] flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5" />Clone
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleExport(); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-[var(--glass-bg)] flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />Export JSON
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-bad hover:bg-bad/10 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </div>
                )}
              </div>
          )}

          {/* Reserved title + description zone keeps every card the same height
              whether or not a description exists. */}
          <div className="min-h-[44px]">
            <h3 className="text-[17px] font-extrabold text-ink line-clamp-2 mt-0.5 leading-snug pr-12">
              {workout.title}
            </h3>
            {workout.description && (
              <p className="text-xs text-ink-muted line-clamp-2 mt-1 leading-relaxed">
                {workout.description}
              </p>
            )}
          </div>
        </div>

        <div className="pt-0 pb-4 px-4 md:px-6">
          {/* Stats row — both cells always render so columns stay stable */}
          <div className="flex">
            <div className="flex-1 flex flex-col">
              <span className="section-label">Duration</span>
              <span className={`font-technical text-base font-semibold mt-0.5 ${validDuration ? "text-ink-secondary" : "text-ink-faint"}`}>
                {validDuration ? `${validDuration} min` : "—"}
              </span>
            </div>
            <div className="flex-1 flex flex-col border-l hairline pl-4">
              <span className="section-label">Exercises</span>
              <span className="font-technical text-base font-semibold text-ink-secondary mt-0.5">{workout.exercises?.length || 0}</span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
