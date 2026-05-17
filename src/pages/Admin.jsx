import { useState, useEffect } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useUserQueries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingScreen, LoadingSpinner } from "@/components/ui/loading-spinner";
import { queryKeys, invalidateProfile, invalidateSchedule, invalidateWorkouts } from "@/lib/queryKeys";
import { EQUIPMENT_OPTIONS } from "@/lib/constants";
import { Settings, Zap, Trash2, Save, ShieldAlert } from "lucide-react";
import { generateWorkoutPlan } from "@/ml/workoutModel";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, isLoading } = useProfile();

  const [formData, setFormData] = useState({
    fitness_level: "",
    primary_goal: "",
    available_equipment: [],
    workout_duration_preference: "",
    days_per_week: 3,
    exercises_per_day: null,
    include_cardio: false,
    skip_deload: false,
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        fitness_level: profile.fitness_level || "",
        primary_goal: profile.primary_goal || "",
        available_equipment: profile.available_equipment || [],
        workout_duration_preference: profile.workout_duration_preference || "",
        days_per_week: profile.days_per_week || 3,
        exercises_per_day: profile.exercises_per_day || null,
        include_cardio: profile.include_cardio || false,
        skip_deload: profile.skip_deload || false,
      });
    }
  }, [profile]);

  const handleEquipmentToggle = (value) => {
    setFormData(prev => ({
      ...prev,
      available_equipment: prev.available_equipment.includes(value)
        ? prev.available_equipment.filter(e => e !== value)
        : [...prev.available_equipment, value]
    }));
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      if (profile) {
        await db.entities.UserProfile.update(profile.id, data);
      }
    },
    onSuccess: () => {
      invalidateProfile(queryClient);
      toast.success("Profile updated!");
    },
  });

  const regenerateWorkoutsMutation = useMutation({
    mutationFn: async () => {
      const goalMapping = {
        "weight_loss": "Weight Loss",
        "muscle_gain": "Muscle Gain",
        "endurance": "Build Endurance",
        "general_fitness": "General Fitness",
        "flexibility": "Improve Flexibility"
      };
      const workoutPlan = generateWorkoutPlan({
        daysPerWeek: formData.days_per_week,
        goal: goalMapping[formData.primary_goal] || "General Fitness",
        level: formData.fitness_level,
        equipment: formData.available_equipment,
        duration: formData.workout_duration_preference,
        exercisesPerDay: formData.exercises_per_day || null,
        includeCardio: formData.include_cardio,
        skipDeload: formData.skip_deload,
      });
      queryClient.setQueryData(['workoutPlan'], workoutPlan);
      return workoutPlan;
    },
    onSuccess: () => toast.success("Workouts regenerated!"),
  });

  const clearScheduleMutation = useMutation({
    mutationFn: async () => {
      const schedules = await db.entities.WorkoutSchedule.filter({ created_by: user.id });
      for (const schedule of schedules) {
        await db.entities.WorkoutSchedule.delete(schedule.id);
      }
    },
    onSuccess: () => {
      invalidateSchedule(queryClient);
      toast.success("Schedule cleared!");
    },
  });

  const clearWorkoutsMutation = useMutation({
    mutationFn: async () => {
      const logs = await db.entities.WorkoutLog.filter({ created_by: user.id });
      for (const log of logs) await db.entities.WorkoutLog.delete(log.id);
      const schedules = await db.entities.WorkoutSchedule.filter({ created_by: user.id });
      for (const schedule of schedules) await db.entities.WorkoutSchedule.delete(schedule.id);
      const reactions = await db.entities.WorkoutReaction.filter({ created_by: user.id });
      for (const reaction of reactions) await db.entities.WorkoutReaction.delete(reaction.id);
      const workouts = await db.entities.Workout.filter({ created_by: user.id });
      for (const workout of workouts) await db.entities.Workout.delete(workout.id);
    },
    onSuccess: () => {
      invalidateWorkouts(queryClient);
      invalidateSchedule(queryClient);
      toast.success("All workouts cleared!");
    },
  });

  const handleSaveAndRegenerate = async () => {
    try {
      await updateProfileMutation.mutateAsync(formData);
      await regenerateWorkoutsMutation.mutateAsync();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  if (!user || isLoading) return <LoadingScreen />;

  if (!profile?.is_admin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <ShieldAlert className="w-16 h-16 text-danger-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Denied</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">You don't have permission to view this page.</p>
        <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen transition-colors duration-300">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Settings className="w-6 h-6 text-primary-600" />
            Admin Testing Panel
          </h1>
          <p className="text-slate-500 text-sm mt-1">Quick adjustments for testing</p>
        </div>

        <Card className="border-none shadow-lg mb-6">
          <CardHeader><CardTitle>Fitness Profile Settings</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-base font-semibold mb-3 block">Fitness Level</Label>
              <Select value={formData.fitness_level} onValueChange={(value) => setFormData({ ...formData, fitness_level: value })}>
                <SelectTrigger><SelectValue placeholder="Select fitness level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-base font-semibold mb-3 block">Primary Goal</Label>
              <Select value={formData.primary_goal} onValueChange={(value) => setFormData({ ...formData, primary_goal: value })}>
                <SelectTrigger><SelectValue placeholder="Select goal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weight_loss">Weight Loss</SelectItem>
                  <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                  <SelectItem value="endurance">Build Endurance</SelectItem>
                  <SelectItem value="general_fitness">General Fitness</SelectItem>
                  <SelectItem value="flexibility">Improve Flexibility</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-base font-semibold mb-3 block">Available Equipment</Label>
              <div className="grid gap-3">
                {EQUIPMENT_OPTIONS.map(option => (
                  <div key={option.value} className="flex items-center space-x-3 p-3 rounded-lg border-2 border-slate-200 hover:border-primary-300 cursor-pointer" onClick={() => handleEquipmentToggle(option.value)}>
                    <Checkbox checked={formData.available_equipment.includes(option.value)} onCheckedChange={() => handleEquipmentToggle(option.value)} />
                    <Label className="flex-1 cursor-pointer">{option.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold mb-3 block">Workout Duration</Label>
              <Select value={formData.workout_duration_preference} onValueChange={(value) => setFormData({ ...formData, workout_duration_preference: value })}>
                <SelectTrigger><SelectValue placeholder="Select duration" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15 min">15 min</SelectItem>
                  <SelectItem value="30 min">30 min</SelectItem>
                  <SelectItem value="45 min">45 min</SelectItem>
                  <SelectItem value="60+ min">60+ min</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-base font-semibold mb-3 block">Days per week: {formData.days_per_week}</Label>
              <input type="range" min="2" max="6" value={formData.days_per_week} onChange={(e) => setFormData({ ...formData, days_per_week: parseInt(e.target.value) })} className="w-full accent-primary-600" />
              <div className="flex justify-between text-sm text-slate-600 mt-1">
                <span className="dark:text-slate-400">2 days</span>
                <span className="dark:text-slate-400">6 days</span>
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold mb-3 block">
                Exercises per day: {formData.exercises_per_day ?? "Auto"}
              </Label>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setFormData({...formData, exercises_per_day: null})}
                  className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all ${
                    formData.exercises_per_day === null
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-slate-200 text-slate-600 hover:border-primary-300'
                  }`}
                >
                  Auto
                </button>
                {[3, 4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setFormData({...formData, exercises_per_day: n})}
                    className={`w-10 h-10 rounded-lg border-2 text-sm font-medium transition-all ${
                      formData.exercises_per_day === n
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-slate-200 text-slate-600 hover:border-primary-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold block">Workout Options</Label>
              <div
                className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  formData.include_cardio ? 'border-primary-600 bg-primary-50' : 'border-slate-200 hover:border-primary-300'
                }`}
                onClick={() => setFormData({...formData, include_cardio: !formData.include_cardio})}
              >
                <Label className="cursor-pointer">Include Cardio Finisher</Label>
                <div className={`w-10 h-5 rounded-full relative flex-shrink-0 transition-colors ${formData.include_cardio ? 'bg-primary-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.include_cardio ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </div>
              <div
                className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  formData.skip_deload ? 'border-primary-600 bg-primary-50' : 'border-slate-200 hover:border-primary-300'
                }`}
                onClick={() => setFormData({...formData, skip_deload: !formData.skip_deload})}
              >
                <Label className="cursor-pointer">Skip Deload Weeks</Label>
                <div className={`w-10 h-5 rounded-full relative flex-shrink-0 transition-colors ${formData.skip_deload ? 'bg-primary-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.skip_deload ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg mb-6">
          <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleSaveAndRegenerate} disabled={updateProfileMutation.isPending || regenerateWorkoutsMutation.isPending} className="w-full bg-primary-600">
              {updateProfileMutation.isPending || regenerateWorkoutsMutation.isPending ? <><LoadingSpinner size="small" className="mr-2" />Processing...</> : <><Save className="w-4 h-4 mr-2" />Save & Regenerate</>}
            </Button>
            <Button variant="outline" onClick={() => updateProfileMutation.mutate(formData)} disabled={updateProfileMutation.isPending} className="w-full">
              <Save className="w-4 h-4 mr-2" />Save Profile Only
            </Button>
            <Button variant="outline" onClick={() => regenerateWorkoutsMutation.mutate()} disabled={regenerateWorkoutsMutation.isPending} className="w-full">
              <Zap className="w-4 h-4 mr-2" />Regenerate Workouts Only
            </Button>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg border-danger-200">
          <CardHeader><CardTitle className="text-danger-600">Danger Zone</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={() => window.confirm("Clear all scheduled workouts?") && clearScheduleMutation.mutate()} disabled={clearScheduleMutation.isPending} className="w-full border-danger-300 text-danger-600 hover:bg-danger-50">
              <Trash2 className="w-4 h-4 mr-2" />Clear Schedule
            </Button>
            <Button variant="outline" onClick={() => window.confirm("Delete all workouts?") && clearWorkoutsMutation.mutate()} disabled={clearWorkoutsMutation.isPending} className="w-full border-danger-300 text-danger-600 hover:bg-danger-50">
              <Trash2 className="w-4 h-4 mr-2" />Clear All Workouts
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
