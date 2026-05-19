import { useState, useRef, lazy, Suspense } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingScreen, LoadingSpinner } from "@/components/ui/loading-spinner";
import { queryKeys, invalidateReactions, invalidateWorkouts, invalidateSchedule, invalidateWorkoutLogs } from "@/lib/queryKeys";
import { useProfile } from "@/hooks/useUserQueries";
import { useExerciseReactions } from "@/hooks/useExerciseReactions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { useMyPrograms, useEnrollments } from "@/hooks/useProgramQueries";
import ProgramCard from "@/components/programs/ProgramCard";
import { Zap, Plus, Save, Dumbbell, BookOpen, TrendingUp, FolderOpen, ThumbsUp, Upload, HelpCircle, Copy, Download, Activity, Link2, Share2, SlidersHorizontal, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { ACTIVITY_TYPE_LABELS } from "@/lib/strava";
import ShareCardioModal from "@/components/strava/ShareCardioModal";

import { generateWorkoutPlan } from "@/ml/workoutModel";
import { parseProgramJson } from "@/utils/programIO";
import { toast } from "sonner";
import WorkoutCard from "@/components/workouts/WorkoutCard";
const StaticRouteMap = lazy(() => import("@/components/strava/StaticRouteMap"));

export default function Workouts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const importProgramRef = useRef(null);
  const [filter, setFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [isGenerating, setIsGenerating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [workoutToDelete, setWorkoutToDelete] = useState(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const queryClient = useQueryClient();

  const [workoutPlan, setWorkoutPlan] = useState(() => {
    return queryClient.getQueryData(['workoutPlan']) || null;
  });

  const { data: workouts = [] } = useQuery({
    queryKey: queryKeys.workouts(),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
  });

  // Workout like/dislike — stored in exercise_reactions with key "workout:ID".
  // The workout_reactions table has no 'reaction' column so we reuse the
  // exercise_reactions table which already has the right schema.
  const workoutReactionQueryKey = queryKeys.exerciseReactions(user?.id);

  const { data: allExerciseReactions = [] } = useQuery({
    queryKey: workoutReactionQueryKey,
    queryFn: () => db.entities.ExerciseReaction.filter({ created_by: user.id }),
    enabled: !!user,
    staleTime: 30_000,
  });

  // Derive workout reactions from the exercise_reactions rows with "workout:" prefix
  const reactions = allExerciseReactions
    .filter(r => r.exercise_name?.startsWith('workout:'))
    .map(r => ({
      ...r,
      workout_id: r.exercise_name.replace('workout:', ''),
      reaction: r.reaction,
    }));

  const reactionMutation = useMutation({
    mutationFn: async ({ workoutId, reaction }) => {
      const key = `workout:${workoutId}`;
      // Always query DB directly — never trust the cache for IDs (cache has optimistic fake ids)
      const rows = await db.entities.ExerciseReaction.filter({
        created_by: user.id,
        exercise_name: key,
      });
      const existing = rows[0] || null;

      if (existing) {
        if (existing.reaction === reaction) {
          await db.entities.ExerciseReaction.delete(existing.id);
          return { action: 'deleted', workoutId };
        } else {
          const updated = await db.entities.ExerciseReaction.update(existing.id, { reaction });
          return { action: 'updated', workoutId, reaction, record: updated };
        }
      } else {
        const created = await db.entities.ExerciseReaction.create({
          exercise_name: key,
          reaction,
          created_by: user.id,
        });
        return { action: 'created', workoutId, reaction, record: created };
      }
    },

    onMutate: async ({ workoutId, reaction }) => {
      await queryClient.cancelQueries({ queryKey: workoutReactionQueryKey });
      const previous = queryClient.getQueryData(workoutReactionQueryKey) || [];
      const key = `workout:${workoutId}`;
      const existing = previous.find(r => r.exercise_name === key);

      let optimistic;
      if (existing) {
        if (existing.reaction === reaction) {
          optimistic = previous.filter(r => r.exercise_name !== key);
        } else {
          optimistic = previous.map(r => r.exercise_name === key ? { ...r, reaction } : r);
        }
      } else {
        optimistic = [
          ...previous,
          {
            id: `optimistic-${Date.now()}`,
            exercise_name: key,
            reaction,
            created_by: user.id,
            created_at: new Date().toISOString(),
          },
        ];
      }
      queryClient.setQueryData(workoutReactionQueryKey, optimistic);
      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(workoutReactionQueryKey, context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workoutReactionQueryKey });
    },
  });

  const { profile } = useProfile();

  const { data: cardioSessions = [] } = useQuery({
    queryKey: ['cardioSessions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cardio_sessions')
        .select('*')
        .eq('created_by', user.id)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: workoutLogs = [] } = useQuery({
    queryKey: queryKeys.workoutLogs(),
    queryFn: async () => {
      const logs = await db.entities.WorkoutLog.filter({ created_by: user.id });
      return logs.sort((a, b) => new Date(b.log_date || b.created_at) - new Date(a.log_date || a.created_at));
    },
    enabled: !!user,
  });

  // Programs data
  const { programs, isLoading: programsLoading } = useMyPrograms();
  const { enrollments, isLoading: enrollmentsLoading } = useEnrollments();
  const activeEnrollments = enrollments.filter((e) => e.status === "active");
  const pastEnrollments = enrollments.filter((e) => e.status !== "active");

  const saveGeneratedWorkoutMutation = useMutation({
    mutationFn: async (dayWorkout) => {
      // Parse duration to get minutes (e.g., "30 min" -> 30)
      const durationMinutes = parseInt(dayWorkout.duration) || 30;

      // Create workout object from generated plan
      const workoutData = {
        created_by: user.id,
        title: `${dayWorkout.focus} - Day ${dayWorkout.dayIndex + 1}`,
        description: `Generated workout focusing on ${dayWorkout.focus.toLowerCase()}`,
        type: dayWorkout.focus.toLowerCase().includes('cardio') ? 'cardio' :
              dayWorkout.focus.toLowerCase().includes('strength') ? 'strength' :
              dayWorkout.focus.toLowerCase().includes('hiit') ? 'hiit' : 'strength',
        difficulty: profile?.fitness_level || 'intermediate',
        duration_minutes: durationMinutes,
        exercises: dayWorkout.exercises.map(ex => ({
          name: ex.name,
          sets: ex.sets || 3,
          reps: ex.reps || '10',
          rest_seconds: ex.rest || 90, // Use exercise rest or default to 90 seconds
          notes: ''
        })),
        equipment_needed: profile?.available_equipment || [],
        is_custom: true,
        target_goals: [profile?.primary_goal || 'general_fitness'],
      };

      return await db.entities.Workout.create(workoutData);
    },
    onSuccess: () => {
      invalidateWorkouts(queryClient);
      toast.success('Workout added to your library!');
    },
    onError: (error) => {
      toast.error('Failed to save workout');
      console.error('Error saving workout:', error);
    }
  });

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
        type: workout.type,
        difficulty: workout.difficulty,
        duration_minutes: workout.duration_minutes,
        exercises: workout.exercises,
        equipment_needed: workout.equipment_needed,
        is_custom: workout.is_custom,
        target_goals: workout.target_goals,
        folder: workout.folder || null,
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

      // Delete related reactions
      const reactions = await db.entities.WorkoutReaction.filter({ workout_id: workoutId });
      for (const reaction of reactions) {
        await db.entities.WorkoutReaction.delete(reaction.id);
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
      type: "strength",
      difficulty: "intermediate",
      duration_minutes: 60,
      exercises: [
        { name: "Bench Press", sets: 4, reps: "8-10", rest_seconds: 120, notes: "" },
        { name: "Incline Dumbbell Press", sets: 3, reps: "10-12", rest_seconds: 90, notes: "" },
      ],
      equipment_needed: ["barbell", "dumbbells", "bench"],
      target_goals: ["muscle_gain"],
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
          type: data.type ?? "strength",
          difficulty: data.difficulty ?? "intermediate",
          duration_minutes: data.duration_minutes ?? null,
          exercises: data.exercises,
          equipment_needed: data.equipment_needed ?? [],
          target_goals: data.target_goals ?? [],
          is_custom: true,
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

  const generateWorkouts = () => {
    if (!profile) {
      toast.error("Please complete your profile before generating workouts.");
      return;
    }
  
    setIsGenerating(true);

    try {
      // generateWorkoutPlan now accepts profile directly
      const plan = generateWorkoutPlan(profile);

      queryClient.setQueryData(['workoutPlan'], plan);
      setWorkoutPlan(plan);
    } catch (error) {
      console.error("Error generating workout plan:", error);
      toast.error("Failed to generate workout plan. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const getReaction = (workoutId) => {
    return reactions.find(r => r.workout_id === workoutId)?.reaction;
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
  const { getLikedExercises } = useExerciseReactions();
  const likedExerciseNames = getLikedExercises().filter(name => !name.startsWith('workout:'));

  const folders = [...new Set(
    workouts.map(w => w.folder).filter(Boolean)
  )].sort();

  const filteredWorkouts = workouts.filter(workout => {
    // Type/category filter
    if (filter === "custom" && !workout.is_custom) return false;
    if (filter === "liked" && getReaction(workout.id) !== "like") return false;
    if (!["all", "custom", "liked"].includes(filter) && workout.type !== filter) return false;

    // Folder filter
    if (folderFilter !== "all") {
      if (folderFilter === "unfiled") return !workout.folder;
      if (workout.folder !== folderFilter) return false;
    }

    return true;
  });

  if (!user) {
    return <LoadingScreen />;
  }

  return (
    <div className="p-4 md:p-6 bg-[#121212] min-h-screen transition-colors duration-300">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-white leading-tight">Workouts</h1>
            <p className="text-[13px] text-[#a0a0a0] mt-0.5">Library & session history</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={"/create-workout"}>
              <Button variant="dim" size="sm">
                <Plus className="w-3.5 h-3.5" />
                Create Custom
              </Button>
            </Link>
            <Button
              variant="dark"
              onClick={generateWorkouts}
              disabled={isGenerating || !profile}
            >
              {isGenerating ? (
                <>
                  <LoadingSpinner size="small" className="mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Generate Workouts
                </>
              )}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="activity-log" className="w-full">
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

          <TabsContent value="library">
        <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] mb-6 overflow-hidden">
          <div className="px-6 pt-4 pb-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-white shrink-0">Saved Workouts</h2>
              <div className="flex items-center gap-2 shrink-0">
                {/* Filters button */}
                <button
                  onClick={() => setFilterOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                    filter !== 'all' || folderFilter !== 'all'
                      ? 'bg-brand text-white border-brand/30'
                      : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#a0a0a0] hover:border-brand/30 hover:text-brand'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filters
                  {(filter !== 'all' || folderFilter !== 'all') && (
                    <span className="bg-[#1a1a1a]/30 text-white text-xs font-bold px-1 rounded-full leading-none py-0.5">
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
            <div className="px-6 pb-4 border-t border-[#2a2a2a] pt-3 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0] mb-2">Type</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'liked', label: 'Liked' },
                    { value: 'strength', label: 'Strength' },
                    { value: 'cardio', label: 'Cardio' },
                    { value: 'hiit', label: 'HIIT' },
                    { value: 'custom', label: 'My Workouts' },
                  ].map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFilter(f.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        filter === f.value
                          ? 'bg-brand text-black font-bold'
                          : 'bg-[#202020] text-[#a0a0a0] hover:bg-[#242424]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {folders.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0] mb-2">Folder</p>
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
                              className="px-2 py-1 rounded-full text-xs font-semibold border border-brand/30 bg-[#1a1a1a] text-white outline-none w-28"
                            />
                            <button type="submit" className="p-1 text-[#4ade80] hover:text-[#4ade80]">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={() => setRenamingFolder(null)} className="p-1 text-[#a0a0a0] hover:text-[#a0a0a0]">
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
                                ? 'bg-brand text-black font-bold'
                                : 'bg-[#202020] text-[#a0a0a0] hover:bg-[#242424]'
                            }`}
                          >
                            {f === 'all' && <FolderOpen className="w-3 h-3" />}
                            {f === 'all' ? 'All Folders' : f === 'unfiled' ? 'Unfiled' : f}
                          </button>
                          {f !== 'all' && f !== 'unfiled' && (
                            <button
                              onClick={() => { setRenamingFolder(f); setRenameValue(f); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-[#a0a0a0] hover:text-brand transition-opacity"
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
            {filter === "liked" && likedExerciseNames.length > 0 && (
              <div className="mb-6 p-4 rounded-xl bg-[rgba(34,197,94,0.05)] border border-[rgba(34,197,94,0.2)]">
                <h3 className="text-sm font-semibold text-[#4ade80] mb-3 flex items-center gap-1.5">
                  <ThumbsUp className="w-4 h-4" />
                  Liked Exercises
                </h3>
                <div className="flex flex-wrap gap-2">
                  {likedExerciseNames.map(name => (
                    <Badge key={name} variant="green" className="text-sm py-1 px-3">
                      {name}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-[#4ade80] mt-2 opacity-70">
                  These exercises are prioritised when generating workouts for you.
                </p>
              </div>
            )}
            <div className="max-h-[600px] overflow-y-auto pr-2">
              {filteredWorkouts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredWorkouts.map((workout) => (
                    <WorkoutCard
                      key={workout.id}
                      workout={workout}
                      reaction={getReaction(workout.id)}
                      onReactionChange={(workoutId, reaction) =>
                        reactionMutation.mutate({ workoutId, reaction })
                      }
                      userId={user.id}
                      onEdit={handleEdit}
                      onClone={handleClone}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Zap className="w-10 h-10 text-[#555555] mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-white mb-1">
                    {filter === "liked" ? "No liked workouts yet" : "No workouts yet"}
                  </h3>
                  <p className="text-sm text-[#555555] mb-4">
                    {filter === "liked"
                      ? "Like workouts using the thumbs up button to save them here"
                      : "Generate personalized workouts or create your own"}
                  </p>
                  {filter === "all" && (
                    <Button
                      variant="primary"
                      onClick={generateWorkouts}
                      disabled={isGenerating || !profile}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Generate Your First Workouts
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Generated Workout Plan Display */}
        {workoutPlan?.week?.length ? (
          <Card className="">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Your Generated Weekly Plan</h2>
                <Badge>
                  {workoutPlan.daysPerWeek} days/week • {workoutPlan.duration || "—"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {workoutPlan.week.map((day) => (
                <div key={day.dayIndex} className="p-4 rounded-lg border bg-[#1a1a1a] border-[#2a2a2a]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">
                      Day {day.dayIndex + 1}: {day.focus}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-[#a0a0a0]">{day.duration}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveGeneratedWorkoutMutation.mutate(day)}
                        disabled={saveGeneratedWorkoutMutation.isPending}
                        className="gap-1"
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {day.exercises.map((ex, idx) => (
                      <div
                        key={`${day.dayIndex}-${idx}`}
                        className="flex justify-between text-sm"
                      >
                        <span className="font-medium">{ex.name}</span>
                        <span className="text-[#a0a0a0]">
                          {ex.sets} × {ex.reps}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card className="">
            <CardHeader>
              <h2 className="text-xl font-bold">Your Generated Weekly Plan</h2>
            </CardHeader>
            <CardContent className="text-[#a0a0a0]">
              No plan found yet. Click "Generate Workouts" to create a personalized plan.
            </CardContent>
          </Card>
        )}
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
                          program={enrollment.program || { id: enrollment.program_id, name: "Program" }}
                          enrollment={enrollment}
                        />
                      ))}
                    </div>
                    {pastEnrollments.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-[#555555] uppercase tracking-wide mb-3">
                          Past Programs
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {pastEnrollments.map((enrollment) => (
                            <ProgramCard
                              key={enrollment.id}
                              program={enrollment.program || { id: enrollment.program_id, name: "Program" }}
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
              Are you sure you want to delete <span className="font-semibold text-white">"{workoutToDelete?.title}"</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-3 text-sm text-[#a0a0a0]">
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
              className="flex-1 bg-[rgba(239,68,68,0.1)] hover:bg-[rgba(239,68,68,0.1)] text-white"
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
              Save a <code className="text-xs bg-[#202020] px-1 rounded">.json</code> file matching this structure, then use the Import button to add it to your library.
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-[#1a1a1a] rounded-lg p-3 text-xs overflow-auto max-h-72 text-white text-[#a0a0a0] border text-left">{WORKOUT_TEMPLATE}</pre>
          <div className="text-xs text-[#555555] space-y-1 mt-1">
            <p><span className="font-semibold">type</span>: <code>strength</code>, <code>cardio</code>, or <code>hiit</code></p>
            <p><span className="font-semibold">difficulty</span>: <code>beginner</code>, <code>intermediate</code>, or <code>advanced</code></p>
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

function fmtPace(metersPerSecond, type) {
  if (!metersPerSecond || !['Run', 'VirtualRun', 'Walk', 'Hike'].includes(type)) return null;
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
    <div className={`flex-1 flex flex-col ${bordered ? 'border-l border-[#2a2a2a] pl-6' : ''}`}>
      <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">{label}</span>
      <span className="text-xl font-bold tabular-nums text-white mt-0.5">{value ?? '—'}</span>
    </div>
  );
}

// ─── Entry cards ─────────────────────────────────────────────────────────────

function StrengthEntryCard({ entry }) {
  return (
    <div
      className="group relative overflow-hidden rounded-xl border-l-4 bg-[#1a1a1a] border border-[#2a2a2a] hover:bg-[#242424] transition-all p-4"
      style={{ borderLeftColor: '#4f46e5' }}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="text-base font-bold text-white">{entry.title}</h4>
          <p className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0] mt-0.5">
            {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </p>
        </div>
        <button className="text-[#a0a0a0] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity p-1">
          <Share2 className="w-4 h-4" />
        </button>
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

function CardioEntryCard({ entry, onShare }) {
  const typeLabel = ACTIVITY_TYPE_LABELS[entry.activityType] || entry.activityType || 'Cardio';
  const distance = fmtDistance(entry.distance);
  const duration = fmtDuration(entry.movingTime);
  const pace = fmtPace(entry.avgSpeed, entry.activityType);

  return (
    <div
      className="group relative overflow-hidden rounded-xl border-l-4 bg-[#1a1a1a] border border-[#2a2a2a] hover:bg-[#242424] transition-all"
      style={{ borderLeftColor: '#3a3a3a' }}
    >
      <div className="flex justify-between items-start p-4 pb-3">
        <div>
          <h4 className="text-base font-bold text-white">{entry.title}</h4>
          <p className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0] mt-0.5">
            {typeLabel} · {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </p>
        </div>
        <button
          onClick={onShare}
          className="text-[#a0a0a0] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {entry.polyline && (
        <div className="overflow-hidden mb-3">
          <Suspense fallback={<div style={{ height: 180 }} className="bg-[#1a1a1a] rounded animate-pulse" />}>
            <StaticRouteMap polyline={entry.polyline} mapKey={entry.id} height={180} />
          </Suspense>
        </div>
      )}

      <div className="flex flex-wrap px-4 pb-4">
        {distance && <StatBlock label="Distance" value={distance} />}
        {duration && <StatBlock label="Time" value={duration} bordered={!!distance} />}
        {pace && <StatBlock label="Pace" value={pace} bordered />}
        {entry.avgPower && <StatBlock label="Avg Power" value={`${entry.avgPower}w`} bordered />}
        {entry.avgHeartrate && (
          <div className={`flex-1 flex flex-col ${(distance || duration || pace || entry.avgPower) ? 'border-l border-[#2a2a2a] pl-6' : ''}`}>
            <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">Heart Rate</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl font-bold tabular-nums text-white">{Math.round(entry.avgHeartrate)}</span>
              <span className="text-xs font-bold uppercase tracking-widest text-[#f87171]">bpm</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Log Tab ────────────────────────────────────────────────────────

function ActivityLogTab({ workoutLogs, cardioSessions, workouts, profile }) {
  const [filter, setFilter] = useState('all');
  const [shareSession, setShareSession] = useState(null);

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
      date: new Date(log.log_date || log.created_at),
      title: workout?.title || 'Workout',
      exerciseCount: logExercises.length,
      exercises: logExercises,
      sets: totalSets,
      duration: log.duration_minutes,
      volume: totalVolume > 0 ? totalVolume : null,
    };
  });

  const cardioEntries = cardioSessions.map(session => ({
    type: 'cardio',
    id: session.id,
    date: new Date(session.start_date),
    title: session.name,
    activityType: session.activity_type,
    distance: session.distance_meters,
    movingTime: session.moving_time_seconds,
    avgSpeed: session.average_speed,
    avgHeartrate: session.average_heartrate,
    avgPower: session.average_watts,
    polyline: session.map_polyline || null,
    hasMap: !!session.map_polyline,
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] mb-6">
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0] mb-1">This Week</span>
          <span className="text-xl font-bold tabular-nums text-brand">{thisWeek.length} Sessions</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0] mb-1">Strength</span>
          <div className="flex items-center gap-1.5">
            <Dumbbell className="w-4 h-4 text-indigo-500" />
            <span className="text-xl font-bold tabular-nums text-[#818cf8]">{weekStrength}</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0] mb-1">Cardio</span>
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[#a0a0a0]" />
            <span className="text-xl font-bold tabular-nums text-white">{weekCardio}</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0] mb-1">Distance</span>
          <span className="text-xl font-bold tabular-nums text-white">
            {weekMiles > 0 ? `${weekMiles.toFixed(1)} mi` : '—'}
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
              'px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all',
              filter === val
                ? 'bg-brand text-black font-bold'
                : 'border border-[#2a2a2a] text-[#555555] hover:border-brand/30',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {allEntries.length === 0 ? (
        <Card className="border-none">
          <CardContent className="py-6 text-center">
            <Activity className="w-10 h-10 text-[#555555] mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">No activity yet</h3>
            <p className="text-sm text-[#555555] mb-2">
              {filter === 'cardio'
                ? 'Log a cardio session or sync Strava in your Profile.'
                : filter === 'strength'
                ? 'Complete a workout to see it here.'
                : 'Complete workouts or sync Strava to build your log.'}
            </p>
            {filter !== 'strength' && !profile?.strava_access_token && (
              <Link to="/profile">
                <Button className="mt-4 bg-[#FC4C02] hover:bg-[#e04400] text-white">
                  <Link2 className="w-4 h-4 mr-2" />
                  Connect Strava
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ label, entries }) => (
            <section key={label}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0] mb-3">{label}</h3>
              <div className="space-y-3">
                {entries.map(entry =>
                  entry.type === 'strength' ? (
                    <StrengthEntryCard key={entry.id} entry={entry} />
                  ) : (
                    <CardioEntryCard
                      key={entry.id}
                      entry={entry}
                      onShare={() => setShareSession(entry.rawSession)}
                    />
                  )
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {shareSession && (
        <ShareCardioModal
          session={shareSession}
          onClose={() => setShareSession(null)}
          onShared={() => setShareSession(null)}
        />
      )}
    </>
  );
}

function ProgramsEmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <Card className="border-none">
      <CardContent className="py-6 text-center">
        <Icon className="w-10 h-10 text-[#555555] mx-auto mb-3" />
        <h3 className="text-base font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-[#555555] mb-4">{subtitle}</p>
        {action}
      </CardContent>
    </Card>
  );
}