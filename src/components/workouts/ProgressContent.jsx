import { useState, useEffect } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import { queryKeys, invalidateWorkoutLogs, invalidateBodyWeight } from "@/lib/queryKeys";
import { useProfile, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrendingUp, Dumbbell, Calendar, ChevronDown, ChevronUp, Trash2, Scale, BarChart3, Brain } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  getUniqueExercises,
  getExerciseHistory,
  calculateVolume,
  getAllPersonalRecords
} from "@/utils/exerciseStats";
import { ExerciseProgressChart, WeightProgressChart } from "@/components/progress/ProgressCharts";

export function ProgressContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedExercise, setSelectedExercise] = useState("");
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  const [exerciseFilter, setExerciseFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [newWeight, setNewWeight] = useState("");
  const [weightDate, setWeightDate] = useState(new Date().toISOString().split('T')[0]);
  const [weightNotes, setWeightNotes] = useState("");

  const { profile } = useProfile();

  const { data: workoutLogs = [], isLoading } = useQuery({
    queryKey: queryKeys.workoutLogs(user?.id),
    queryFn: () => db.entities.WorkoutLog.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const { data: workouts = [] } = useQuery({
    queryKey: queryKeys.workouts(user?.id),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const { weightEntries } = useBodyWeightEntries();

  const deleteLogMutation = useMutation({
    mutationFn: async (logId) => {
      await db.entities.WorkoutLog.delete(logId);
    },
    onSuccess: () => {
      invalidateWorkoutLogs(queryClient);
      toast.success("Workout log deleted");
    },
    onError: () => {
      toast.error("Failed to delete workout log");
    },
  });

  const addWeightMutation = useMutation({
    mutationFn: async () => {
      if (!newWeight || !weightDate) {
        throw new Error("Weight and date are required");
      }
      return await db.entities.BodyWeightEntry.create({
        weight: parseFloat(newWeight),
        recorded_date: weightDate,
        notes: weightNotes,
        created_by: user.id,
      });
    },
    onSuccess: () => {
      invalidateBodyWeight(queryClient);
      toast.success("Weight entry added");
      setNewWeight("");
      setWeightNotes("");
      setWeightDate(new Date().toISOString().split('T')[0]);
    },
    onError: (error) => {
      toast.error("Failed to add weight entry");
      console.error("Error adding weight:", error);
    },
  });

  const deleteWeightMutation = useMutation({
    mutationFn: async (entryId) => {
      await db.entities.BodyWeightEntry.delete(entryId);
    },
    onSuccess: () => {
      invalidateBodyWeight(queryClient);
      toast.success("Weight entry deleted");
    },
    onError: () => {
      toast.error("Failed to delete weight entry");
    },
  });

  const weightUnit = profile?.weight_unit || 'lbs';
  const uniqueExercises = getUniqueExercises(workoutLogs);
  const exerciseHistory = selectedExercise ? getExerciseHistory(workoutLogs, selectedExercise) : [];
  const allPRs = getAllPersonalRecords(workoutLogs);

  // Calculate stats
  const totalWorkouts = workoutLogs.length;
  const totalVolume = workoutLogs.reduce((sum, log) => sum + calculateVolume(log), 0);
  const avgDuration = workoutLogs.length > 0
    ? Math.round(workoutLogs.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) / workoutLogs.length / 60)
    : 0;

  // Calculate body weight stats
  const sortedWeightEntries = [...weightEntries].sort((a, b) =>
    new Date(b.recorded_date) - new Date(a.recorded_date)
  );
  const currentWeight = sortedWeightEntries[0]?.weight;
  const startWeight = sortedWeightEntries[sortedWeightEntries.length - 1]?.weight;
  const weightChange = currentWeight && startWeight ? currentWeight - startWeight : null;

  // Enrich logs with workout details
  const enrichedLogs = workoutLogs.map(log => {
    const workout = workouts.find(w => w.id === log.workout_id);
    return {
      ...log,
      workoutTitle: workout?.title || "Unknown Workout",
      workoutType: workout?.type || "unknown"
    };
  });

  // Apply filters for workout logs tab
  const filteredLogs = enrichedLogs.filter(log => {
    if (typeFilter !== "all" && log.workoutType !== typeFilter) return false;
    if (exerciseFilter && !log.exercises?.some(ex =>
      ex.name.toLowerCase().includes(exerciseFilter.toLowerCase())
    )) return false;
    return true;
  });

  const toggleExpanded = (logId) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const handleDelete = (logId) => {
    if (window.confirm("Are you sure you want to delete this workout log?")) {
      deleteLogMutation.mutate(logId);
    }
  };

  const handleDeleteWeight = (entryId) => {
    if (window.confirm("Are you sure you want to delete this weight entry?")) {
      deleteWeightMutation.mutate(entryId);
    }
  };

  const handleAddWeight = (e) => {
    e.preventDefault();
    addWeightMutation.mutate();
  };

  // Auto-select first exercise if none selected
  useEffect(() => {
    if (!selectedExercise && uniqueExercises.length > 0) {
      setSelectedExercise(uniqueExercises[0]);
    }
  }, [uniqueExercises, selectedExercise]);

  if (!user || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="overview">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="exercises">
              <TrendingUp className="w-4 h-4 mr-2" />
              Exercises
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Dumbbell className="w-4 h-4 mr-2" />
              Workout Logs
            </TabsTrigger>
            <TabsTrigger value="bodyweight">
              <Scale className="w-4 h-4 mr-2" />
              Body Weight
            </TabsTrigger>
            <TabsTrigger value="coach">
              <Brain className="w-4 h-4 mr-2" />
              Nutrition
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-[#a0a0a0] flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Total Workouts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">{totalWorkouts}</div>
                </CardContent>
              </Card>

              <Card className="">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-[#a0a0a0] flex items-center gap-2">
                    <Dumbbell className="w-4 h-4" />
                    Total Volume
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {(totalVolume / 1000).toFixed(1)}k
                    <span className="text-lg text-[#555555] ml-1">{weightUnit}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-[#a0a0a0] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Avg Duration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    {avgDuration}
                    <span className="text-lg text-[#555555] ml-1">min</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-[#a0a0a0] flex items-center gap-2">
                    <Scale className="w-4 h-4" />
                    Body Weight
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {currentWeight ? (
                    <>
                      <div className="text-3xl font-bold text-white">
                        {currentWeight}
                        <span className="text-lg text-[#555555] ml-1">{weightUnit}</span>
                      </div>
                      {weightChange !== null && weightChange !== 0 && (
                        <div className={`text-sm mt-1 ${weightChange > 0 ? 'text-[#fbbf24]' : 'text-[#4ade80]'}`}>
                          {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} {weightUnit}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-[#555555]">No data</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Exercise Progress Tab */}
          <TabsContent value="exercises">
            <Card className=" mb-8">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <CardTitle>Exercise Progress</CardTitle>
                  <div className="w-full md:w-64">
                    <Select value={selectedExercise} onValueChange={setSelectedExercise}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an exercise">
                          {selectedExercise || "Select an exercise"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueExercises.map((exercise) => (
                          <SelectItem key={exercise} value={exercise}>
                            {exercise}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedExercise ? (
                  <ExerciseProgressChart
                    data={exerciseHistory}
                    exerciseName={selectedExercise}
                    weightUnit={weightUnit}
                  />
                ) : (
                  <div className="h-80 flex items-center justify-center text-[#555555]">
                    {uniqueExercises.length === 0
                      ? "No workout logs yet. Complete some workouts to see your progress!"
                      : "Select an exercise to view progress"}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Personal Records Table */}
            <Card className="">
              <CardHeader>
                <CardTitle>Personal Records</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(allPRs).length === 0 ? (
                  <div className="text-center py-8 text-[#555555]">
                    No personal records yet. Keep logging workouts!
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#2a2a2a]">
                          <th className="text-left py-3 px-4 font-semibold text-[#a0a0a0]">Exercise</th>
                          <th className="text-left py-3 px-4 font-semibold text-[#a0a0a0]">Weight</th>
                          <th className="text-left py-3 px-4 font-semibold text-[#a0a0a0]">Reps</th>
                          <th className="text-left py-3 px-4 font-semibold text-[#a0a0a0]">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(allPRs)
                          .sort((a, b) => b[1].weight - a[1].weight)
                          .map(([exercise, pr]) => (
                            <tr key={exercise} className="border-b border-[#2a2a2a] hover:bg-[#1a1a1a]">
                              <td className="py-3 px-4 font-medium">{exercise}</td>
                              <td className="py-3 px-4">
                                <span className="font-semibold text-brand">
                                  {pr.weight} {weightUnit}
                                </span>
                              </td>
                              <td className="py-3 px-4">{pr.reps}</td>
                              <td className="py-3 px-4 text-[#a0a0a0]">
                                {new Date(pr.date).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Workout Logs Tab */}
          <TabsContent value="logs">
            <Card className=" mb-6">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#a0a0a0] mb-2 block">
                      Search Exercise
                    </label>
                    <Input
                      placeholder="e.g., Bench Press"
                      value={exerciseFilter}
                      onChange={(e) => setExerciseFilter(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#a0a0a0] mb-2 block">
                      Workout Type
                    </label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="strength">Strength</SelectItem>
                        <SelectItem value="cardio">Cardio</SelectItem>
                        <SelectItem value="hiit">HIIT</SelectItem>
                        <SelectItem value="yoga">Yoga</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {filteredLogs.length === 0 ? (
              <Card className=" text-center py-12">
                <CardContent>
                  <Dumbbell className="w-16 h-16 text-[#a0a0a0] mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {workoutLogs.length === 0 ? "No workout history yet" : "No matching workouts"}
                  </h3>
                  <p className="text-[#a0a0a0]">
                    {workoutLogs.length === 0
                      ? "Complete some workouts to see your history here"
                      : "Try adjusting your filters"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedLogs.has(log.id);
                  const volume = calculateVolume(log);
                  const durationMin = log.duration_seconds
                    ? Math.round(log.duration_seconds / 60)
                    : null;

                  return (
                    <Card key={log.id} className="">
                      <CardHeader className="cursor-pointer" onClick={() => toggleExpanded(log.id)}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-xl mb-2">{log.workoutTitle}</CardTitle>
                            <div className="flex flex-wrap gap-4 text-sm text-[#a0a0a0]">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {format(parseISO(log.log_date), "MMM d, yyyy")}
                              </div>
                              {durationMin && (
                                <div className="flex items-center gap-1">
                                  <TrendingUp className="w-4 h-4" />
                                  {durationMin} min
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Dumbbell className="w-4 h-4" />
                                {log.exercises?.length || 0} exercises
                              </div>
                              {volume > 0 && (
                                <div className="text-brand font-medium">
                                  {(volume / 1000).toFixed(1)}k {weightUnit} volume
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(log.id);
                              }}
                              className="text-[#f87171] hover:text-[#f87171] hover:bg-[rgba(239,68,68,0.08)]"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-[#555555]" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-[#555555]" />
                            )}
                          </div>
                        </div>
                      </CardHeader>

                      {isExpanded && (
                        <CardContent className="pt-0">
                          <div className="space-y-4">
                            {log.exercises?.map((exercise, idx) => (
                              <div key={idx} className="bg-[#1a1a1a] rounded-lg p-4">
                                <h4 className="font-semibold text-lg mb-3">{exercise.name}</h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-[#2a2a2a]">
                                        <th className="text-left py-2 px-2">Set</th>
                                        <th className="text-left py-2 px-2">Weight</th>
                                        <th className="text-left py-2 px-2">Reps</th>
                                        <th className="text-left py-2 px-2">Volume</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {exercise.sets?.map((set, setIdx) => (
                                        <tr key={setIdx} className="border-b border-[#2a2a2a]">
                                          <td className="py-2 px-2 font-medium">{set.set_number}</td>
                                          <td className="py-2 px-2">{set.weight} {weightUnit}</td>
                                          <td className="py-2 px-2">{set.reps}</td>
                                          <td className="py-2 px-2 text-brand">
                                            {set.weight * set.reps} {weightUnit}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {exercise.notes && (
                                  <div className="mt-3 text-sm text-[#a0a0a0] italic border-l-2 border-brand/20 pl-3">
                                    {exercise.notes}
                                  </div>
                                )}
                              </div>
                            ))}
                            {log.notes && (
                              <div className="bg-brand/[5%] border border-brand/20 rounded-lg p-4">
                                <div className="font-semibold text-sm text-[#a0a0a0] mb-1">
                                  Workout Notes
                                </div>
                                <div className="text-sm text-[#a0a0a0]">{log.notes}</div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Body Weight Tab */}
          <TabsContent value="bodyweight">
            <Card className=" mb-6">
              <CardHeader>
                <CardTitle>Log Your Weight</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddWeight} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-[#a0a0a0] mb-2 block">
                        Weight ({weightUnit}) *
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        value={newWeight}
                        onChange={(e) => setNewWeight(e.target.value)}
                        placeholder={`e.g., ${weightUnit === 'lbs' ? '150' : '68'}`}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#a0a0a0] mb-2 block">
                        Date *
                      </label>
                      <Input
                        type="date"
                        value={weightDate}
                        onChange={(e) => setWeightDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="submit"
                        className="w-full bg-brand hover:bg-brand text-black font-bold"
                        disabled={addWeightMutation.isPending}
                      >
                        <Scale className="w-4 h-4 mr-2" />
                        Log Weight
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#a0a0a0] mb-2 block">
                      Notes (optional)
                    </label>
                    <Input
                      value={weightNotes}
                      onChange={(e) => setWeightNotes(e.target.value)}
                      placeholder="e.g., After workout, morning weigh-in..."
                    />
                  </div>
                </form>
              </CardContent>
            </Card>

            {weightEntries.length > 0 && (
              <Card className=" mb-6">
                <CardHeader>
                  <CardTitle>Weight Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <WeightProgressChart data={weightEntries} weightUnit={weightUnit} />
                </CardContent>
              </Card>
            )}

            {weightEntries.length === 0 ? (
              <Card className=" text-center py-12">
                <CardContent>
                  <Scale className="w-16 h-16 text-[#a0a0a0] mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    No weight entries yet
                  </h3>
                  <p className="text-[#a0a0a0]">
                    Start logging your weight to track your progress over time
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="">
                <CardHeader>
                  <CardTitle>Weight History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {weightEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg hover:bg-[#202020] transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl font-bold text-white">
                              {entry.weight} {weightUnit}
                            </div>
                            <div className="text-sm text-[#a0a0a0]">
                              {format(parseISO(entry.recorded_date), "MMM d, yyyy")}
                            </div>
                          </div>
                          {entry.notes && (
                            <p className="text-sm text-[#a0a0a0] mt-1 italic">{entry.notes}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteWeight(entry.id)}
                          className="text-[#f87171] hover:text-[#f87171] hover:bg-[rgba(239,68,68,0.08)]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

        </Tabs>
    </div>
  );
}
