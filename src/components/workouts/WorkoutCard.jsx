import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Edit, Copy, Trash2, FolderOpen, Download } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function WorkoutCard({ workout, userId, onEdit, onClone, onDelete }) {
  const borderColor = '#7c3aed';
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
      <div
        className="group relative overflow-hidden rounded-xl border-l-4 bg-[#1a1a1a] border border-[#2a2a2a] hover:bg-[#242424]/50 transition-colors duration-200"
        style={{ borderLeftColor: borderColor }}
      >
        <div className="pb-2 pt-4 px-6">
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              <Badge
                variant="outline"
                className="text-xs capitalize text-[#a0a0a0] border-[#2a2a2a] border-[#2a2a2a]"
              >
                {workout.focus}
              </Badge>
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

            {isOwner && (
              <div className="relative flex-shrink-0" ref={menuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpenMenu(!openMenu)}
                  className="h-7 w-7 text-[#a0a0a0] hover:text-[#a0a0a0]"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
                {openMenu && (
                  <div className="absolute right-0 top-8 bg-[#202020] rounded-xl border border-[#2a2a2a] py-1 z-20 min-w-[140px]">
                    <button
                      onClick={() => { onEdit(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-[#242424] flex items-center gap-2"
                    >
                      <Edit className="w-3.5 h-3.5" />Edit
                    </button>
                    <button
                      onClick={() => { onClone(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-[#242424] flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5" />Clone
                    </button>
                    <button
                      onClick={() => { handleExport(); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-white hover:bg-[#242424] flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />Export JSON
                    </button>
                    <button
                      onClick={() => { onDelete(workout.id); setOpenMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-[#f87171] hover:bg-[rgba(239,68,68,0.1)] flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <h3 className="text-base font-bold text-white line-clamp-2 mt-1.5 leading-snug">
            {workout.title}
          </h3>
          {workout.description && (
            <p className="text-xs text-[#555555] line-clamp-2 mt-1 leading-relaxed">
              {workout.description}
            </p>
          )}
        </div>

        <div className="pt-0 pb-4 px-6 space-y-3">
          {/* Stats row */}
          <div className="flex">
            {workout.duration_minutes && (
              <div className="flex-1 flex flex-col">
                <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">Duration</span>
                <span className="text-lg font-bold tabular-nums text-white mt-0.5">{workout.duration_minutes} min</span>
              </div>
            )}
            <div className={`flex-1 flex flex-col ${workout.duration_minutes ? 'border-l border-[#2a2a2a] pl-4' : ''}`}>
              <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">Exercises</span>
              <span className="text-lg font-bold tabular-nums text-white mt-0.5">{workout.exercises?.length || 0}</span>
            </div>
          </div>

          {/* View Details */}
          <Link to={`/workout-detail?id=${workout.id}`} className="block">
            <Button
              variant="primary"
              className="w-full text-sm bg-purple-600 hover:bg-purple-700 text-white border-none"
            >
              View Details
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
