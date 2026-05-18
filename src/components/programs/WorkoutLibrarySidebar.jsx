import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/api/supabaseClient";
import { queryKeys } from "@/lib/queryKeys";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Library, ChevronDown, ChevronUp, Plus, FolderOpen } from "lucide-react";
import DraggableWorkoutCard from "./DraggableWorkoutCard";

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "hiit", label: "HIIT" },
  { value: "custom", label: "My Workouts" },
];

/**
 * Horizontal workout bank showing the user's workout library as draggable cards.
 * Used in ProgramBuilder Step 2 below CycleDayGrid.
 */
export default function WorkoutLibrarySidebar() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");

  const { data: workouts = [] } = useQuery({
    queryKey: queryKeys.workouts(),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const folders = [...new Set(
    workouts.map(w => w.folder).filter(Boolean)
  )].sort();

  const filtered = workouts.filter(w => {
    // text search
    if (search.trim() && !w.title?.toLowerCase().includes(search.toLowerCase())) return false;
    // type filter
    if (filter === "custom" && !w.is_custom) return false;
    if (!["all", "custom"].includes(filter) && w.type !== filter) return false;
    // folder filter
    if (folderFilter !== "all") {
      if (folderFilter === "unfiled") return !w.folder;
      if (w.folder !== folderFilter) return false;
    }
    return true;
  });

  return (
    <div>
      <div
        className="flex items-center justify-between mb-3 cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3 className="text-sm font-semibold text-[#a0a0a0] flex items-center gap-1.5">
          <Library className="w-4 h-4" />
          Workout Library
          <Badge variant="outline" className="text-xs ml-1">
            {workouts.length}
          </Badge>
        </h3>
        <div className="flex items-center gap-2">
          <Link
            to="/create-workout"
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1">
              <Plus className="w-3 h-3" />
              New Workout
            </Button>
          </Link>
          <button className="text-[#555555]">
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="relative mb-2 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workouts..."
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* Type filters */}
          <div className="flex flex-wrap gap-1 mb-2">
            {TYPE_FILTERS.map(({ value, label }) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
                className="h-6 text-[11px] px-2"
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Folder filters */}
          {folders.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mb-3">
              <FolderOpen className="w-3.5 h-3.5 text-[#555555]" />
              <Button
                size="sm"
                variant={folderFilter === "all" ? "default" : "outline"}
                onClick={() => setFolderFilter("all")}
                className="h-6 text-[11px] px-2"
              >
                All Folders
              </Button>
              {folders.map(folder => (
                <Button
                  key={folder}
                  size="sm"
                  variant={folderFilter === folder ? "default" : "outline"}
                  onClick={() => setFolderFilter(folder)}
                  className="h-6 text-[11px] px-2"
                >
                  {folder}
                </Button>
              ))}
              <Button
                size="sm"
                variant={folderFilter === "unfiled" ? "default" : "outline"}
                onClick={() => setFolderFilter("unfiled")}
                className="h-6 text-[11px] px-2"
              >
                Unfiled
              </Button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-[#555555]">
                {workouts.length === 0
                  ? "No workouts yet — click a day slot to build exercises inline."
                  : "No workouts match your filters."}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filtered.map((workout) => (
                <DraggableWorkoutCard key={workout.id} workout={workout} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
