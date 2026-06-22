import { useState, useRef } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { queryKeys, invalidateReactions, invalidateWorkouts, invalidateSchedule, invalidateWorkoutLogs } from "@/lib/queryKeys";
import { useProfile } from "@/hooks/useUserQueries";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { useMyPrograms, useEnrollments } from "@/hooks/useProgramQueries";
import ProgramCard from "@/components/programs/ProgramCard";
import { TabCount } from "@/components/ui/system";
import { Calendar, Plus, Dumbbell, BookOpen, TrendingUp, FolderOpen, ThumbsUp, Upload, HelpCircle, Copy, Download, Activity, Link2, SlidersHorizontal, Pencil, Check, X, Waves, Bike, Footprints, Rows3, Repeat, AlertTriangle } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { parseISO } from "date-fns";

import { parseProgramJson } from "@/utils/programIO";
import { toast } from "sonner";
import WorkoutCard from "@/components/workouts/WorkoutCard";

// One filter-pill recipe shared across Library (Type, Folder) and Activity so the
// three selectors read as one family: same shape, same neutral selected fill
// (bg-track + ink), same motion. Teal never enters a filter pill — selection is a
// neutral state change, not an action.
const FILTER_PILL_BASE =
  "px-3.5 min-h-[44px] rounded-full text-[11px] font-bold tracking-[0.06em] uppercase transition-colors duration-200 ease-[var(--ease)] active:scale-[0.97]";
const filterPill = (active) =>
  `${FILTER_PILL_BASE} ${active ? "glass-inset bg-track text-ink" : "glass-inset text-ink-muted hover:text-ink"}`;

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
  const [libraryVisible, setLibraryVisible] = useState(5);
  const [programView, setProgramView] = useState("active");
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

  // True when the currently-visible Programs view already surfaces a teal
  // 'Build a Program' CTA, so the top-right teal '+' create is suppressed and
  // the empty view never shows two teal-fill create controls (train-programs-2).
  const showsBuildCta =
    (programView === 'active' && !enrollmentsLoading && activeEnrollments.length === 0) ||
    (programView === 'my-programs' && !programsLoading && programs.length === 0);

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
          toast.error("Invalid workout file, missing title or exercises.");
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

  const isQaSeed = (w) => /qa\s*test\s*workout/i.test(w.title || "");

  const filteredWorkouts = workouts
    .filter(workout => {
      // Type/category filter
      if (filter !== "all" && workout.focus !== filter) return false;

      // Folder filter
      if (folderFilter !== "all") {
        if (folderFilter === "unfiled") return !workout.folder;
        if (workout.folder !== folderFilter) return false;
      }

      return true;
    })
    // Demote the QA Test Workout seed to the bottom of the library so it never
    // crowds the top of the list.
    .sort((a, b) => (isQaSeed(a) ? 1 : 0) - (isQaSeed(b) ? 1 : 0));

  const visibleWorkouts = filteredWorkouts.slice(0, libraryVisible);
  const remainingWorkouts = filteredWorkouts.length - libraryVisible;

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
                  <TabCount>{workoutLogs.length + cardioSessions.length}</TabCount>
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
        <div className="mb-6">
          <div className="pb-2">
            {/* One control cluster: Filters · Import · help, no wide gap. */}
            <div className="flex items-center gap-2">
              {/* Filters — stays dim both states; an active filter signals via a
                  neutral edge fill + ink, never a brand tint (a second action
                  color would be drift). */}
              <Button
                variant="dim"
                size="lg"
                className={`px-3 ${filter !== 'all' || folderFilter !== 'all' ? 'bg-[var(--glass-edge)] text-ink' : ''}`}
                onClick={() => setFilterOpen(v => !v)}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {(filter !== 'all' || folderFilter !== 'all') && (
                  <span className="bg-track text-ink-secondary text-[11px] font-bold px-1.5 rounded-full leading-none py-0.5 font-technical">
                    {(filter !== 'all' ? 1 : 0) + (folderFilter !== 'all' ? 1 : 0)}
                  </span>
                )}
              </Button>
              <Button variant="dim" size="lg" className="px-3 ml-auto" onClick={() => document.getElementById("import-workout-input").click()}>
                <Upload className="w-3.5 h-3.5" />
                Import
              </Button>
              <Button variant="plain" size="icon" className="h-11 w-11 -ml-1 text-ink-faint hover:text-ink" onClick={() => setShowFormatGuide(true)} aria-label="Import file format guide" title="Import file format guide">
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

          {/* Expandable filter panel */}
          {filterOpen && (
            <div className="rise-in pb-4 border-t hairline pt-3 space-y-3">
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
                      className={filterPill(filter === f.value)}
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
                              className="px-3 h-11 rounded-full text-xs font-semibold border border-charcoal-border glass-inset text-ink outline-none w-28"
                            />
                            <button type="submit" aria-label="Save folder name" className="h-11 w-11 flex items-center justify-center rounded-full text-brand hover:text-brand active:scale-[0.97]">
                              <Check className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setRenamingFolder(null)} aria-label="Cancel rename" className="h-11 w-11 flex items-center justify-center rounded-full text-ink-muted hover:text-ink active:scale-[0.97]">
                              <X className="w-4 h-4" />
                            </button>
                          </form>
                        );
                      }
                      return (
                        <div key={f} className="flex items-center gap-0.5 group">
                          <button
                            onClick={() => setFolderFilter(f)}
                            className={`flex items-center gap-1 ${filterPill(folderFilter === f)}`}
                          >
                            {f === 'all' && <FolderOpen className="w-3 h-3" />}
                            {f === 'all' ? 'All Folders' : f === 'unfiled' ? 'Unfiled' : f}
                          </button>
                          {f !== 'all' && f !== 'unfiled' && (
                            <button
                              onClick={() => { setRenamingFolder(f); setRenameValue(f); }}
                              className="h-11 w-11 flex items-center justify-center rounded-full text-ink-muted hover:text-brand transition-colors active:scale-[0.97] md:opacity-0 md:group-hover:opacity-100"
                              aria-label={`Rename folder ${f}`}
                              title="Rename folder"
                            >
                              <Pencil className="w-3.5 h-3.5" />
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
          <div className="pb-[var(--dock-clearance)] md:pb-6">
            <div>
              {workoutsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-28 rounded-xl bg-track pulse-loop" />
                  ))}
                </div>
              ) : filteredWorkouts.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                    {visibleWorkouts.map((workout, i) => (
                      <WorkoutCard
                        key={workout.id}
                        workout={workout}
                        userId={user.id}
                        index={i}
                        onEdit={handleEdit}
                        onClone={handleClone}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                  {remainingWorkouts > 0 ? (
                    <div className="flex justify-center mt-6">
                      <Button variant="dim" size="sm" className="min-h-[44px] active:scale-[0.97]" onClick={() => setLibraryVisible(v => v + 8)}>
                        Show <span className="font-technical mx-1">{Math.min(8, remainingWorkouts)}</span> more
                        <span className="ml-1.5 text-ink-faint font-technical">· {remainingWorkouts} left</span>
                      </Button>
                    </div>
                  ) : (
                    /* All workouts shown — a compact inline build prompt (single
                       hairline row) rather than the heavy empty-state card, so a
                       short-but-non-empty library doesn't get a big void card
                       under it. The full LibraryBuildPrompt is reserved for the
                       truly-empty case below. Tight pt/pb keep the void under the
                       last card under ~150px; both actions clear the 44px tap
                       floor and teal lands only on Create Custom. */
                    <div className="mt-6 border-t hairline pt-4 flex flex-wrap items-center justify-center gap-2 pb-2">
                      <p className="text-sm text-ink-muted w-full text-center mb-1">Build out your library</p>
                      <Link to="/create-workout">
                        <Button variant="primary" size="lg" className="min-h-[44px] active:scale-[0.97]">
                          <Plus className="w-4 h-4" />
                          Create Custom
                        </Button>
                      </Link>
                      <Link to="/program-builder">
                        <Button variant="outline" size="lg" className="min-h-[44px] active:scale-[0.97]">
                          <BookOpen className="w-4 h-4" />
                          Program Builder
                        </Button>
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <LibraryBuildPrompt
                  title="No workouts yet"
                  subtitle="Create your own workouts or build a full program"
                  showActions={filter === "all"}
                />
              )}
            </div>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="programs">
            <input
              ref={importProgramRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportProgram}
            />
            {/* Single nav row: a subordinate segmented section strip + a compact
                Create action. The two views (Active / My Programs) read as ONE
                quiet inset strip (a section selector), not two loud standalone
                pills competing with the page's content. The top-right teal '+'
                is suppressed whenever the visible view already offers a teal
                'Build a Program' CTA, so the empty Programs view never shows two
                teal-fill create controls. */}
            <div className="flex items-center gap-2 mb-6">
              <div className="inline-flex gap-1 p-1 glass-inset rounded-full min-w-0 overflow-x-auto">
                {[
                  { value: 'active', label: 'Active', icon: TrendingUp, count: activeEnrollments.length },
                  { value: 'my-programs', label: 'My Programs', icon: BookOpen, count: null },
                ].map(({ value, label, icon: Icon, count }) => (
                  <button
                    key={value}
                    onClick={() => setProgramView(value)}
                    aria-pressed={programView === value}
                    className={`flex items-center gap-1.5 px-3 min-h-[40px] rounded-full text-[11px] font-bold uppercase tracking-[0.06em] whitespace-nowrap transition-colors duration-200 ease-[var(--ease)] active:scale-[0.97] ${
                      programView === value
                        ? 'bg-track text-ink'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {count > 0 && (
                      <span className="font-technical text-[11px] opacity-70">{count}</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Compact teal create — sits in the nav row, not floating. Hidden
                  when the active view already shows a teal 'Build a Program'. */}
              {!showsBuildCta && (
                <Link to="/program-builder" className="ml-auto shrink-0">
                  <Button variant="primary" size="icon" className="h-11 w-11 rounded-full" aria-label="Create program">
                    <Plus className="w-5 h-5" />
                  </Button>
                </Link>
              )}
            </div>

            {programView === 'active' && (
              enrollmentsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map(i => (
                    <div key={i} className="h-40 rounded-xl bg-track pulse-loop" />
                  ))}
                </div>
              ) : activeEnrollments.length === 0 && pastEnrollments.length === 0 ? (
                <ProgramsEmptyState
                  icon={TrendingUp}
                  title="No active programs"
                  subtitle="Start a program to track your progress with auto-progression"
                  action={
                    <Link to="/program-builder">
                      <Button variant="primary" className="min-h-[44px] active:scale-[0.97]">
                        <Plus className="w-4 h-4 mr-2" />
                        Build a Program
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-6 pb-[var(--dock-clearance)] md:pb-6">
                  {activeEnrollments.length === 0 ? (
                    <ProgramsEmptyState
                      icon={TrendingUp}
                      title="No active programs"
                      subtitle="Start a program to track your progress with auto-progression"
                      action={
                        <Link to="/program-builder">
                          <Button variant="primary" className="min-h-[44px] active:scale-[0.97]">
                            <Plus className="w-4 h-4 mr-2" />
                            Build a Program
                          </Button>
                        </Link>
                      }
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeEnrollments.map((enrollment, i) => (
                        <ProgramCard
                          key={enrollment.id}
                          program={enrollment.program || { id: enrollment.program_id, title: "Program" }}
                          enrollment={enrollment}
                          index={i}
                        />
                      ))}
                    </div>
                  )}
                  {/* Past Programs is its own section, no longer nested inside
                      the active-cards branch. */}
                  {pastEnrollments.length > 0 && (
                    <div>
                      <h3 className="section-label mb-3">
                        Past Programs
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pastEnrollments.map((enrollment, i) => (
                          <ProgramCard
                            key={enrollment.id}
                            program={enrollment.program || { id: enrollment.program_id, title: "Program" }}
                            enrollment={enrollment}
                            index={i}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {programView === 'my-programs' && (
              programsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map(i => (
                    <div key={i} className="h-40 rounded-xl bg-track pulse-loop" />
                  ))}
                </div>
              ) : programs.length === 0 ? (
                <ProgramsEmptyState
                  icon={BookOpen}
                  title="No programs yet"
                  subtitle="Create a multi-week program with exercises, progression rules, and more"
                  action={
                    <Link to="/program-builder">
                      <Button variant="primary" className="min-h-[44px] active:scale-[0.97]">
                        <Plus className="w-4 h-4 mr-2" />
                        Build a Program
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-[var(--dock-clearance)] md:pb-6">
                  {programs.map((program, i) => (
                    <ProgramCard key={program.id} program={program} index={i} />
                  ))}
                </div>
              )
            )}
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
          <div className="flex gap-4 mt-2">
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
              Save a <code className="text-xs glass-inset px-1 rounded">.json</code> file matching this structure, then use the Import button to add it to your library.
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
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
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
  if (d.getTime() === today.getTime()) return `TODAY, ${fmt}`;
  if (d.getTime() === yesterday.getTime()) return `YESTERDAY, ${fmt}`;
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

// ─── Entry cards ─────────────────────────────────────────────────────────────

function StrengthEntryCard({ entry }) {
  // ONE dominant datum (train-activity-3): the heaviest signal of the session
  // (Volume when logged, else Sets, else Exercises) reads as a hero figure in
  // the header; everything else is a subordinate caption. Below it, a STABLE
  // 4-cell scaffold (train-activity-5) — Exercises / Sets / Volume / Duration
  // always render in the same columns, missing values shown as a faint em-dash —
  // so today's freshly-logged entry never reflows as stats fill in.
  const hero = entry.volume
    ? { label: 'Volume', value: Math.round(entry.volume).toLocaleString(), suffix: 'lbs' }
    : entry.sets > 0
      ? { label: 'Sets', value: entry.sets }
      : { label: 'Exercises', value: entry.exerciseCount };

  const cells = [
    { label: 'Exercises', value: entry.exerciseCount || '—' },
    { label: 'Sets', value: entry.sets > 0 ? entry.sets : '—' },
    { label: 'Volume', value: entry.volume ? Math.round(entry.volume).toLocaleString() : '—', suffix: entry.volume ? 'lbs' : null },
    { label: 'Duration', value: entry.duration || '—' },
  ];

  const body = (
    <>
      <div className="flex items-center p-4 pb-3 gap-3">
        <div className="w-9 h-9 rounded-full bg-track flex items-center justify-center shrink-0 text-ink-muted">
          <Dumbbell className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[15px] font-semibold text-ink truncate">{entry.title}</h4>
          <span className="section-label">{hero.label}</span>
        </div>
        {/* Dominant figure — the row's one hero metric. */}
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="font-technical font-extrabold text-[24px] leading-none text-ink whitespace-nowrap">{hero.value}</span>
          {hero.suffix && <span className="text-[10px] text-ink-muted uppercase">{hero.suffix}</span>}
        </div>
      </div>
      {/* Stable 4-cell scaffold. Dividers derive from grid position so a wrapped
          row never leaves an orphaned left hairline. Subordinate to the hero:
          smaller values, so the header figure stays dominant. */}
      <div className="grid grid-cols-4 gap-y-3 px-4 pb-4 border-t hairline pt-3">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={`flex flex-col ${i % 4 !== 0 ? 'border-l hairline pl-4' : ''}`}
          >
            <span className="section-label">{cell.label}</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className={`font-technical font-bold text-[15px] whitespace-nowrap ${cell.value === '—' ? 'text-ink-faint' : 'text-ink-secondary'}`}>{cell.value}</span>
              {cell.suffix && <span className="text-[10px] text-ink-muted uppercase">{cell.suffix}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
  // Only link when the source workout still exists; otherwise render a static,
  // de-emphasised tile so it doesn't read as a tappable button.
  if (entry.workoutId) {
    return (
      <Link
        to={`/workout-detail?id=${entry.workoutId}`}
        className="block relative overflow-hidden tile tile-interactive transition-transform duration-200 ease-[var(--ease)] active:scale-[0.99]"
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="relative overflow-hidden tile">
      {body}
    </div>
  );
}

function ActivityTypeIcon({ type, className = "w-4 h-4" }) {
  const props = { className };
  switch (type) {
    case 'running':    return <Footprints {...props} />;
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

  // ONE dominant datum to mirror the strength row (train-activity-3): Distance
  // leads when present, else Time, else Avg HR. The rest become subordinate cells.
  const hero = distance
    ? { label: typeLabel, value: distance }
    : duration
      ? { label: typeLabel, value: duration }
      : entry.avgHeartrate
        ? { label: typeLabel, value: Math.round(entry.avgHeartrate), suffix: 'bpm' }
        : { label: typeLabel, value: '—' };

  // Build only the cells we have, then drive dividers off grid position so a
  // 3-col grid never leaves orphaned left hairlines on wrapped rows.
  const cells = [];
  if (duration) cells.push({ label: 'Time', value: duration });
  if (pace) cells.push({ label: 'Pace', value: pace });
  if (entry.avgHeartrate) cells.push({ label: 'Avg HR', value: Math.round(entry.avgHeartrate), suffix: 'bpm' });
  if (entry.aerobicEffect != null) cells.push({ label: 'Aerobic Effect', value: Number(entry.aerobicEffect).toFixed(1) });

  return (
    <div className="tile">
      <div className="flex items-center p-4 pb-3 gap-3">
        <div className="w-9 h-9 rounded-full bg-carb/15 flex items-center justify-center shrink-0 text-carb">
          <ActivityTypeIcon type={entry.activityType} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[15px] font-semibold text-ink truncate">{entry.title}</h4>
          <p className="section-label">{hero.label}</p>
        </div>
        {/* Dominant figure — the row's one hero metric. */}
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="font-technical font-extrabold text-[24px] leading-none text-ink whitespace-nowrap">{hero.value}</span>
          {hero.suffix && <span className="text-[10px] text-ink-muted uppercase">{hero.suffix}</span>}
        </div>
      </div>

      {cells.length > 0 && (
        <div className="grid grid-cols-3 gap-y-3 px-4 pb-4 border-t hairline pt-3">
          {cells.map((cell, i) => (
            <div
              key={cell.label}
              className={`flex flex-col ${i % 3 !== 0 ? 'border-l hairline pl-4' : ''}`}
            >
              <span className="section-label">{cell.label}</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="font-technical font-bold text-[15px] text-ink-secondary">{cell.value}</span>
                {cell.suffix && <span className="text-[10px] text-ink-muted uppercase">{cell.suffix}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Activity Log Tab ────────────────────────────────────────────────────────

function ActivityLogTab({ workoutLogs, cardioSessions, workouts, profile, isLoading, error, onRetry }) {
  const [filter, setFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(8);

  if (isLoading) {
    // Skeletons mirror the real surfaces they stand in for: the weekly summary is
    // .glass-elevated, each entry is a .tile (train-activity-4) — not raw bg-track
    // boxes — so the loading state reads as the page's own scaffold dimming in.
    return (
      <div className="space-y-3">
        <div className="h-20 glass-elevated rounded-[20px] pulse-loop" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 tile pulse-loop" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="tile px-4 py-8 text-center">
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
    // Distinct titles: when the source workout is gone (or never had a name),
    // derive a title from the logged content (lead exercise + count) so stacked
    // rows don't all read as the generic 'Workout'.
    const leadExercise = logExercises[0]?.name;
    const derivedTitle = leadExercise
      ? `${leadExercise}${logExercises.length > 1 ? ` +${logExercises.length - 1}` : ''}`
      : 'Strength session';
    return {
      type: 'strength',
      id: log.id,
      workoutId: log.workout_id || null,
      date: log.log_date ? parseISO(log.log_date) : new Date(log.created_at),
      title: workout?.title || derivedTitle,
      exerciseCount: logExercises.length,
      exercises: logExercises,
      sets: totalSets,
      // Guard implausible timer data (< 2 min or > 5 h) before surfacing it.
      duration:
        log.duration_seconds && log.duration_seconds >= 120 && log.duration_seconds <= 18000
          ? fmtDuration(log.duration_seconds)
          : null,
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

  const grouped = groupByDay(allEntries.slice(0, visibleCount));

  return (
    <>
      {/* Weekly Summary — elevated above the tile feed so it reads as a header,
          not just another entry. */}
      <div className="flex items-stretch gap-4 p-4 glass-elevated rounded-[20px] mb-4">
        {/* Hero: This Week */}
        <div className="flex flex-col justify-center shrink-0 pr-4 border-r hairline">
          <span className="section-label mb-1">This Week</span>
          <span className="hero-metric text-[34px] text-ink">
            {thisWeek.length}<span className="text-[12px] font-semibold text-ink-muted ml-1 align-baseline">sess</span>
          </span>
        </div>
        {/* Secondary cells — no redundant 'sess' suffix (the hero owns the unit). */}
        <div className="flex-1 grid grid-cols-3 gap-3">
          <div className="flex flex-col justify-center">
            <span className="section-label mb-0.5">Strength</span>
            <span className="font-technical font-bold text-[17px] text-ink">{weekStrength}</span>
          </div>
          <div className="flex flex-col justify-center">
            <span className="section-label mb-0.5">Cardio</span>
            <span className="font-technical font-bold text-[17px] text-ink">{weekCardio}</span>
          </div>
          <div className="flex flex-col justify-center">
            <span className="section-label mb-0.5">Distance</span>
            <span className="font-technical font-bold text-[17px] text-ink">
              {weekMiles > 0 ? weekMiles.toFixed(1) : 0}<span className="text-[12px] font-semibold text-ink-muted ml-1 align-baseline">mi</span>
            </span>
          </div>
        </div>
      </div>

      {/* Filter pills — one non-wrapping row preceding the feed. */}
      <div className="flex flex-nowrap gap-2 mb-4 overflow-x-auto no-scrollbar">
        {[['all', 'All'], ['strength', 'Strength'], ['cardio', 'Cardio']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`shrink-0 ${filterPill(filter === val)}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {allEntries.length === 0 ? (
        <div className="tile px-4 py-8 text-center">
          <Activity className="w-10 h-10 text-ink-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-ink mb-1">No activity yet</h3>
          <p className="text-sm text-ink-muted mb-2">
            {filter === 'cardio'
              ? 'Cardio sessions sync automatically from Garmin each morning.'
              : filter === 'strength'
              ? 'Complete a workout to see it here.'
              : 'Complete workouts, cardio syncs from Garmin overnight.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-[var(--dock-clearance)] md:pb-6">
          {grouped.map(({ label, entries }, i) => (
            // Stagger the first few day groups so the feed cascades in on
            // var(--ease) rather than landing all at once.
            <section key={label} className={`${['rise-in', 'rise-in-2', 'rise-in-3'][Math.min(i, 2)]} ${i > 0 ? 'border-t hairline pt-3' : ''}`}>
              {/* Day header — its own tier (heavier + brighter) so it reads above
                  the in-card stat captions that share .section-label. */}
              <h3 className="section-label !font-extrabold text-ink mb-2.5">{label}</h3>
              <div className="space-y-2">
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
          {allEntries.length > visibleCount && (
            <div className="flex justify-center pt-4">
              <Button variant="dim" size="lg" className="min-h-[44px] active:scale-[0.97]" onClick={() => setVisibleCount(v => v + 8)}>
                Load <span className="font-technical mx-1">{Math.min(8, allEntries.length - visibleCount)}</span> more
                <span className="ml-1.5 text-ink-faint font-technical">· {allEntries.length - visibleCount} left</span>
              </Button>
            </div>
          )}
        </div>
      )}

    </>
  );
}

// One shared build-out prompt for the Library tab: the same glass card and
// action pair backs both the empty state and the all-shown "fill the void"
// prompt, so the two read as one unit instead of two near-twins.
function LibraryBuildPrompt({ title, subtitle, showActions = true }) {
  return (
    <div className="glass px-4 py-12 text-center">
      <div className="w-14 h-14 rounded-full bg-track flex items-center justify-center mx-auto mb-4">
        <Dumbbell className="w-7 h-7 text-ink-muted" />
      </div>
      <h3 className="text-base font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-muted mb-5 max-w-xs mx-auto">{subtitle}</p>
      {showActions && (
        <div className="flex justify-center gap-2">
          <Link to="/create-workout">
            <Button variant="primary" className="min-h-[44px] active:scale-[0.97]">
              <Plus className="w-4 h-4 mr-2" />
              Create Custom
            </Button>
          </Link>
          <Link to="/program-builder">
            <Button variant="outline" className="min-h-[44px] active:scale-[0.97]">
              <BookOpen className="w-4 h-4 mr-2" />
              Program Builder
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function ProgramsEmptyState({ icon: Icon, title, subtitle, action }) {
  // A self-sized empty card (no forced viewport-height floor): icon, copy, and
  // the action stack together with even spacing so the card reads as one compact
  // prompt instead of a tall band with the CTA stranded at the bottom edge. Rises
  // in on the system easing.
  return (
    <div className="rise-in glass px-4 py-12 text-center flex flex-col items-center">
      <div className="w-14 h-14 rounded-full bg-track flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7 text-ink-muted" />
      </div>
      <h3 className="text-base font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-secondary max-w-xs mx-auto">{subtitle}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}