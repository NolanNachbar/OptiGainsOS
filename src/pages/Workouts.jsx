import { useState, useRef } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { queryKeys, invalidateReactions, invalidateWorkouts, invalidateSchedule, invalidateWorkoutLogs } from "@/lib/queryKeys";
import { useProfile } from "@/hooks/useUserQueries";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMyPrograms, useEnrollments } from "@/hooks/useProgramQueries";
import ProgramCard from "@/components/programs/ProgramCard";
import { TabCount } from "@/components/ui/system";
import { PageHeader } from "@/components/ui";
import { Calendar, Plus, Dumbbell, BookOpen, TrendingUp, FolderOpen, Upload, HelpCircle, Copy, Download, Activity, SlidersHorizontal, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { parseISO } from "date-fns";
import { parseProgramJson } from "@/utils/programIO";
import { toast } from "sonner";
import WorkoutCard from "@/components/workouts/WorkoutCard";
import { filterPill } from "@/components/workouts/filterPill";
import { ActivityLogTab, LibraryBuildPrompt, ProgramsEmptyState } from "@/components/workouts/activity/ActivityLogTab";



// One filter-pill recipe shared across Library (Type, Folder) and Activity so the
// three selectors read as one family: same shape, same neutral selected fill
// (bg-track + ink), same motion. Teal never enters a filter pill — selection is a
// neutral state change, not an action.
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
      toast.success('Workout cloned.');
      navigate(`/create-workout?edit=${clonedWorkout.id}`);
    },
    onError: (error) => {
      toast.error('Workout not cloned. Try again.');
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
      toast.success('Workout deleted.');
    },
    onError: (error) => {
      toast.error('Workout not deleted. Try again.');
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
      toast.success("Folder renamed.");
    },
    onError: () => toast.error("Folder not renamed. Try again."),
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
        toast.success(`"${data.title}" imported to your library.`);
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
        toast.error(err.message || 'Could not read the JSON file. Check the file and try again.');
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
          <PageHeader
            className="px-0 pt-0 mb-4 max-lg:[&_h1]:hidden"
            title="Workouts"
            meta="Library and session history"
            action={
              <div className="flex items-center gap-2">
                <Link to="/weekly-schedule">
                  <Button variant="dim" size="sm" className="gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Weekly Schedule
                  </Button>
                </Link>
                <Link to={"/create-workout"}>
                  <Button size="sm">
                    <Plus className="w-3.5 h-3.5" />
                    Create Custom
                  </Button>
                </Link>
              </div>
            }
          />
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
                className={`px-3 ${filter !== 'all' || folderFilter !== 'all' ? 'bg-[var(--color-border)] text-ink' : ''}`}
                onClick={() => setFilterOpen(v => !v)}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filters
                {(filter !== 'all' || folderFilter !== 'all') && (
                  <span className="bg-track text-ink-secondary text-caption font-bold px-1.5 rounded-full leading-none py-0.5 font-technical">
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
                <p className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted mb-2">Type</p>
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
                  <p className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted mb-2">Folder</p>
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
                              className="px-3 h-11 rounded-full text-xs font-semibold border border-charcoal-border bg-charcoal-surface2 rounded-control text-ink outline-none w-28"
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
                    <div key={i} className="h-28 rounded-control bg-track pulse-loop" />
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
                        Show {Math.min(8, remainingWorkouts)} more
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
              <div className="inline-flex gap-1 p-1 bg-charcoal-surface2 rounded-control rounded-full min-w-0 overflow-x-auto">
                {[
                  { value: 'active', label: 'Active', icon: TrendingUp, count: activeEnrollments.length },
                  { value: 'my-programs', label: 'My Programs', icon: BookOpen, count: null },
                ].map(({ value, label, icon: Icon, count }) => (
                  <button
                    key={value}
                    onClick={() => setProgramView(value)}
                    aria-pressed={programView === value}
                    className={`flex items-center gap-1.5 px-3 min-h-[44px] rounded-full text-caption font-bold uppercase tracking-[0.06em] whitespace-nowrap transition-colors duration-200 ease-[var(--ease)] active:scale-[0.97] ${
                      programView === value
                        ? 'bg-track text-ink'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {count > 0 && (
                      <span className="font-technical text-caption opacity-70">{count}</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Compact teal create — sits in the nav row, not floating. Hidden
                  when the active view already shows a teal 'Build a Program'. */}
              {!showsBuildCta && (
                <Button asChild variant="primary" size="icon" className="ml-auto shrink-0 h-11 w-11 rounded-full" aria-label="Create program">
                  <Link to="/program-builder">
                    <Plus className="w-5 h-5" />
                  </Link>
                </Button>
              )}
            </div>

            {programView === 'active' && (
              enrollmentsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map(i => (
                    <div key={i} className="h-40 rounded-control bg-track pulse-loop" />
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
                        Build a program
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
                            Build a program
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
                      <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted mb-3">
                        Past programs
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
                    <div key={i} className="h-40 rounded-control bg-track pulse-loop" />
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
                        Build a program
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
          <div className="bg-charcoal-surface2 rounded-control p-3 text-sm text-ink-muted">
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
              Save a <code className="text-xs bg-charcoal-surface2 rounded-control px-1 rounded">.json</code> file matching this structure, then use the Import button to add it to your library.
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-charcoal-surface2 rounded-control font-technical p-3 text-xs overflow-auto max-h-72 text-ink-muted text-left">{WORKOUT_TEMPLATE}</pre>
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
                toast.success("Copied.");
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
