import { useEffect, useMemo } from "react";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { calculateMacros } from "@/utils/nutritionUtils";
import { getBestTDEE } from "@/utils/coachingUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DashboardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/queryKeys";
import { useProfile, useAllFoodEntries, useBodyWeightEntries, useRecoveryMetrics } from "@/hooks/useUserQueries";
import { useEnrollments, useProgram } from "@/hooks/useProgramQueries";
import { getTodayProgramWorkout } from "@/utils/programSchedule";
import { getRecoveryHeatmapData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  Dumbbell,
  Calendar,
  Target,
  Circle,
  Clock,
  ArrowRight,
  Apple,
  Scale,
  Flame,
  Brain,
  ChevronDown,
  ChevronUp,
  Zap,
  ListChecks,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { getTodayString, getWeekStart, getWeekEnd } from "@/utils/dateUtils";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { calculateReadinessScore, getReadinessCategory } from "@/utils/recoveryUtils";
import { useTodayPrescription } from "@/hooks/useEngineQueries";
import TrainingLoadTab from "@/components/dashboard/TrainingLoadTab";
import MorningCheckin from "@/components/dashboard/MorningCheckin";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import TodayActions from "@/components/dashboard/TodayActions";
import EngineStatusCard from "@/components/dashboard/EngineStatusCard";
import PrescribedSessionCard from "@/components/dashboard/PrescribedSessionCard";
import SorenessCheckin from "@/components/dashboard/SorenessCheckin";
import PhaseRecommendationCard from "@/components/dashboard/PhaseRecommendationCard";
import EaseTodayButton from "@/components/dashboard/EaseTodayButton";


const EMPTY = [];

function getWorkoutSplitTitle(exercises) {
  if (!exercises?.length) return null;
  const names = exercises.map(e => (e.name || '').toLowerCase()).join(' ');
  const hasSquat = names.includes('squat') || names.includes('deadlift') || names.includes('leg press') || names.includes('hip thrust');
  const hasPush  = names.includes('bench') || names.includes('overhead press') || names.includes('push-up');
  const hasPull  = names.includes('row') || names.includes('pull-up') || names.includes('pulldown');
  if (hasSquat && !hasPush && !hasPull) return 'Legs Session';
  if (hasPush && !hasPull && !hasSquat) return 'Push Session';
  if (hasPull && !hasPush && !hasSquat) return 'Pull Session';
  if ((hasPush || hasPull) && hasSquat) return 'Full Body';
  return null;
}

export default function Dashboard() {
  const { user } = useAuth();

  const { profile } = useProfile();
  const today = getTodayString(profile?.timezone);

  const { data: todayCheckIn } = useQuery({
    queryKey: ["dailyReadiness", today, user?.id],
    queryFn: async () => {
      const rows = await db.entities.DailyReadiness.filter({ created_by: user.id, checkin_date: today });
      return rows[0] || null;
    },
    enabled: !!user,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data: todaySchedule = EMPTY, isLoading: scheduleLoading, isError: scheduleError, refetch: refetchSchedule } = useQuery({
    queryKey: queryKeys.todaySchedule(today, user?.id),
    queryFn: () => db.entities.WorkoutSchedule.filter({
      scheduled_date: today,
      created_by: user.id,
    }),
    enabled: !!user,
  });

  const { data: todayFood = EMPTY, isLoading: foodLoading, isError: foodError, refetch: refetchFood } = useQuery({
    queryKey: queryKeys.todayFood(today, user?.id),
    queryFn: () => db.entities.FoodEntry.filter({ date: today, created_by: user.id }),
    enabled: !!user,
  });

  const { data: workouts = EMPTY, isLoading: workoutsLoading, isError: workoutsError, refetch: refetchWorkouts } = useQuery({
    queryKey: queryKeys.workouts(user?.id),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const weekStart = format(getWeekStart(profile?.timezone, 0), "yyyy-MM-dd");
  const weekEnd = format(getWeekEnd(profile?.timezone, 0), "yyyy-MM-dd");

  const { data: allCardioSessions = [] } = useQuery({
    queryKey: ['allCardioSessions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('garmin_activities')
        .select('start_date:activity_date, moving_time_seconds:duration_seconds, average_heartrate:avg_hr')
        .eq('created_by', user.id)
        .order('activity_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: weeklyLogsWithExercises = [] } = useQuery({
    queryKey: ["weeklyLogsExercises", weekStart, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("exercises, log_date, created_at")
        .eq("created_by", user.id)
        .gte("log_date", weekStart)
        .lte("log_date", weekEnd);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const weeklyBodyData = getRecoveryHeatmapData(weeklyLogsWithExercises);

  const { enrollments } = useEnrollments();
  const activeEnrollment = enrollments.find((e) => e.status === "active");
  const { program: activeProgram } = useProgram(activeEnrollment?.program_id);
  const todayProgramWorkout = activeEnrollment && activeProgram
    ? getTodayProgramWorkout(activeEnrollment, activeProgram.workouts || [])
    : null;

  const { allFoodEntries } = useAllFoodEntries();

  const todayMacros = calculateMacros(todayFood);
  const todayWorkout = todaySchedule[0];
  const todayWorkoutDetails = todayWorkout && workouts.find((w) => w.id === todayWorkout.workout_id);

  // Exercises for today's workout (program or regular)
  const todayExercises = todayProgramWorkout?.exercises || todayWorkoutDetails?.exercises || [];

  const { data: todayBrief } = useQuery({
    queryKey: ["daily-brief", today, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_briefs")
        .select("brief_json")
        .eq("created_by", user.id)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  const { recoveryMetrics } = useRecoveryMetrics(30);

  // Real readiness (replaces the previously hardcoded "88"). recoveryMetrics is
  // sorted descending by date, so [0] is the most recent row.
  const readinessScore = useMemo(
    () => calculateReadinessScore(recoveryMetrics?.[0], todayCheckIn),
    [recoveryMetrics, todayCheckIn]
  );
  const readinessCat = getReadinessCategory(readinessScore);

  // Engine's daily prescription — surfaces the MPC's own readiness/overreach
  // guardrail when the recovery pipeline has run.
  const { prescription } = useTodayPrescription(today);

  // Staleness signal — flags when wearable recovery data has stopped flowing
  // (the engine's recovery/overreach models go blind without it).
  const recoveryStaleDays = useMemo(() => {
    const latest = recoveryMetrics?.[0]?.date;
    if (!latest) return null;
    return Math.floor((new Date(today) - new Date(latest)) / 86400000);
  }, [recoveryMetrics, today]);

  // Days remaining to the goal event (BUD/S). Drives the countdown in the header.
  const daysToRace = useMemo(() => {
    const target = profile?.race_date || "2026-08-31";
    const d = Math.ceil((new Date(target) - new Date(today)) / 86400000);
    return d > 0 ? d : null;
  }, [profile, today]);

  // Single source of truth for today's calorie target (engine-gated → profile).
  const { calories: calorieTarget } = useDailyTargets(today);

  const { data: workoutLogs = EMPTY, isLoading: logsLoading, isError: logsError, refetch: refetchLogs } = useQuery({
    queryKey: queryKeys.workoutLogs(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('created_by', user.id)
        .order('log_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const { weightEntries } = useBodyWeightEntries();

  const weightUnit = profile?.weight_unit || "lbs";
  const sortedWeightEntries = [...weightEntries].sort((a, b) => new Date(b.recorded_date) - new Date(a.recorded_date));
  const currentBodyWeight = sortedWeightEntries[0]?.weight;
  const tdeeResult = getBestTDEE(profile, currentBodyWeight, weightEntries, allFoodEntries || [], recoveryMetrics);
  const weekAgoStr = format(subDays(new Date(`${today}T00:00:00`), 7), "yyyy-MM-dd");
  const startBodyWeight = sortedWeightEntries.find((e) => e.recorded_date <= weekAgoStr)?.weight;
  const bodyWeightChange = currentBodyWeight && startBodyWeight ? currentBodyWeight - startBodyWeight : null;

  // Derive the link URL for today's workout
  const todayWorkoutLink = todayProgramWorkout
    ? `/workout-detail?source=program&enrollmentId=${todayProgramWorkout.enrollmentId}&programWorkoutId=${todayProgramWorkout.programWorkoutId}`
    : todayWorkoutDetails
    ? `/workout-detail?id=${todayWorkoutDetails.id}`
    : null;

  const RUN_KEYWORDS = ["zone 2 run", "zone2 run", "400m sprint", "sprint", "run", "cardio"];
  const isRunEx = (ex) => RUN_KEYWORDS.some(k => ex.name?.toLowerCase().includes(k));

  // Best log for today = longest duration
  const todayLog = workoutLogs
    .filter(l => l.log_date === today)
    .sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0))[0] || null;

  const workoutTitle = todayProgramWorkout?.title || todayWorkoutDetails?.title;
  const displayWorkoutTitle = (todayLog ? getWorkoutSplitTitle(todayLog.exercises) : null) || workoutTitle;
  const workoutDuration = todayWorkoutDetails?.duration_minutes;
  const todayProgramLifts = todayExercises.filter(ex => !isRunEx(ex));
  const todayProgramRuns = [
    ...(todayProgramWorkout?.exercises || []).filter(isRunEx),
    ...(todayProgramWorkout?.cardio_sessions || []),
  ];
  const exerciseCount = todayProgramLifts.length || todayWorkoutDetails?.exercises?.length || 0;

  const workoutCardLoading = scheduleLoading || workoutsLoading || logsLoading;
  const dashError = scheduleError || foodError || workoutsError || logsError;
  const retryDashQueries = () => {
    if (scheduleError) refetchSchedule();
    if (foodError) refetchFood();
    if (workoutsError) refetchWorkouts();
    if (logsError) refetchLogs();
  };

  if (!user) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="px-3 py-3 md:px-6 md:py-4 bg-charcoal min-h-screen relative">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between rise-in">
          <div className="flex items-center gap-3">
            <UserAvatar url={profile?.avatar_url} username={profile?.username} size="sm" className="border border-white/10" />
            <div>
              <h1 className="type-display text-lg leading-none">Dashboard</h1>
              <p className="text-[10px] text-muted-2 uppercase font-bold tracking-[0.08em] mt-1">
                OptiGains Engine
                {daysToRace != null && (
                  <span className="font-technical text-gold ml-2">· {daysToRace}d to BUD/S</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
             <Link to="/weekly-schedule">
              <Button variant="dim" size="sm" className="text-xs gap-1.5 h-8">
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </Button>
            </Link>
             <Link to="/athlete-state">
              <Button variant="dim" size="sm" className="text-xs gap-1.5 h-8">
                <Activity className="w-3.5 h-3.5" /> State
              </Button>
            </Link>
          </div>
        </div>

        {/* Recovery-data staleness banner */}
        {recoveryStaleDays != null && recoveryStaleDays >= 2 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-warn shrink-0" />
            <span className="text-ink-secondary">
              Recovery data is {recoveryStaleDays} days stale — your wearable sync may need attention.
            </span>
            <Link to="/profile" className="ml-auto text-brand font-semibold whitespace-nowrap">
              Check
            </Link>
          </div>
        )}

        {/* Query failure banner — without it the page silently shows Rest Day / 0 kcal */}
        {dashError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-bad shrink-0" />
            <span className="text-ink-secondary">
              Some of today's data failed to load — what's shown may be incomplete.
            </span>
            <button type="button" onClick={retryDashQueries} className="ml-auto text-brand font-semibold whitespace-nowrap">
              Retry
            </button>
          </div>
        )}

        {/* ── METABOLIC GRID (The Engine Room) ── */}
        <div className="glass p-2 mb-4 rise-in-2">
        {foodLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[90px] rounded-xl" />
          ))}
        </div>
        ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">

          {/* Expenditure Tile */}
          <div className="glass-inset px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[9.5px] text-muted-2 uppercase font-bold tracking-[0.08em] flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-gold" /> Expenditure
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical font-extrabold text-ink leading-none">{tdeeResult?.tdee?.toLocaleString() || "—"}</span>
                <span className="text-[9px] text-gold font-semibold uppercase">kcal/day</span>
              </div>
            </div>
            {tdeeResult?.method === 'adaptive' ? (
              <span className="text-[8px] text-gold bg-gold/10 px-1.5 py-0.5 rounded border-[0.5px] border-gold/20 w-fit leading-none font-bold uppercase tracking-wider">Adaptive</span>
            ) : (
              <span className="text-[8px] text-muted-2 leading-none uppercase tracking-wider font-semibold">Estimated</span>
            )}
          </div>

          {/* Trend Weight Tile */}
          <div className="glass-inset px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[9.5px] text-muted-2 uppercase font-bold tracking-[0.08em] flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-violet" /> Weight
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical font-extrabold text-ink leading-none">{currentBodyWeight || "—"}</span>
                <span className="text-[9px] text-muted-2 font-semibold uppercase">{weightUnit}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-muted-2 leading-none">
              <span className={`font-technical font-bold ${bodyWeightChange > 0 ? "text-warn" : "text-ok"}`}>
                {bodyWeightChange > 0 ? "+" : ""}{bodyWeightChange?.toFixed(1) || "0.0"}
              </span>
              <span className="uppercase tracking-wider font-semibold">this wk</span>
            </div>
          </div>

          {/* Readiness Tile → Recovery detail */}
          <Link to="/recovery" className="glass-inset px-4 py-3 flex flex-col justify-between h-[90px] hover:bg-white/[0.07] transition-colors group">
            <div>
              <p className="text-[9.5px] text-muted-2 uppercase font-bold tracking-[0.08em] flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-teal" /> Readiness
                <ArrowRight className="w-2.5 h-2.5 text-faint group-hover:text-teal ml-auto transition-colors" />
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical font-extrabold text-ink leading-none">{readinessScore ?? "—"}</span>
                <span className={`text-[9px] font-semibold uppercase ${readinessCat.color}`}>
                  {readinessScore == null ? "No data" : readinessCat.label}
                </span>
              </div>
            </div>
            <div className="flex gap-1 items-center h-2">
              {[0, 1, 2, 3].map((i) => {
                const filled = readinessScore != null && i < Math.round(readinessScore / 25);
                return (
                  <div
                    key={i}
                    className={`w-4 h-[3px] rounded-sm ${
                      filled ? "bg-teal" : "bg-white/[0.08]"
                    }`}
                  />
                );
              })}
            </div>
          </Link>

          {/* Nutrition Snapshot */}
          <div className="glass-inset px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[9.5px] text-muted-2 uppercase font-bold tracking-[0.08em] flex items-center gap-1.5">
                <Apple className="w-3.5 h-3.5 text-gold" /> Intake
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical font-extrabold text-ink leading-none">{Math.round(todayMacros.calories)}</span>
                <span className="text-[9px] text-muted-2 leading-none font-technical">/ {calorieTarget ?? "—"} kcal</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden w-full">
                <div className="h-full bg-gold" style={{ width: `${Math.min(100, (todayMacros.calories / (calorieTarget || 1)) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-muted-2 font-technical leading-none">
                <span>P:<span className="text-coral">{Math.round(todayMacros.protein)}g</span></span>
                <span>C:<span className="text-carb">{Math.round(todayMacros.carbs)}g</span></span>
                <span>F:<span className="text-fat">{Math.round(todayMacros.fats)}g</span></span>
              </div>
            </div>
          </div>
        </div>
        )}
        </div>

        {/* Morning Check-in (if not done) */}
        {!todayCheckIn && (
          <div className="mb-4">
            <h2 className="section-label mb-1.5 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-teal" /> Daily Readiness Check-in
            </h2>
            <MorningCheckin today={today} existingCheckin={todayCheckIn} />
          </div>
        )}

        {/* ── MAIN WORKOUT CARD ── */}
        <div className="mb-4">
          {workoutCardLoading ? (
            <Skeleton className="h-[104px] rounded-xl" />
          ) : todayLog ? (
            <div className="glass overflow-hidden">
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-leaf/10">
                    <CheckCircle2 className="w-6 h-6 text-leaf" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-ink">{displayWorkoutTitle || "Session Complete"}</h3>
                    <p className="text-xs text-leaf/70 font-bold uppercase tracking-[0.08em]">Training Done</p>
                  </div>
                </div>
                <Link to={todayWorkoutLink || "/workouts"}>
                  <Button variant="dim" size="sm" className="text-xs">View Log</Button>
                </Link>
              </div>
            </div>
          ) : workoutTitle ? (
            <div className="glass glass-interactive overflow-hidden relative group">
              <span className="absolute left-0 top-0 bottom-0 w-1 bg-brand" />
              <div className="p-5 relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] text-brand font-bold uppercase tracking-[0.08em] mb-1">Today's Mission</p>
                    <h3 className="text-xl font-extrabold text-ink leading-tight">{workoutTitle}</h3>
                    <p className="font-technical text-xs font-semibold text-muted-2 mt-1">
                      {exerciseCount} lift{exerciseCount !== 1 ? "s" : ""}
                      {todayProgramRuns.length > 0 && ` · ${todayProgramRuns.length} conditioning`}
                      {workoutDuration ? ` · ~${workoutDuration} min` : ""}
                    </p>
                  </div>
                   <Dumbbell className="w-8 h-8 text-brand/30 group-hover:text-brand/50 transition-colors" />
                </div>
                <Link to={todayWorkoutLink}>
                  <Button variant="energy" className="w-full h-12 text-md font-bold rounded-xl">
                    Start Workout <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <Card className="p-6 text-center border-dashed border-white/10">
              <p className="text-muted-2 font-bold uppercase tracking-[0.08em] text-xs">Rest Day</p>
              <p className="text-sm font-semibold text-muted-2 mt-1">Focus on recovery and mobility</p>
            </Card>
          )}
        </div>

        {/* ── SECONDARY CONTENT (Tabs/Lists) ── */}
        <div className="space-y-4">
          {/* The engine's actual prescribed session for today (was never surfaced) */}
          <PrescribedSessionCard today={today} />

          {/* Coach's diet-phase call (cut / maintain / bulk) — accept or reject */}
          <PhaseRecommendationCard />

          {/* Manual recovery valve — only renders on a cut */}
          <EaseTodayButton />

          {/* AI Insights */}
          <DailyBriefCard today={today} hideWhenEmpty={true} />

          {/* Adaptive engine guardrails (ACWR / interference / overreach) */}
          <EngineStatusCard today={today} />

          {/* Actions & Soreness */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TodayActions today={today} briefActions={todayBrief?.brief_json?.today_actions} />
            <SorenessCheckin today={today} />
          </div>

          {/* Heatmap & Training Load */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-2 glass-interactive">
              <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="section-label flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-teal" /> Training Load
                </CardTitle>
              </CardHeader>
              <div className="p-5">
                <TrainingLoadTab
                  cardioSessions={allCardioSessions}
                  workoutLogs={workoutLogs}
                  profile={profile}
                  banister={prescription?.banister_state}
                />
              </div>
            </Card>

            <Card className="glass-interactive overflow-hidden">
               <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="section-label flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-teal" /> Muscle Fatigue
                </CardTitle>
              </CardHeader>
              <div className="p-4 flex justify-center">
                 <MuscleHeatMap data={weeklyBodyData} view="anterior" className="h-[200px]" />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
