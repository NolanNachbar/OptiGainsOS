import { useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProgram,
  useEnrollment,
  useEnrollInProgram,
  useUpdateEnrollmentStatus,
  useDeleteProgram,
  useDeleteEnrollment,
} from "@/hooks/useProgramQueries";
import { calculateDailyTargets } from "@/utils/programProgression";
import { exportProgramAsJson } from "@/utils/programIO";
import { checkRecoveryWindow, getWorkoutMuscleGroups } from "@/utils/fatigueManagement";
import CycleDayGrid from "@/components/programs/CycleDayGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen } from "@/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Ban,
  Edit,
  Share2,
  Download,
  Dumbbell,
  Calendar,
  AlertTriangle,
  Repeat,
  Activity,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

const GOAL_LABELS = {
  muscle_gain: "Muscle Gain",
  fat_loss: "Fat Loss",
  strength: "Strength",
  endurance: "Endurance",
  general: "General Fitness",
};


export default function ProgramDetail() {
  const { id: programId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();


  const { program, isLoading: programLoading } = useProgram(programId);
  const { enrollment, isLoading: enrollmentLoading } = useEnrollment(programId);
  const enrollMutation = useEnrollInProgram();
  const statusMutation = useUpdateEnrollmentStatus();
  const deleteMutation = useDeleteProgram();
  const deleteEnrollmentMutation = useDeleteEnrollment();

  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [startingWeights, setStartingWeights] = useState({});
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [showWorkoutDetail, setShowWorkoutDetail] = useState(null);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAllCycles, setShowAllCycles] = useState(false);
  const [showAllProgression, setShowAllProgression] = useState(false);
  const [showManageActions, setShowManageActions] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  if (programLoading || enrollmentLoading) return <LoadingScreen />;
  if (!program) {
    return (
      <div className="p-4 md:p-6">
        <div className="max-w-md mx-auto mt-12">
          <div className="surface p-8 text-center flex flex-col items-center rise-in">
            <div className="w-12 h-12 rounded-full glass-inset flex items-center justify-center mb-4">
              <Dumbbell className="w-6 h-6 text-ink-muted" />
            </div>
            <h2 className="text-lg font-bold text-ink mb-1">Program not found</h2>
            <p className="text-sm text-ink-muted mb-5">
              This program may have been deleted or the link is no longer valid.
            </p>
            <Link to="/workouts">
              <Button variant="outline" size="lg">Back to Workouts</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isOwner = program.created_by === user?.id;
  const isEnrolled = enrollment && enrollment.status === "active";
  const workouts = program.workouts || [];
  const cycleLength = program.cycle_length || program.days_per_week || 7;
  const numCycles = program.num_cycles || program.duration_weeks || 4;

  // Get unique exercise names for starting weight input
  const allExercises = [];
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (!allExercises.find((e) => e.name === ex.name)) {
        allExercises.push(ex);
      }
    }
  }

  // Find the current workout
  const currentDayIndex = enrollment?.current_day_index || enrollment?.current_day || 1;
  const currentWorkout = enrollment
    ? workouts.find((w) => (w.day_index || w.day_number) === currentDayIndex)
    : null;

  // Recovery warnings for current workout
  const recoveryWarnings =
    currentWorkout && enrollment
      ? checkRecoveryWindow(
          getWorkoutMuscleGroups(currentWorkout.exercises || []),
          enrollment.progression_state
        )
      : [];

  const handleEnroll = () => {
    enrollMutation.mutate(
      {
        programId: program.id,
        startingWeights,
        startDate,
      },
      {
        onSuccess: () => {
          setShowEnrollDialog(false);
          toast.success("Enrolled! Start your first workout.");
        },
        onError: () => toast.error("Failed to enroll"),
      }
    );
  };

  const handlePause = () => {
    statusMutation.mutate(
      { id: enrollment.id, status: "paused" },
      { onSuccess: () => toast.success("Program paused") }
    );
  };

  const handleResume = () => {
    statusMutation.mutate(
      { id: enrollment.id, status: "active" },
      { onSuccess: () => toast.success("Program resumed") }
    );
  };

  const handleRestart = () => {
    setShowRestartDialog(true);
  };

  const confirmRestart = () => {
    deleteEnrollmentMutation.mutate(enrollment.id, {
      onSuccess: () => {
        setShowRestartDialog(false);
        toast.success("Enrollment canceled. You can re-enroll anytime!");
      },
      onError: () => {
        setShowRestartDialog(false);
        toast.error("Failed to cancel enrollment");
      },
    });
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate(program.id, {
      onSuccess: () => {
        setShowDeleteDialog(false);
        toast.success("Program deleted");
        navigate("/workouts");
      },
      onError: () => {
        setShowDeleteDialog(false);
        toast.error("Failed to delete program");
      },
    });
  };

  const handleStartWorkout = () => {
    if (!currentWorkout) return;
    navigate(
      `/workout-detail?source=program&enrollmentId=${enrollment.id}&programWorkoutId=${currentWorkout.id}`
    );
  };

  // Progress calculations
  const completedCount = enrollment?.completed_workouts?.length || 0;
  const totalWorkouts = cycleLength * numCycles;
  const progressPercent =
    totalWorkouts > 0 ? Math.round((completedCount / totalWorkouts) * 100) : 0;

  // Header stats
  const currentCycle = enrollment?.current_cycle || enrollment?.current_week || 1;
  const durationLabel = `${cycleLength}-day cycle`;
  const frequencyLabel = `${numCycles} cycle${numCycles !== 1 ? "s" : ""}`;
  const positionLabel = enrollment
    ? `Cycle ${currentCycle}, Day ${currentDayIndex}`
    : null;

  return (
    <div className="p-4 md:p-6 transition-colors duration-300">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate("/workouts")}
          className="flex items-center gap-2 text-ink-muted hover:text-ink mb-4 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Workouts
        </button>

        {/* Header */}
        <Card className="mb-6 overflow-hidden rise-in">
          <CardContent className="pt-5 pb-5">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-2">
                  {(program.focus || program.goal) && (
                    <Badge variant="outline">
                      {GOAL_LABELS[program.focus || program.goal] || program.focus || program.goal}
                    </Badge>
                  )}
                  {enrollment?.status && (
                    <Badge variant="outline" className="text-ink-muted">
                      {enrollment.status}
                    </Badge>
                  )}
                </div>
                <h1 className="type-display text-2xl mb-1">
                  {program.title || program.name}
                </h1>
                {/* Position + progress — the single most important status for an
                    enrolled athlete. Promoted directly under the title with
                    tabular numerals so it is read before any secondary metadata. */}
                {enrollment && positionLabel && (
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-technical text-base font-extrabold text-ink">
                      {positionLabel}
                    </span>
                    <span className="font-technical text-sm text-ink-muted">
                      {completedCount}/{totalWorkouts} workouts &middot; {progressPercent}%
                    </span>
                  </div>
                )}
                {program.description && (
                  <>
                    <p className={`text-ink-muted text-sm ${showDescription ? "" : "line-clamp-2"}`}>
                      {program.description}
                    </p>
                    {program.description.length > 90 && (
                      <button
                        onClick={() => setShowDescription((v) => !v)}
                        className="mt-0.5 min-h-[44px] -my-2.5 inline-flex items-center text-xs font-medium text-ink-muted hover:text-ink transition-colors"
                        aria-expanded={showDescription}
                      >
                        {showDescription ? "Less" : "More"}
                      </button>
                    )}
                  </>
                )}

                {/* Meta row. When enrolled, the promoted position line above already
                    states the cycle/day cadence, so the duration/frequency chips are
                    suppressed to keep Schedule near the first fold; only the unique
                    training-day count remains. Unenrolled visitors still get the full
                    cadence summary. */}
                <div className="flex flex-wrap gap-4 mt-3 text-sm text-ink-muted">
                  {!enrollment && (
                    <>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4 text-ink-muted" />
                        {durationLabel}
                      </div>
                      <div className="flex items-center gap-1">
                        <Repeat className="w-4 h-4 text-ink-muted" />
                        {frequencyLabel}
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-1">
                    <Dumbbell className="w-4 h-4 text-ink-muted" />
                    {workouts.filter((w) => w.exercises?.length > 0).length} training days
                  </div>
                </div>

                {program.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {program.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 min-w-[160px]">
                {!enrollment && (
                  <>
                    <Button
                      onClick={() => user ? setShowEnrollDialog(true) : navigate("/login", { state: { returnTo: location.pathname } })}
                      variant="volt"
                      size="lg"
                      className="w-full"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {user ? "Start Program" : "Sign in to Start"}
                    </Button>
                    {!user && (
                      <p className="text-xs text-center text-ink-muted">
                        New here?{' '}
                        <Link
                          to="/signup"
                          state={{ returnTo: location.pathname }}
                          className="text-brand hover:text-brand font-medium"
                        >
                          Sign up free
                        </Link>
                      </p>
                    )}
                  </>
                )}
                {isEnrolled && currentWorkout && (
                  <Button
                    onClick={handleStartWorkout}
                    variant="volt"
                    size="lg"
                    className="w-full"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Next Workout
                  </Button>
                )}
                {enrollment?.status === "paused" && (
                  <Button variant="volt" size="lg" className="w-full" onClick={handleResume}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Resume
                  </Button>
                )}

                {/* Secondary / management controls — keep at most two demoted controls
                    inline; route power-user (Edit/Export) and destructive (Delete)
                    actions behind a "Manage" overflow toggle. */}
                {(isEnrolled || enrollment?.status === "paused" || isOwner) && (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-3 gap-2">
                      {isEnrolled && (
                        <Button variant="dim" size="lg" className="w-full min-w-0" onClick={handlePause}>
                          <Pause className="w-4 h-4 mr-1.5" />
                          Pause
                        </Button>
                      )}
                      {(isEnrolled || enrollment?.status === "paused") && (
                        <Button
                          variant="dim"
                          size="lg"
                          className="w-full min-w-0"
                          onClick={handleRestart}
                        >
                          <Ban className="w-4 h-4 mr-1.5" />
                          Cancel
                        </Button>
                      )}
                      {isOwner && (
                        <Button
                          variant="dim"
                          size="lg"
                          className="w-full min-w-0"
                          onClick={() => setShowManageActions((v) => !v)}
                          aria-expanded={showManageActions}
                        >
                          Manage
                          <ChevronDown className={`w-4 h-4 ml-1.5 transition-transform ${showManageActions ? "rotate-180" : ""}`} />
                        </Button>
                      )}
                    </div>
                    {isOwner && showManageActions && (
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant="dim"
                          size="lg"
                          className="w-full min-w-0"
                          onClick={() => navigate(`/program-builder?edit=${program.id}`)}
                        >
                          <Edit className="w-4 h-4 mr-1.5" />
                          Edit
                        </Button>
                        <Button
                          variant="dim"
                          size="lg"
                          className="w-full min-w-0"
                          onClick={() => {
                            exportProgramAsJson(program);
                            toast.success("Program exported");
                          }}
                        >
                          <Download className="w-4 h-4 mr-1.5" />
                          Export
                        </Button>
                        <Button
                          variant="destructive"
                          size="lg"
                          className="w-full min-w-0"
                          onClick={handleDelete}
                        >
                          <Trash2 className="w-4 h-4 mr-1.5" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar — the position/count/percent now live in the
                promoted slot under the title, so this is just the visual track. */}
            {enrollment && (
              <div className="mt-4 pt-4 border-t hairline">
                <div className="h-1.5 bg-track rounded-full overflow-hidden">
                  <div
                    className="h-full bg-leaf/40 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recovery warnings */}
        {recoveryWarnings.length > 0 && (
          <Card className="mb-4 border-[0.5px] !border-[rgba(var(--warn-rgb)/0.30)]">
            <CardContent className="pt-3 pb-3">
              {recoveryWarnings.map((w) => (
                <div key={w.muscle} className="flex items-start gap-2 text-sm text-ink-muted">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-warn" />
                  <span>{w.message}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Schedule Grid */}
        <Card className="mb-6 rise-in-2">
          <CardHeader>
            <CardTitle className="text-lg text-ink">Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Collapsed default: window to the single current cycle so the fold
                lands on current-cycle schedule + progression within ~2 viewports.
                Expanded reveals every cycle from the start via the toggle. */}
            <CycleDayGrid
              workouts={workouts}
              cycleLength={cycleLength}
              startCycle={showAllCycles ? 1 : currentCycle}
              numCycles={showAllCycles ? numCycles : 1}
              enrollment={enrollment}
              onCellClick={(workout) => {
                if (workout) setShowWorkoutDetail(workout);
              }}
            />
            {numCycles > 1 && (
              <button
                onClick={() => setShowAllCycles((v) => !v)}
                className="mt-4 w-full flex items-center justify-center gap-1.5 min-h-[44px] text-sm font-medium text-ink-muted hover:text-ink transition-colors"
              >
                {showAllCycles ? "Show current cycle only" : `Show all ${numCycles} cycles`}
                <ChevronDown className={`w-4 h-4 transition-transform ${showAllCycles ? "rotate-180" : ""}`} />
              </button>
            )}
          </CardContent>
        </Card>

        {/* Exercise progression state */}
        {enrollment?.progression_state && Object.keys(enrollment.progression_state).filter(k => !k.startsWith('_')).length > 0 && (
          <Card className="rise-in-3">
            <CardHeader>
              <CardTitle className="text-lg text-ink">Progression Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
              const DEFAULT_VISIBLE = 5;
              const allEntries = Object.entries(enrollment.progression_state).filter(([key]) => !key.startsWith('_'));
              // Prioritize stalled exercises ahead of ready-to-progress so the cap keeps the most urgent.
              const actionableEntries = allEntries
                .filter(([, state]) => state.stalled || state.ready_to_progress)
                .sort(([, a], [, b]) => (b.stalled ? 1 : 0) - (a.stalled ? 1 : 0));
              const baseEntries = actionableEntries.length === 0 ? allEntries : actionableEntries;
              // Collapsed by default: lead with a small capped list, route the rest behind "Show all".
              const visibleEntries = showAllProgression ? allEntries : baseEntries.slice(0, DEFAULT_VISIBLE);
              const hiddenCount = allEntries.length - visibleEntries.length;
              // Surface any stall suggestion that repeats verbatim on 2+ visible cards once as a
              // banner instead of having the user re-read identical boilerplate per card.
              const suggestionCounts = visibleEntries
                .filter(([, s]) => s.stalled && s.stall_suggestion)
                .reduce((acc, [, s]) => acc.set(s.stall_suggestion, (acc.get(s.stall_suggestion) || 0) + 1), new Map());
              const sharedSuggestions = [...suggestionCounts.entries()]
                .filter(([, count]) => count >= 2)
                .map(([text]) => text);
              const sharedSet = new Set(sharedSuggestions);
              return (
              <div className="space-y-2">
                {sharedSuggestions.map((text) => (
                  <div key={text} className="glass-inset p-3 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-warn" />
                    <p className="font-technical text-xs text-warn">{text}</p>
                  </div>
                ))}
                {visibleEntries
                  .map(([name, state]) => {
                    const effortVal = state.last_session_rir_avg ?? state.last_session_rpe_avg;
                    return (
                    <div key={name} className="glass-inset p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm text-ink">{name}</p>
                        <p className="font-technical text-xs text-ink-muted">
                          {state.sessions_at_current_weight || 0} sessions at current weight
                          {effortVal != null && (
                            <> &middot; Avg RIR {effortVal.toFixed(1)}</>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="pill-value inline-block text-ink">
                          {state.working_weight ?? '—'} <small className="text-[10px] font-semibold text-ink-muted">lbs</small>
                        </p>
                        {state.stalled ? (
                          <Badge variant="outline" className="text-xs mt-1 bg-warn/10 text-warn border-warn/25">
                            Stalled
                          </Badge>
                        ) : state.ready_to_progress && (
                          <Badge variant="green" className="text-xs mt-1">
                            Ready to progress
                          </Badge>
                        )}
                      </div>
                    </div>
                    {state.stalled && state.stall_suggestion && !sharedSet.has(state.stall_suggestion) && (
                      <p className="font-technical text-xs text-warn mt-2 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{state.stall_suggestion}</span>
                      </p>
                    )}
                    </div>
                  );
                  })}
                {!showAllProgression && hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAllProgression(true)}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 min-h-[44px] text-sm font-medium text-ink-muted hover:text-ink transition-colors"
                  >
                    Show all {allEntries.length} exercises
                    <ChevronDown className="w-4 h-4" />
                  </button>
                )}
                {showAllProgression && allEntries.length > DEFAULT_VISIBLE && (
                  <button
                    onClick={() => setShowAllProgression(false)}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 min-h-[44px] text-sm font-medium text-ink-muted hover:text-ink transition-colors"
                  >
                    Show fewer
                    <ChevronDown className="w-4 h-4 rotate-180" />
                  </button>
                )}
              </div>
              );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Workout detail dialog */}
        <Dialog open={!!showWorkoutDetail} onOpenChange={() => setShowWorkoutDetail(null)}>
          <DialogContent className="max-w-lg flex flex-col max-h-[85vh] p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-charcoal-border  flex-shrink-0">
              <DialogTitle>{showWorkoutDetail?.title}</DialogTitle>
            </DialogHeader>
            {showWorkoutDetail && (
              <div
                className="overflow-y-auto flex-1 px-6 py-4 space-y-3"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
              >
                <div className="flex gap-2 text-sm text-ink-muted">
                  <span>Day {showWorkoutDetail.day_index || showWorkoutDetail.day_number}</span>
                  {showWorkoutDetail.type && (
                    <>
                      <span>&middot;</span>
                      <Badge variant="outline" className="capitalize text-xs">
                        {showWorkoutDetail.type}
                      </Badge>
                    </>
                  )}
                </div>
                {showWorkoutDetail.notes && (
                  <p className="text-sm text-ink-muted">{showWorkoutDetail.notes}</p>
                )}
                <div className="space-y-2">
                  {(showWorkoutDetail.exercises || []).map((ex, i) => {
                    const targets =
                      enrollment
                        ? calculateDailyTargets(ex, enrollment.progression_state)
                        : null;

                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between glass-inset p-3"
                      >
                        <div>
                          <p className="font-medium text-sm text-ink">{ex.name}</p>
                          <p className="font-technical text-xs text-ink-muted">
                            {ex.sets} sets &times; {ex.rep_target || "?"} reps
                            {ex.rir_target != null && ` @ RIR ${ex.rir_target}`}
                          </p>
                        </div>
                        {targets?.workingWeight && (
                          <div className="text-right">
                            <p className="pill-value inline-block text-ink">{targets.workingWeight} <small className="text-[10px] font-semibold text-ink-muted">lbs</small></p>
                            <p className="font-technical text-xs text-ink-muted mt-0.5">
                              Min: {targets.dailyMin} lbs
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(showWorkoutDetail.cardio_sessions || []).map((c, i) => (
                    <div
                      key={`cardio-${i}`}
                      className="flex items-center justify-between glass-inset p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-carb" />
                        <div>
                          <p className="font-medium text-sm text-ink">{c.title}</p>
                          <p className="font-technical text-xs text-ink-muted">
                            {c.duration_minutes} min{c.time_of_day && c.time_of_day !== "anytime" ? ` · ${c.time_of_day.toUpperCase()}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full px-2 py-[3px] text-[9.5px] font-extrabold uppercase tracking-wide bg-carb/[0.14] text-carb whitespace-nowrap">
                        Cardio
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Enrollment dialog */}
        <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
          <DialogContent className="max-w-lg flex flex-col p-0 overflow-hidden">
            <div className="px-6 pt-6 pb-4 shrink-0">
              <DialogHeader>
                <DialogTitle>Start Program</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-ink-muted mt-2">
                Enter your current working weight for each exercise (optional — you can also
                enter these during your first session).
              </p>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div>
                <Label className="text-sm text-ink-muted">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 glass glass-interactive text-ink [color-scheme:dark]"
                />
              </div>

              <div className="space-y-3">
              {allExercises.map((ex) => (
                <div key={ex.name} className="flex items-center gap-3">
                  <Label className="flex-1 text-sm text-ink-muted">{ex.name}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="lbs"
                      className="w-24 glass glass-interactive placeholder:text-ink-muted"
                      value={startingWeights[ex.name] || ""}
                      onChange={(e) =>
                        setStartingWeights((prev) => ({
                          ...prev,
                          [ex.name]: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                    <span className="text-xs text-ink-muted">lbs</span>
                  </div>
                </div>
              ))}
              </div>
            </div>
            <div
              className="flex gap-2 px-6 py-4 border-t border-charcoal-border bg-charcoal-surface  shrink-0"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <Button variant="outline" className="flex-1" onClick={() => setShowEnrollDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="volt"
                className="flex-1"
                onClick={handleEnroll}
                disabled={enrollMutation.isPending}
              >
                {enrollMutation.isPending ? "Starting..." : "Start Program"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Cancel Enrollment Confirmation Dialog */}
        <Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel Enrollment?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-ink-muted">
              Are you sure you want to cancel your enrollment in this program? Future scheduled workouts will be removed, but your completed workout history will be preserved. You can re-enroll later to start fresh.
            </p>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => setShowRestartDialog(false)}
                className="flex-1"
              >
                Keep Enrollment
              </Button>
              <Button
                onClick={confirmRestart}
                variant="destructive"
                className="flex-1"
                disabled={deleteEnrollmentMutation.isPending}
              >
                {deleteEnrollmentMutation.isPending ? "Canceling..." : "Cancel Enrollment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Program Confirmation */}
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title="Delete Program?"
          description="This will permanently delete this program and all its workouts. This action cannot be undone."
          confirmText="Delete Program"
          cancelText="Cancel"
          variant="danger"
          onConfirm={confirmDelete}
          loading={deleteMutation.isPending}
        />
      </div>
    </div>
  );
}
