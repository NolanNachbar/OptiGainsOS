import { useState, useRef } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingScreen, LoadingSpinner } from "@/components/ui/loading-spinner";
import { queryKeys, invalidateReactions, invalidateWorkouts, invalidateSchedule, invalidateWorkoutLogs } from "@/lib/queryKeys";
import { useProfile } from "@/hooks/useUserQueries";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { useMyPrograms, useEnrollments } from "@/hooks/useProgramQueries";
import ProgramCard from "@/components/programs/ProgramCard";
import { Calendar, Zap, Plus, Dumbbell, BookOpen, TrendingUp, FolderOpen, ThumbsUp, Upload, HelpCircle, Copy, Download, Activity, Link2, SlidersHorizontal, Pencil, Check, X, PersonStanding, Waves, Bike, Footprints, Rows3, Repeat, AlertTriangle } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { parseISO } from "date-fns";

import { parseProgramJson } from "@/utils/programIO";
import { toast } from "sonner";
import WorkoutCard from "@/components/workouts/WorkoutCard";

export default function Workouts({ defaultTab = "activity-log", hideHeader = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const importProgramRef = useRef(null);
  const [filter, setFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [workoutToDelete, setWorkoutToDelete] = useState(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const queryClient = useQueryClient();

  const { data: workouts = [], isLoading: workoutsLoading, error: workoutsError } = useQuery({
    queryKey: queryKeys.workouts(),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const { profile } = useProfile();

  const { data: cardioSessions = [], isLoading: cardioLoading, error: cardioError } = useQuery({
    queryKey: ['garminActivities', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('garmin_activities')
        .select('*')
        .eq('created_by', user.id)
        .order('activity_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: workoutLogs = [], isLoading: logsLoading, error: logsError } = useQuery({
    queryKey: queryKeys.workoutLogs(),
    queryFn: async () => {
      const logs = await db.entities.WorkoutLog.filter({ created_by: user.id });
      return logs.sort((a, b) => parseISO(b.log_date || b.created_at) - parseISO(a.log_date || a.created_at));
    },
    enabled: !!user,
  });

  const activityLogLoading = workoutsLoading || cardioLoading || logsLoading;
  const activityLogError = workoutsError || cardioError || logsError;
  const retryActivityLog = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workouts() });
    queryClient.invalidateQueries({ queryKey: ['garminActivities', user?.id] });
    queryClient.invalidateQueries({ queryKey: queryKeys.workoutLogs() });
  };

  // Programs data
  const { programs, isLoading: programsLoading } = useMyPrograms();
  const { enrollments, isLoading: enrollmentsLoading } = useEnrollments();
  const activeEnrollments = enrollments.filter((e) => e.status === "active");
  const pastEnrollments = enrollments.filter((e) => e.status !== "active");

  const cloneWorkoutMutation = useMutation({
    mutationFn: async (workoutId) => {
      const workouts = await db.entities.Workout.filter({ id: workoutId, created_by: user.id });
      if (workouts.length === 0) {
        throw new Error("Workout not found");
      }
      const workout = workouts[0];
      const clonedWorkout = await db.entities.Workout.create({
        title: `${workout.title} (Copy)`,
        description: workout.description,
        focus: workout.focus,
        duration_minutes: workout.duration_minutes,
        exercises: workout.exercises,
        created_by: user.id,
      });
      return clonedWorkout;
    },
    onSuccess: (clonedWorkout) => {
      invalidateWorkouts(queryClient);
      toast.success('Workout cloned successfully');
      navigate(`/create-workout?edit=${clonedWorkout.id}`);
    },
    onError: (error) => {
      toast.error('Failed to clone workout');
      console.error('Error cloning workout:', error);
    }
  });

  const deleteWorkoutMutation = useMutation({
    mutationFn: async (workoutId) => {
      // Nullify workout_id on logs so history is preserved
      const logs = await db.entities.WorkoutLog.filter({ workout_id: workoutId });
      for (const log of logs) {
        await db.entities.WorkoutLog.update(log.id, { workout_id: null });
      }

      // Delete related workout schedules
      const schedules = await db.entities.WorkoutSchedule.filter({ workout_id: workoutId });
      for (const schedule of schedules) {
        await db.entities.WorkoutSchedule.delete(schedule.id);
      }

      // Finally delete the workout
      await db.entities.Workout.delete(workoutId);
    },
    onSuccess: () => {
      invalidateWorkouts(queryClient);
      invalidateReactions(queryClient);
      invalidateSchedule(queryClient);
      invalidateWorkoutLogs(queryClient);
      toast.success('Workout deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete workout');
      console.error('Error deleting workout:', error);
    }
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ oldName, newName }) => {
      const toUpdate = workouts.filter(w => w.folder === oldName);
      await Promise.all(
        toUpdate.map(w => db.entities.Workout.update(w.id, { folder: newName.trim() || null }))
      );
    },
    onSuccess: (_data, { newName }) => {
      invalidateWorkouts(queryClient);
      setRenamingFolder(null);
      setRenameValue("");
      if (folderFilter === renamingFolder) setFolderFilter(newName.trim() || "all");
      toast.success("Folder renamed");
    },
    onError: () => toast.error("Failed to rename folder"),
  });

  const handleEdit = (workoutId) => {
    navigate(`/create-workout?edit=${workoutId}`);
  };

  const handleClone = (workoutId) => {
    cloneWorkoutMutation.mutate(workoutId);
  };

  const WORKOUT_TEMPLATE = JSON.stringify(
    {
      title: "My Workout",
      description: "Optional description",
      focus: "strength",
      duration_minutes: 60,
      exercises: [
        { name: "Bench Press", sets: 4, reps: "8-10", rest_seconds: 120, notes: "" },
        { name: "Incline Dumbbell Press", sets: 3, reps: "10-12", rest_seconds: 90, notes: "" },
      ],
    },
    null,
    2
  );

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.title || !Array.isArray(data.exercises)) {
          toast.error("Invalid workout file — missing title or exercises.");
          return;
        }
        await db.entities.Workout.create({
          title: data.title,
          description: data.description ?? "",
          focus: data.focus ?? data.type ?? "strength",
          duration_minutes: data.duration_minutes ?? null,
          exercises: data.exercises,
          created_by: user.id,
        });
        invalidateWorkouts(queryClient);
        toast.success(`"${data.title}" imported to your library!`);
      } catch {
        toast.error("Could not read workout file.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const handleDelete = (workoutId) => {
    const workout = workouts.find(w => w.id === workoutId);
    setWorkoutToDelete(workout);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (workoutToDelete) {
      deleteWorkoutMutation.mutate(workoutToDelete.id);
      setDeleteConfirmOpen(false);
      setWorkoutToDelete(null);
    }
  };

  const handleImportProgram = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseProgramJson(ev.target.result);
        navigate('/program-builder', { state: { importedProgram: parsed } });
      } catch (err) {
        toast.error(err.message || 'Failed to load JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Liked exercise names (thumbs up on exercises during workouts)
  // These are non-workout rows in exercise_reactions (no "workout:" prefix)

  const folders = [...new Set(
    workouts.map(w => w.folder).filter(Boolean)
  )].sort();

  const filteredWorkouts = workouts.filter(workout => {
    // Type/category filter
    if (filter !== "all" && workout.focus !== filter) return false;

    // Folder filter
    if (folderFilter !== "all") {
      if (folderFilter === "unfiled") return !workout.folder;
      if (workout.folder !== folderFilter) return false;
    }

    return true;
  });

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className={hideHeader ? "w-full" : "p-4 md:p-6 bg-charcoal min-h-screen transition-colors duration-300"}>
      <div className="max-w-5xl mx-auto">
        {!hideHeader && (
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
            <div>
              <h1 className="text-[22px] font-bold text-ink leading-tight">Workouts</h1>
              <p className="text-[13px] text-ink-muted mt-0.5">Library & session history</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/weekly-schedule">
                <Button variant="dim" size="sm" className="gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Weekly Schedule
                </Button>
              </Link>
              <Link to={"/create-workout"}>
                <Button variant="dim" size="sm">
                  <Plus className="w-3.5 h-3.5" />
                  Create Custom
                </Button>
              </Link>
            </div>
          </div>
        )}

        <Tabs defaultValue={defaultTab} className="w-full">
          {!hideHeader && (
            <TabsList className="mb-6">
              <TabsTrigger value="activity-log">
                <Activity className="w-4 h-4 mr-2" />
                Activity Log
                {(workoutLogs.length + cardioSessions.length) > 0 && (
                  <span className="ml-1.5 bg-brand/10 text-brand text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {workoutLogs.length + cardioSessions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="library">
                <Dumbbell className="w-4 h-4 mr-2" />
                Library
              </TabsTrigger>
              <TabsTrigger value="programs">
                <BookOpen className="w-4 h-4 mr-2" />
                Programs
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="library">
        <div className="glass mb-6 overflow-hidden">
          <div className="px-6 pt-4 pb-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-ink shrink-0">Saved Workouts</h2>
              <div className="flex items-center gap-2 shrink-0">
                {/* Filters button */}
                <button
                  onClick={() => setFilterOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                    filter !== 'all' || folderFilter !== 'all'
                      ? 'bg-brand text-[var(--color-action-dark)] border-transparent'
                      : 'bg-white/[0.06] border-white/10 text-ink-muted hover:bg-white/[0.09] hover:text-ink'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filters
                  {(filter !== 'all' || folderFilter !== 'all') && (
                    <span className="bg-black/20 text-[var(--color-action-dark)] text-xs font-bold px-1 rounded-full leading-none py-0.5">
                      {(filter !== 'all' ? 1 : 0) + (folderFilter !== 'all' ? 1 : 0)}
                    </span>
                  )}
                </button>
                <Button variant="dim" size="sm" onClick={() => document.getElementById("import-workout-input").click()}>
                  <Upload className="w-3.5 h-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
                <Button variant="dim" size="sm" onClick={() => setShowFormatGuide(true)} title="Import format guide">
                  <HelpCircle className="w-4 h-4" />
                </Button>
                <input
                  id="import-workout-input"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </div>
            </div>
          </div>

          {/* Expandable filter panel */}
          {filterOpen && (
            <div className="px-6 pb-4 border-t hairline pt-3 space-y-3">
              <div>
                <p className="section-label mb-2">Type</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'strength', label: 'Strength' },
                    { value: 'cardio', label: 'Cardio' },
                    { value: 'hiit', label: 'HIIT' },
                  ].map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFilter(f.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        filter === f.value
                          ? 'bg-brand text-[var(--color-action-dark)] font-bold'
                          : 'bg-white/[0.06] text-ink-muted hover:bg-white/[0.09]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {folders.length > 0 && (
                <div>
                  <p className="section-label mb-2">Folder</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['all', ...folders, 'unfiled'].map(f => {
                      if (f !== 'all' && f !== 'unfiled' && renamingFolder === f) {
                        return (
                          <form
                            key={f}
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (renameValue.trim() && renameValue.trim() !== f) {
                                renameFolderMutation.mutate({ oldName: f, newName: renameValue.trim() });
                              } else {
                                setRenamingFolder(null);
                              }
                            }}
                            className="flex items-center gap-1"
                          >
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="px-2 py-1 rounded-full text-xs font-semibold border border-brand/30 bg-white/[0.06] text-ink outline-none w-28"
                            />
                            <button type="submit" className="p-1 text-leaf hover:text-leaf">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => setRenamingFolder(null)} className="p-1 text-ink-muted hover:text-ink-muted">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        );
                      }
                      return (
                        <div key={f} className="flex items-center gap-0.5 group">
                          <button
                            onClick={() => setFolderFilter(f)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                              folderFilter === f
                                ? 'bg-brand text-[var(--color-action-dark)] font-bold'
                                : 'bg-white/[0.06] text-ink-muted hover:bg-white/[0.09]'
                            }`}
                          >
                            {f === 'all' && <FolderOpen className="w-3 h-3" />}
                            {f === 'all' ? 'All Folders' : f === 'unfiled' ? 'Unfiled' : f}
                          </button>
                          {f !== 'all' && f !== 'unfiled' && (
                            <button
                              onClick={() => { setRenamingFolder(f); setRenameValue(f); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-ink-muted hover:text-brand transition-opacity"
                              title="Rename folder"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="px-6 pb-6">
            <div className="pr-2">
              {workoutsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-28 rounded-xl animate-pulse bg-charcoal-elevated" />
                  ))}
                </div>
              ) : filteredWorkouts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredWorkouts.map((workout) => (
                    <WorkoutCard
                      key={workout.id}
                      workout={workout}
                      userId={user.id}
                      onEdit={handleEdit}
                      onClone={handleClone}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Zap className="w-10 h-10 text-ink-muted mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-ink mb-1">
                    No workouts yet
                  </h3>
                  <p className="text-sm text-ink-muted mb-4">
                    Create your own workouts or build a full program
                  </p>
                  {filter === "all" && (
                    <div className="flex justify-center gap-2">
                      <Link to="/create-workout">
                        <Button variant="primary">
                          <Plus className="w-4 h-4 mr-2" />
                          Create Custom
                        </Button>
                      </Link>
                      <Link to="/program-builder">
                        <Button variant="outline">
                          <BookOpen className="w-4 h-4 mr-2" />
                          Program Builder
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="programs">
            <div className="flex items-center justify-end gap-2 mb-4">
              <input
                ref={importProgramRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportProgram}
              />
              <Link to="/program-builder">
                <Button variant="primary">
                  <Plus className="w-4 h-4" />
                  Create Program
                </Button>
              </Link>
            </div>

            <Tabs defaultValue="active" className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="active">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Active
                  {activeEnrollments.length > 0 && (
                    <span className="ml-1.5 bg-brand/10 text-brand text-xs font-bold px-1.5 py-0.5 rounded-full">
                      {activeEnrollments.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="my-programs">
                  <BookOpen className="w-4 h-4 mr-2" />
                  My Programs
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active">
                {enrollmentsLoading ? (
                  <div className="flex justify-center py-12">
                    <LoadingSpinner />
                  </div>
                ) : activeEnrollments.length === 0 ? (
                  <ProgramsEmptyState
                    icon={TrendingUp}
                    title="No active programs"
                    subtitle="Start a program to track your progress with auto-progression"
                  />
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeEnrollments.map((enrollment) => (
                        <ProgramCard
                          key={enrollment.id}
                          program={enrollment.program || { id: enrollment.program_id, title: "Program" }}
                          enrollment={enrollment}
                        />
                      ))}
                    </div>
                    {pastEnrollments.length > 0 && (
                      <div>
                        <h3 className="section-label mb-3">
                          Past Programs
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {pastEnrollments.map((enrollment) => (
                            <ProgramCard
                              key={enrollment.id}
                              program={enrollment.program || { id: enrollment.program_id, title: "Program" }}
                              enrollment={enrollment}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="my-programs">
                {programsLoading ? (
                  <div className="flex justify-center py-12">
                    <LoadingSpinner />
                  </div>
                ) : programs.length === 0 ? (
                  <ProgramsEmptyState
                    icon={BookOpen}
                    title="No programs yet"
                    subtitle="Create a multi-week program with exercises, progression rules, and more"
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {programs.map((program) => (
                      <ProgramCard key={program.id} program={program} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="activity-log">
            <ActivityLogTab
              workoutLogs={workoutLogs}
              cardioSessions={cardioSessions}
              workouts={workouts}
              profile={profile}
              isLoading={activityLogLoading}
              error={activityLogError}
              onRetry={retryActivityLog}
            />
          </TabsContent>

        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Workout?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-ink">"{workoutToDelete?.title}"</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="glass-inset p-3 text-sm text-ink-muted">
            This will remove it from your library and any scheduled workouts. This action cannot be undone.
          </div>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setWorkoutToDelete(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              variant="destructive"
              className="flex-1"
            >
              Delete Workout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Workout Import Format Guide */}
      <Dialog open={showFormatGuide} onOpenChange={setShowFormatGuide}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Workout Import Format</DialogTitle>
            <DialogDescription>
              Save a <code className="text-xs bg-white/[0.08] px-1 rounded">.json</code> file matching this structure, then use the Import button to add it to your library.
            </DialogDescription>
          </DialogHeader>
          <pre className="glass-inset font-technical p-3 text-xs overflow-auto max-h-72 text-ink-muted text-left">{WORKOUT_TEMPLATE}</pre>
          <div className="text-xs text-ink-muted space-y-1 mt-1">
            <p><span className="font-semibold">type</span>: <code>strength</code>, <code>cardio</code>, or <code>hiit</code></p>
            <p><span className="font-semibold">reps</span>: number or range string like <code>"8-10"</code></p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                navigator.clipboard.writeText(WORKOUT_TEMPLATE);
                toast.success("Copied to clipboard");
              }}
            >
              <Copy className="w-4 h-4 mr-1.5" />
              Copy JSON
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                const blob = new Blob([WORKOUT_TEMPLATE], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "workout_template.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-4 h-4 mr-1.5" />
              Download Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function fmtPace(metersPerSecond, type, avgPaceSecPerKm) {
  // Use pre-computed pace from Garmin if available
  if (avgPaceSecPerKm && ['running', 'walking', 'hiking'].includes(type)) {
    const minPerMile = (avgPaceSecPerKm * 1.60934) / 60;
    const min = Math.floor(minPerMile);
    const sec = Math.round((minPerMile - min) * 60);
    return `${min}:${sec.toString().padStart(2, '0')} /mi`;
  }
  // Fallback: compute from speed
  if (!metersPerSecond || !['running', 'walking', 'hiking'].includes(type)) return null;
  const minPerMile = (1609.34 / metersPerSecond) / 60;
  const min = Math.floor(minPerMile);
  const sec = Math.round((minPerMile - min) * 60);
  return `${min}:${sec.toString().padStart(2, '0')} /mi`;
}

function fmtDistance(meters) {
  if (!meters) return null;
  const miles = meters / 1609.34;
  return miles >= 0.05 ? `${miles.toFixed(2)} mi` : null;
}

function dayLabel(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const fmt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  if (d.getTime() === today.getTime()) return `TODAY — ${fmt}`;
  if (d.getTime() === yesterday.getTime()) return `YESTERDAY — ${fmt}`;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
}

function groupByDay(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const label = dayLabel(entry.date);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(entry);
  }
  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

// ─── Stat block ──────────────────────────────────────────────────────────────

function StatBlock({ label, value, bordered }) {
  return (
    <div className={`flex-1 flex flex-col ${bordered ? 'border-l border-charcoal-border pl-6' : ''}`}>
      <span className="section-label">{label}</span>
      <span className="font-technical font-bold text-[17px] text-ink mt-1">{value ?? '—'}</span>
    </div>
  );
}

// ─── Entry cards ─────────────────────────────────────────────────────────────

function StrengthEntryCard({ entry }) {
  return (
    <div
      className="group relative overflow-hidden tile tile-interactive p-4"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="text-[15px] font-semibold text-ink">{entry.title}</h4>
          <p className="section-label mt-1">
            {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </p>
        </div>
      </div>
      <div className="flex">
        <StatBlock label="Exercises" value={entry.exerciseCount} />
        {entry.sets > 0 && <StatBlock label="Sets" value={entry.sets} bordered />}
        {entry.volume && <StatBlock label="Volume" value={`${Math.round(entry.volume).toLocaleString()} lbs`} bordered />}
        {entry.duration && <StatBlock label="Duration" value={`${entry.duration} min`} bordered />}
      </div>
    </div>
  );
}

function ActivityTypeIcon({ type, className = "w-4 h-4" }) {
  const props = { className };
  switch (type) {
    case 'running':    return <PersonStanding {...props} />;
    case 'swimming':   return <Waves {...props} />;
    case 'cycling':    return <Bike {...props} />;
    case 'walking':    return <Footprints {...props} />;
    case 'hiking':     return <Footprints {...props} />;
    case 'rowing':     return <Rows3 {...props} />;
    case 'elliptical': return <Repeat {...props} />;
    case 'strength':   return <Dumbbell {...props} />;
    default:           return <Activity {...props} />;
  }
}

function CardioEntryCard({ entry }) {
  const typeLabel = entry.activityType
    ? entry.activityType.charAt(0).toUpperCase() + entry.activityType.slice(1)
    : 'Cardio';
  const distance = fmtDistance(entry.distance);
  const duration = fmtDuration(entry.movingTime);
  const pace = fmtPace(entry.avgSpeed, entry.activityType, entry.avgPaceSecPerKm);

  return (
    <div className="tile tile-interactive">
      <div className="flex items-start p-4 pb-3 gap-3">
        <div className="w-9 h-9 rounded-full bg-carb/15 flex items-center justify-center shrink-0 text-carb">
          <ActivityTypeIcon type={entry.activityType} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[15px] font-semibold text-ink truncate">{entry.title}</h4>
          <p className="section-label mt-1">
            {typeLabel} · {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap px-4 pb-4 gap-y-2">
        {distance && <StatBlock label="Distance" value={distance} />}
        {duration && <StatBlock label="Time" value={duration} bordered={!!distance} />}
        {pace && <StatBlock label="Pace" value={pace} bordered />}
        {entry.avgHeartrate && (
          <div className={`flex-1 flex flex-col ${(distance || duration || pace) ? 'border-l border-charcoal-border pl-6' : ''}`}>
            <span className="section-label">Avg HR</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-technical font-bold text-[17px] text-ink">{Math.round(entry.avgHeartrate)}</span>
              <span className="text-[10px] text-ink-faint uppercase">bpm</span>
            </div>
          </div>
        )}
        {entry.aerobicEffect != null && (
          <div className="flex-1 flex flex-col border-l border-charcoal-border pl-6">
            <span className="section-label">Aerobic Effect</span>
            <span className="font-technical font-bold text-[17px] text-ink mt-1">{Number(entry.aerobicEffect).toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Log Tab ────────────────────────────────────────────────────────

function ActivityLogTab({ workoutLogs, cardioSessions, workouts, profile, isLoading, error, onRetry }) {
  const [filter, setFilter] = useState('all');

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass px-4 py-8 text-center">
        <AlertTriangle className="w-10 h-10 text-warn mx-auto mb-3" />
        <h3 className="text-base font-semibold text-ink mb-1">Couldn't load your activity</h3>
        <p className="text-sm text-ink-muted mb-4">Something went wrong fetching your workout history.</p>
        <Button variant="outline" onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  const strengthEntries = workoutLogs.map(log => {
    const workout = workouts.find(w => w.id === log.workout_id);
    const logExercises = log.exercises || [];
    const totalSets = logExercises.reduce((sum, ex) => {
      if (Array.isArray(ex.sets)) return sum + ex.sets.length;
      return sum + (Number(ex.sets) || 0);
    }, 0);
    const totalVolume = logExercises.reduce((sum, ex) => {
      if (!Array.isArray(ex.sets)) return sum;
      return sum + ex.sets.reduce((s, set) => s + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
    }, 0);
    return {
      type: 'strength',
      id: log.id,
      date: log.log_date ? parseISO(log.log_date) : new Date(log.created_at),
      title: workout?.title || 'Workout',
      exerciseCount: logExercises.length,
      exercises: logExercises,
      sets: totalSets,
      duration: log.duration_seconds ? Math.round(log.duration_seconds / 60) : null,
      volume: totalVolume > 0 ? totalVolume : null,
    };
  });

  const cardioEntries = cardioSessions.map(session => ({
    type: 'cardio',
    id: session.id,
    date: parseISO(session.activity_date),
    title: session.name || session.activity_type,
    activityType: session.activity_type,
    distance: session.distance_meters,
    movingTime: session.duration_seconds,
    avgSpeed: session.avg_speed_mps,
    avgPaceSecPerKm: session.avg_pace_sec_per_km,
    avgHeartrate: session.avg_hr,
    trainingLoad: session.training_load,
    aerobicEffect: session.aerobic_effect,
    rawSession: session,
  }));

  const allEntries = [
    ...(filter !== 'cardio' ? strengthEntries : []),
    ...(filter !== 'strength' ? cardioEntries : []),
  ].sort((a, b) => b.date - a.date);

  // Weekly summary (last 7 days)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  const thisWeek = allEntries.filter(e => e.date >= cutoff);
  const weekStrength = thisWeek.filter(e => e.type === 'strength').length;
  const weekCardio = thisWeek.filter(e => e.type === 'cardio').length;
  const weekMiles = thisWeek
    .filter(e => e.type === 'cardio' && e.distance)
    .reduce((sum, e) => sum + e.distance / 1609.34, 0);

  const grouped = groupByDay(allEntries);

  return (
    <>
      {/* Weekly Summary */}
      <div className="grid grid-cols-4 gap-0 p-4 surface mb-6 divide-x divide-[var(--color-border)]">
        <div className="flex flex-col pr-4">
          <span className="section-label mb-1.5">This Week</span>
          <span className="font-technical font-extrabold text-xl text-teal">{thisWeek.length}<span className="text-[11px] font-semibold text-ink-faint ml-1">sess</span></span>
        </div>
        <div className="flex flex-col px-4">
          <span className="section-label mb-1.5">Strength</span>
          <span className="font-technical font-bold text-xl text-ink">{weekStrength}</span>
        </div>
        <div className="flex flex-col px-4">
          <span className="section-label mb-1.5">Cardio</span>
          <span className="font-technical font-bold text-xl text-ink">{weekCardio}</span>
        </div>
        <div className="flex flex-col pl-4">
          <span className="section-label mb-1.5">Distance</span>
          <span className="font-technical font-bold text-xl text-ink">
            {weekMiles > 0 ? weekMiles.toFixed(1) : '—'}<span className="text-[11px] font-semibold text-ink-faint ml-1">mi</span>
          </span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-6">
        {[['all', 'All'], ['strength', 'Strength'], ['cardio', 'Cardio']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={[
              'px-3.5 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-[0.08em] transition-all',
              filter === val
                ? 'bg-brand text-[var(--color-action-dark)]'
                : 'bg-white/[0.06] border border-white/10 text-ink-muted hover:bg-white/[0.09] hover:text-ink',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {allEntries.length === 0 ? (
        <div className="glass px-4 py-8 text-center">
          <Activity className="w-10 h-10 text-ink-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-ink mb-1">No activity yet</h3>
          <p className="text-sm text-ink-muted mb-2">
            {filter === 'cardio'
              ? 'Cardio sessions sync automatically from Garmin each morning.'
              : filter === 'strength'
              ? 'Complete a workout to see it here.'
              : 'Complete workouts — cardio syncs from Garmin overnight.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ label, entries }) => (
            <section key={label}>
              <h3 className="section-label mb-3">{label}</h3>
              <div className="space-y-3">
                {entries.map(entry =>
                  entry.type === 'strength' ? (
                    <StrengthEntryCard key={entry.id} entry={entry} />
                  ) : (
                    <CardioEntryCard
                      key={entry.id}
                      entry={entry}
                    />
                  )
                )}
              </div>
            </section>
          ))}
        </div>
      )}

    </>
  );
}

function ProgramsEmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="glass px-4 py-8 text-center">
      <Icon className="w-10 h-10 text-ink-muted mx-auto mb-3" />
      <h3 className="text-base font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-muted mb-4">{subtitle}</p>
      {action}
    </div>
  );
}