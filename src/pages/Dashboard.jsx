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
import { DashboardSkeleton } from "@/components/ui/skeleton";
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
import { format } from "date-fns";
import { getTodayString, getWeekStart, getWeekEnd } from "@/utils/dateUtils";
import { calculateReadinessScore, getReadinessCategory } from "@/utils/recoveryUtils";
import { useTodayPrescription } from "@/hooks/useEngineQueries";
import TrainingLoadTab from "@/components/dashboard/TrainingLoadTab";
import MorningCheckin from "@/components/dashboard/MorningCheckin";
import DailyBriefCard from "@/components/dashboard/DailyBriefCard";
import TodayActions from "@/components/dashboard/TodayActions";
import EngineStatusCard from "@/components/dashboard/EngineStatusCard";
import PrescribedSessionCard from "@/components/dashboard/PrescribedSessionCard";
import SorenessCheckin from "@/components/dashboard/SorenessCheckin";


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

  const { data: todaySchedule } = useQuery({
    queryKey: queryKeys.todaySchedule(today, user?.id),
    queryFn: () => db.entities.WorkoutSchedule.filter({
      scheduled_date: today,
      created_by: user.id,
    }),
    enabled: !!user,
    initialData: [],
  });

  const { data: todayFood } = useQuery({
    queryKey: queryKeys.todayFood(today, user?.id),
    queryFn: () => db.entities.FoodEntry.filter({ date: today, created_by: user.id }),
    enabled: !!user,
    initialData: [],
  });

  const { data: workouts } = useQuery({
    queryKey: queryKeys.workouts(user?.id),
    queryFn: () => db.entities.Workout.filter({ created_by: user.id }),
    enabled: !!user,
    initialData: [],
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

  const { data: workoutLogs = [] } = useQuery({
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
  const startBodyWeight = sortedWeightEntries[sortedWeightEntries.length - 1]?.weight;
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

  if (!user) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="px-3 py-3 md:px-6 md:py-4 bg-charcoal min-h-screen relative">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar url={profile?.avatar_url} username={profile?.username} size="sm" className="border border-charcoal-border" />
            <div>
              <h1 className="text-lg font-bold text-white leading-none">Dashboard</h1>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">
                OptiGains Engine
                {daysToRace != null && (
                  <span className="text-brand ml-2">· {daysToRace}d to BUD/S</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
             <Link to="/weekly-schedule">
              <Button variant="ghost" size="sm" className="text-slate-400 text-xs gap-1.5 hover:text-brand h-8 border-charcoal-border">
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </Button>
            </Link>
             <Link to="/athlete-state">
              <Button variant="ghost" size="sm" className="text-slate-400 text-xs gap-1.5 hover:text-brand h-8 border-charcoal-border">
                <Activity className="w-3.5 h-3.5" /> State
              </Button>
            </Link>
          </div>
        </div>

        {/* Recovery-data staleness banner */}
        {recoveryStaleDays != null && recoveryStaleDays >= 2 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl glass px-4 py-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-slate-300">
              Recovery data is {recoveryStaleDays} days stale — your wearable sync may need attention.
            </span>
            <Link to="/profile" className="ml-auto text-brand font-semibold whitespace-nowrap">
              Check
            </Link>
          </div>
        )}

        {/* ── METABOLIC GRID (The Engine Room) ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-charcoal-border rounded-xl overflow-hidden border border-charcoal-border shadow-dark-card mb-4">
          
          {/* Expenditure Tile */}
          <div className="bg-charcoal-surface px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" /> Expenditure
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical text-white leading-none">{tdeeResult?.tdee?.toLocaleString() || "—"}</span>
                <span className="text-[9px] text-brand font-medium uppercase">kcal/day</span>
              </div>
            </div>
            {tdeeResult?.method === 'adaptive' ? (
              <span className="text-[8px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20 w-fit leading-none font-bold uppercase tracking-wider">Adaptive</span>
            ) : (
              <span className="text-[8px] text-slate-500 leading-none uppercase tracking-wider font-semibold">Estimated</span>
            )}
          </div>

          {/* Trend Weight Tile */}
          <div className="bg-charcoal-surface px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-sky-400" /> Trend Weight
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical text-white leading-none">{currentBodyWeight || "—"}</span>
                <span className="text-[9px] text-slate-400 font-medium uppercase">{weightUnit}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-slate-500 leading-none">
              <span className={`font-technical font-bold ${bodyWeightChange > 0 ? "text-amber-500" : "text-emerald-400"}`}>
                {bodyWeightChange > 0 ? "+" : ""}{bodyWeightChange?.toFixed(1) || "0.0"}
              </span>
              <span className="uppercase tracking-wider font-semibold">this wk</span>
            </div>
          </div>

          {/* Readiness Tile → Recovery detail */}
          <Link to="/recovery" className="bg-charcoal-surface px-4 py-3 flex flex-col justify-between h-[90px] hover:bg-charcoal-elevated transition-colors group">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-brand" /> Readiness
                <ArrowRight className="w-2.5 h-2.5 text-slate-600 group-hover:text-brand ml-auto transition-colors" />
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical text-white leading-none">{readinessScore ?? "—"}</span>
                <span className={`text-[9px] font-medium uppercase ${readinessCat.color}`}>
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
                      filled
                        ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                        : "bg-slate-800"
                    }`}
                  />
                );
              })}
            </div>
          </Link>

          {/* Nutrition Snapshot */}
          <div className="bg-charcoal-surface px-4 py-3 flex flex-col justify-between h-[90px]">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1.5">
                <Apple className="w-3.5 h-3.5 text-emerald-400" /> Intake
              </p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-technical text-white leading-none">{Math.round(todayMacros.calories)}</span>
                <span className="text-[9px] text-slate-500 leading-none">/ {profile?.daily_calorie_goal} kcal</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-1 bg-slate-900 rounded-full overflow-hidden w-full">
                <div className="h-full bg-brand" style={{ width: `${Math.min(100, (todayMacros.calories / (profile?.daily_calorie_goal || 1)) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 font-technical leading-none">
                <span>P:<span className="text-sky-400">{Math.round(todayMacros.protein)}g</span></span>
                <span>C:<span className="text-amber-500">{Math.round(todayMacros.carbs)}g</span></span>
                <span>F:<span className="text-emerald-500">{Math.round(todayMacros.fats)}g</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* Morning Check-in (if not done) */}
        {!todayCheckIn && (
          <div className="mb-4">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-brand" /> Daily Readiness Check-in
            </h2>
            <MorningCheckin today={today} existingCheckin={todayCheckIn} />
          </div>
        )}

        {/* ── MAIN WORKOUT CARD ── */}
        <div className="mb-4">
          {todayLog ? (
            <div className="rounded-2xl bg-charcoal-surface border border-emerald-500/20 overflow-hidden shadow-dark-card">
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{displayWorkoutTitle || "Session Complete"}</h3>
                    <p className="text-xs text-emerald-400/70 font-bold uppercase tracking-widest">Training Done</p>
                  </div>
                </div>
                <Link to={todayWorkoutLink || "#"}>
                  <Button variant="ghost" size="sm" className="text-xs text-slate-400 border-charcoal-border hover:text-white">View Log</Button>
                </Link>
              </div>
            </div>
          ) : workoutTitle ? (
            <div className="rounded-2xl bg-gradient-to-br from-orange-500/10 to-pink-500/10 border border-orange-500/20 shadow-energy overflow-hidden backdrop-blur-sm relative group hover:border-orange-500/30 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500 to-pink-500 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none" />
              <div className="p-5 relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] text-orange-400 font-bold uppercase tracking-widest mb-1">Today's Mission</p>
                    <h3 className="text-xl font-bold text-white leading-tight">{workoutTitle}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {exerciseCount} lift{exerciseCount !== 1 ? "s" : ""}
                      {todayProgramRuns.length > 0 && ` · ${todayProgramRuns.length} conditioning`}
                      {workoutDuration ? ` · ~${workoutDuration} min` : ""}
                    </p>
                  </div>
                   <Dumbbell className="w-8 h-8 text-orange-500/30 group-hover:text-orange-500/50 transition-colors" />
                </div>
                <Link to={todayWorkoutLink}>
                  <Button variant="energy" className="w-full h-12 text-md font-bold rounded-xl shadow-lg">
                    Start Workout <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <Card className="p-6 text-center border-dashed border-charcoal-border">
              <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Rest Day</p>
              <p className="text-sm text-slate-400 mt-1">Focus on recovery and mobility</p>
            </Card>
          )}
        </div>

        {/* ── SECONDARY CONTENT (Tabs/Lists) ── */}
        <div className="space-y-4">
          {/* The engine's actual prescribed session for today (was never surfaced) */}
          <PrescribedSessionCard today={today} />

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
            <Card className="md:col-span-2 shadow-dark-card border-charcoal-border">
              <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" /> Training Load
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

            <Card className="shadow-dark-card border-charcoal-border overflow-hidden">
               <CardHeader className="pb-0 pt-4 px-5">
                <CardTitle className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Target className="w-3.5 h-3.5" /> Muscle Fatigue
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
