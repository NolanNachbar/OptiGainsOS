import { useState } from "react";
import { db } from "@/api/supabaseClient";
import { analytics } from "@/lib/analytics.js";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_GOALS, EQUIPMENT_OPTIONS, ACTIVITY_LEVELS, SEX_OPTIONS } from "@/lib/constants";
import { calculateFormulaTDEE, calculateMacroSplit, suggestProtein } from "@/utils/coachingUtils";
import { ArrowRight, ArrowLeft, SkipForward, User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateWorkoutPlan } from "../ml/workoutModel";
import { format } from "date-fns";
import { queryKeys } from "@/lib/queryKeys";

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    username: "",
    display_name: "",
    privacy_level: "public",
    fitness_level: "",
    primary_goal: [],
    available_equipment: [],
    workout_duration_preference: "",
    days_per_week: 3,
    exercises_per_day: null,
    include_cardio: false,
    skip_deload: false,
    injuries_limitations: "",
    daily_protein_goal: DEFAULT_GOALS.protein,
    daily_carbs_goal: DEFAULT_GOALS.carbs,
    daily_fats_goal: DEFAULT_GOALS.fats,
    daily_calorie_goal: DEFAULT_GOALS.calories,
    height_cm: "",
    age: "",
    sex: "",
    activity_level: "",
    height_unit: "in",
  });
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [bodyStatsSkipped, setBodyStatsSkipped] = useState(false);
  const [calorieAdjustment, setCalorieAdjustment] = useState(0);
  const [currentWeight, setCurrentWeight] = useState("");

  const handleEquipmentToggle = (value) => {
    setFormData(prev => ({
      ...prev,
      available_equipment: prev.available_equipment.includes(value)
        ? prev.available_equipment.filter(e => e !== value)
        : [...prev.available_equipment, value]
    }));
  };

  const handleGoalToggle = (value) => {
    setFormData(prev => ({
      ...prev,
      primary_goal: prev.primary_goal.includes(value)
        ? prev.primary_goal.filter(g => g !== value)
        : [...prev.primary_goal, value]
    }));
  };

  // Map form goals to model-expected format
  const goalMapping = {
    "weight_loss": "Weight Loss",
    "muscle_gain": "Muscle Gain",
    "endurance": "Build Endurance",
    "general_fitness": "General Fitness",
    "flexibility": "Improve Flexibility"
  };

  const handleSubmit = async () => {
    try {
      // primary_goal stored as array in DB; first goal used for diet phase
      const primaryGoalForDB = Array.isArray(formData.primary_goal)
        ? formData.primary_goal
        : [formData.primary_goal];
      const primaryGoalKey = primaryGoalForDB[0] || "general_fitness";

      // Build profile data, excluding empty body stats
      const profileData = {
        ...formData,
        primary_goal: primaryGoalForDB,
        created_by: user.id,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      if (!profileData.height_cm) delete profileData.height_cm;
      if (!profileData.age) delete profileData.age;
      if (!profileData.sex) delete profileData.sex;
      if (!profileData.activity_level) delete profileData.activity_level;
      if (!profileData.exercises_per_day) delete profileData.exercises_per_day;

      // Save profile to database
      await db.entities.UserProfile.create(profileData);

      // Create initial diet phase based on primary goal
      const goalToPhase = {
        weight_loss: { type: "cut", rate: -0.75 },
        muscle_gain: { type: "bulk", rate: 0.25 },
        endurance: { type: "maintain", rate: 0 },
        general_fitness: { type: "maintain", rate: 0 },
        flexibility: { type: "maintain", rate: 0 },
      };
      const phaseConfig = goalToPhase[primaryGoalKey] || { type: "maintain", rate: 0 };
      try {
        await db.entities.DietPhase.create({
          created_by: user.id,
          phase_type: phaseConfig.type,
          weekly_rate: phaseConfig.rate,
          start_date: format(new Date(), "yyyy-MM-dd"),
          starting_weight: currentWeight ? parseFloat(currentWeight) : null,
          starting_calories: formData.daily_calorie_goal,
        });
      } catch (e) {
        console.error("Failed to create initial diet phase:", e);
      }

      // Generate workout plan — pass all new options
      const mappedGoals = primaryGoalForDB.map(g => goalMapping[g] || "General Fitness");
      const workoutPlan = generateWorkoutPlan({
        daysPerWeek: formData.days_per_week,
        goal: mappedGoals.length === 1 ? mappedGoals[0] : mappedGoals,
        level: formData.fitness_level,
        equipment: formData.available_equipment,
        duration: formData.workout_duration_preference,
        exercisesPerDay: formData.exercises_per_day || null,
        includeCardio: formData.include_cardio,
        skipDeload: formData.skip_deload,
      });

      // Store in query cache for other pages to read
      queryClient.setQueryData(['workoutPlan'], workoutPlan);

      // Mark profile as existing so Dashboard doesn't redirect back here
      queryClient.setQueryData(queryKeys.hasProfile(user.id), true);

      analytics.onboardingComplete(step);

      // Navigate to dashboard
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Error creating profile:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border-none shadow-lg">
        <CardHeader className="text-center pb-2">
          <img src={`${import.meta.env.BASE_URL}sisyphus.svg`} alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <CardTitle className="text-3xl font-bold text-primary-700">
            Welcome to Sisyphus' Schedule
          </CardTitle>
          <p className="text-slate-600 dark:text-slate-400 mt-2">Let's personalize your fitness journey</p>
          <div className="flex gap-2 justify-center mt-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-8 bg-primary-600' : 'w-1.5 bg-slate-300'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">Step {step} of 3</p>
        </CardHeader>

        <CardContent className="pt-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <Label className="text-base font-semibold mb-3 block">Choose a username</Label>
                <Input
                  value={formData.username}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
                    setFormData({...formData, username: val});
                  }}
                  placeholder="your_username"
                  maxLength={20}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">3-20 characters: letters, numbers, underscores</p>
              </div>

              <div>
                <Label className="text-base font-semibold mb-3 block">Display Name <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input
                  value={formData.display_name}
                  onChange={(e) => setFormData({...formData, display_name: e.target.value})}
                  placeholder="Your Name"
                />
              </div>

              <div>
                <Label className="text-base font-semibold mb-3 block dark:text-slate-400 dark:bg-slate-800">Profile Visibility</Label>
                <div className="grid gap-3">
                  {[
                    { value: "public", label: "Public", desc: "Searchable and visible to everyone" },
                    { value: "friends_only", label: "Friends Only", desc: "Only visible to added friends" },
                    { value: "private", label: "Private", desc: "Your profile is completely hidden" }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({...formData, privacy_level: option.value})}
                      className={`p-4 rounded-xl border-2 text-left transition-all dark:text-slate-400 ${
                        formData.privacy_level === option.value
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-slate-200 hover:border-primary-300 dark:border-slate-700 dark:hover:border-primary-600 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div className="font-semibold">{option.label}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Label className="text-base font-semibold mb-3 block ">What's your fitness level?</Label>
                <div className="grid gap-3">
                  {[
                    { value: "beginner", label: "Beginner", desc: "New to working out" },
                    { value: "intermediate", label: "Intermediate", desc: "Some experience" },
                    { value: "advanced", label: "Advanced", desc: "Regular training" }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({...formData, fitness_level: option.value})}
                      className={`p-4 rounded-xl border-2 text-left transition-all dark:text-slate-400 ${
                        formData.fitness_level === option.value
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-slate-200 hover:border-primary-300 dark:border-slate-700 dark:hover:border-primary-600 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div className="font-semibold">{option.label}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold mb-1 block">What are your goals?</Label>
                <p className="text-sm text-slate-500 mb-3">Select all that apply</p>
                <div className="grid gap-3">
                  {[
                    { value: "weight_loss", label: "Weight Loss", desc: "Burn fat, get leaner" },
                    { value: "muscle_gain", label: "Muscle Gain", desc: "Build size and strength" },
                    { value: "endurance", label: "Build Endurance", desc: "Improve stamina and cardio" },
                    { value: "general_fitness", label: "General Fitness", desc: "Stay active and healthy" },
                    { value: "flexibility", label: "Improve Flexibility", desc: "Mobility and recovery" }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => handleGoalToggle(option.value)}
                      className={`p-4 rounded-xl border-2 text-left transition-all dark:text-slate-400 ${
                        formData.primary_goal.includes(option.value)
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-slate-200 hover:border-primary-300 dark:border-slate-700 dark:hover:border-primary-600 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{option.label}</div>
                          <div className="text-sm text-slate-500">{option.desc}</div>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                          formData.primary_goal.includes(option.value)
                            ? 'border-primary-600 bg-primary-600'
                            : 'border-slate-300'
                        }`}>
                          {formData.primary_goal.includes(option.value) && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <Label className="text-base font-semibold mb-3 block">What equipment do you have access to?</Label>
                <div className="grid gap-3">
                  {EQUIPMENT_OPTIONS.map(option => {
                    const selected = formData.available_equipment.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleEquipmentToggle(option.value)}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                          selected
                            ? "border-primary-500 bg-primary-50 dark:bg-primary-950"
                            : "border-slate-200 hover:border-primary-300 dark:border-slate-700"
                        }`}
                      >
                        <Checkbox
                          checked={selected}
                          readOnly
                          className="pointer-events-none"
                        />
                        <span className="flex-1 font-medium">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold mb-3 block dark:hover:border-primary-600 dark:hover:bg-slate-700">Preferred workout duration</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "15 min", label: "15 min" },
                    { value: "30 min", label: "30 min" },
                    { value: "45 min", label: "45 min" },
                    { value: "60+ min", label: "60+ min" }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({...formData, workout_duration_preference: option.value})}
                      className={`p-4 rounded-xl border-2 transition-all dark:text-slate-400${
                        formData.workout_duration_preference === option.value
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-slate-200 hover:border-primary-300 dark:hover:border-primary-600 dark:hover:bg-slate-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold mb-1 block">
                  Days per week: {formData.days_per_week}
                  {formData.days_per_week === 6 && (
                    <span className="text-xs text-amber-500 font-normal ml-2">⚠️ High frequency — make sure you're recovering well</span>
                  )}
                </Label>
                <input
                  type="range"
                  min="1"
                  max="6"
                  value={formData.days_per_week}
                  onChange={(e) => setFormData({...formData, days_per_week: parseInt(e.target.value)})}
                  className="w-full accent-primary-600 mt-2"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span>
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold mb-1 block">
                  Exercises per day: {formData.exercises_per_day ?? "Auto"}
                </Label>
                <p className="text-sm text-slate-500 mb-3">
                  Leave on Auto to match your workout duration, or set a specific number to keep things simple.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFormData({...formData, exercises_per_day: null})}
                    className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all dark:text-slate-400${
                      formData.exercises_per_day === null
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-slate-200 text-slate-600 hover:border-primary-300 dark:hover:border-primary-600 dark:hover:bg-slate-700'
                    }`}
                  >
                    Auto
                  </button>
                  {[3, 4, 5, 6, 7].map(n => (
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
                <Label className="text-base font-semibold block">Extra Options</Label>
                <div
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.include_cardio ? 'border-primary-600 bg-primary-50' : 'border-slate-200 hover:border-primary-300'
                  }`}
                  onClick={() => setFormData({...formData, include_cardio: !formData.include_cardio})}
                >
                  <div>
                    <div className="font-semibold dark:text-slate-500">Include Cardio Finisher</div>
                    <div className="text-sm text-slate-500 dark:text-slate-500">Add a cardio exercise at the end of each workout</div>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-4 ${formData.include_cardio ? 'bg-primary-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.include_cardio ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>

                <div
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.skip_deload ? 'border-primary-600 bg-primary-50' : 'border-slate-200 hover:border-primary-300'
                  }`}
                  onClick={() => setFormData({...formData, skip_deload: !formData.skip_deload})}
                >
                  <div>
                    <div className="font-semibold dark:text-slate-500">Skip Deload Weeks</div>
                    <div className="text-sm text-slate-500 dark:text-slate-500">Disable automatic recovery weeks (not recommended for beginners)</div>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-4 ${formData.skip_deload ? 'bg-primary-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.skip_deload ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                className="flex-1 bg-primary-600 hover:bg-primary-700"
                disabled={
                  (step === 1 && (!formData.username || formData.username.length < 3)) ||
                  (step === 2 && (!formData.fitness_level || !formData.primary_goal.length))
                }
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-primary-600 hover:bg-primary-700"
              >
                Complete Setup
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
