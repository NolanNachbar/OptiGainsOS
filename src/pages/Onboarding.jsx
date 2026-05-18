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
import Logo from "@/components/Logo";
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

  const optionBtn = (active) =>
    `p-4 rounded-lg border-2 text-left transition-all ${
      active
        ? 'border-[#ccff00] bg-[rgba(204,255,0,0.15)] text-[#ccff00]'
        : 'border-[#2a2a2a] bg-[#202020] hover:border-[rgba(204,255,0,0.3)] hover:bg-[rgba(204,255,0,0.08)] text-[#a0a0a0]'
    }`;

  const toggleRow = (active) =>
    `flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer bg-[#202020] border-[#2a2a2a]`;

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center pb-2">
          <Logo className="w-16 h-16 mx-auto mb-4" />
          <CardTitle className="text-[22px] font-bold text-[#ccff00] tracking-[-0.02em]">
            Welcome to VEKTOR
          </CardTitle>
          <p className="text-[13px] text-[#a0a0a0] mt-1">Let's personalize your fitness journey</p>
          <div className="flex gap-1.5 justify-center mt-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-7 bg-[#ccff00]' : 'w-1.5 bg-[#333]'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-[#555555] mt-1.5">Step {step} of 3</p>
        </CardHeader>

        <CardContent className="pt-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <Label className="text-base font-semibold mb-3 block text-white">Choose a username</Label>
                <Input
                  value={formData.username}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
                    setFormData({...formData, username: val});
                  }}
                  placeholder="your_username"
                  maxLength={20}
                />
                <p className="text-xs text-[#555555] mt-1.5">3-20 characters: letters, numbers, underscores</p>
              </div>

              <div>
                <Label className="text-base font-semibold mb-3 block text-white">
                  Display Name <span className="text-[#555555] font-normal">(optional)</span>
                </Label>
                <Input
                  value={formData.display_name}
                  onChange={(e) => setFormData({...formData, display_name: e.target.value})}
                  placeholder="Your Name"
                />
              </div>

              <div>
                <Label className="text-base font-semibold mb-3 block text-white">Profile Visibility</Label>
                <div className="grid gap-3">
                  {[
                    { value: "public", label: "Public", desc: "Searchable and visible to everyone" },
                    { value: "friends_only", label: "Friends Only", desc: "Only visible to added friends" },
                    { value: "private", label: "Private", desc: "Your profile is completely hidden" }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({...formData, privacy_level: option.value})}
                      className={optionBtn(formData.privacy_level === option.value)}
                    >
                      <div className="font-semibold">{option.label}</div>
                      <div className="text-sm text-[#555555]">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Label className="text-base font-semibold mb-3 block text-white">What's your fitness level?</Label>
                <div className="grid gap-3">
                  {[
                    { value: "beginner", label: "Beginner", desc: "New to working out" },
                    { value: "intermediate", label: "Intermediate", desc: "Some experience" },
                    { value: "advanced", label: "Advanced", desc: "Regular training" }
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({...formData, fitness_level: option.value})}
                      className={optionBtn(formData.fitness_level === option.value)}
                    >
                      <div className="font-semibold">{option.label}</div>
                      <div className="text-sm text-[#555555]">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold mb-1 block text-white">What are your goals?</Label>
                <p className="text-sm text-[#555555] mb-3">Select all that apply</p>
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
                      className={optionBtn(formData.primary_goal.includes(option.value))}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{option.label}</div>
                          <div className="text-sm text-[#555555]">{option.desc}</div>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                          formData.primary_goal.includes(option.value)
                            ? 'border-[#ccff00] bg-[#ccff00]'
                            : 'border-[#444]'
                        }`}>
                          {formData.primary_goal.includes(option.value) && (
                            <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
                <Label className="text-base font-semibold mb-3 block text-white">What equipment do you have access to?</Label>
                <div className="grid gap-3">
                  {EQUIPMENT_OPTIONS.map(option => {
                    const selected = formData.available_equipment.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleEquipmentToggle(option.value)}
                        className={`flex items-center gap-3 ${optionBtn(selected)}`}
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
                <Label className="text-base font-semibold mb-3 block text-white">Preferred workout duration</Label>
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
                      className={optionBtn(formData.workout_duration_preference === option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold mb-1 block text-white">
                  Days per week: <span className="text-[#ccff00]">{formData.days_per_week}</span>
                  {formData.days_per_week === 6 && (
                    <span className="text-xs text-amber-500 font-normal ml-2">High frequency — make sure you're recovering well</span>
                  )}
                </Label>
                <input
                  type="range"
                  min="1"
                  max="6"
                  value={formData.days_per_week}
                  onChange={(e) => setFormData({...formData, days_per_week: parseInt(e.target.value)})}
                  className="w-full accent-primary-500 mt-2"
                />
                <div className="flex justify-between text-xs text-[#555555] mt-1">
                  <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span>
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold mb-1 block text-white">
                  Exercises per day: <span className="text-[#ccff00]">{formData.exercises_per_day ?? "Auto"}</span>
                </Label>
                <p className="text-sm text-[#555555] mb-3">
                  Leave on Auto to match your workout duration, or set a specific number to keep things simple.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setFormData({...formData, exercises_per_day: null})}
                    className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      formData.exercises_per_day === null
                        ? 'border-[#ccff00] bg-[#ccff00]/10 text-[#ccff00]'
                        : 'border-[#2a2a2a] text-[#555555] hover:border-[#ccff00]/40'
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
                          ? 'border-[#ccff00] bg-[#ccff00]/10 text-[#ccff00]'
                          : 'border-[#2a2a2a] text-[#555555] hover:border-[#ccff00]/40'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold block text-white">Extra Options</Label>
                <div
                  className={toggleRow(formData.include_cardio)}
                  onClick={() => setFormData({...formData, include_cardio: !formData.include_cardio})}
                >
                  <div>
                    <div className="font-semibold text-white">Include Cardio Finisher</div>
                    <div className="text-sm text-[#555555]">Add a cardio exercise at the end of each workout</div>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-4 ${formData.include_cardio ? 'bg-[#ccff00]' : 'bg-[#333]'}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-[#1a1a1a] rounded-full shadow transition-transform ${formData.include_cardio ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>

                <div
                  className={toggleRow(formData.skip_deload)}
                  onClick={() => setFormData({...formData, skip_deload: !formData.skip_deload})}
                >
                  <div>
                    <div className="font-semibold text-white">Skip Deload Weeks</div>
                    <div className="text-sm text-[#555555]">Disable automatic recovery weeks (not recommended for beginners)</div>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-4 ${formData.skip_deload ? 'bg-[#ccff00]' : 'bg-[#333]'}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-[#1a1a1a] rounded-full shadow transition-transform ${formData.skip_deload ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <Button
                variant="dim"
                onClick={() => setStep(step - 1)}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button
                variant="volt"
                onClick={() => setStep(step + 1)}
                className="flex-1"
                disabled={
                  (step === 1 && (!formData.username || formData.username.length < 3)) ||
                  (step === 2 && (!formData.fitness_level || !formData.primary_goal.length))
                }
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="volt"
                onClick={handleSubmit}
                className="flex-1"
              >
                Complete Setup
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
