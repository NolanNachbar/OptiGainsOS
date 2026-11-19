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
import CycleDayGrid from "@/components/programs/CycleDayGrid";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, LoadingState, ErrorState, ListRow, Stat, cn } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Ban,
  Edit,
  Share2,
  Download,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { getTodayString } from "@/utils/dateUtils";

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


  const { program, isLoading: programLoading, error: programError } = useProgram(programId);
  const { enrollment, isLoading: enrollmentLoading } = useEnrollment(programId);
  const enrollMutation = useEnrollInProgram();
  const statusMutation = useUpdateEnrollmentStatus();
  const deleteMutation = useDeleteProgram();
  const deleteEnrollmentMutation = useDeleteEnrollment();

  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [startingWeights, setStartingWeights] = useState({});
  // null until the user picks one, so the default tracks the profile timezone
  // even if the profile loads after this page mounts.
  const [pickedStartDate, setStartDate] = useState(null);
  const startDate = pickedStartDate ?? getTodayString();
  const [showWorkoutDetail, setShowWorkoutDetail] = useState(null);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAllCycles, setShowAllCycles] = useState(false);
  const [showAllProgression, setShowAllProgression] = useState(false);
  const [showManageActions, setShowManageActions] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  // Page-shaped skeleton (header + Schedule card) on the dark field, padded for
  // the dock so it can't clip. Scoped to this route — loading-spinner.jsx is
  // shared, so the full-screen LoadingScreen is intentionally not used here.
  if (programLoading || enrollmentLoading) {
    return (
      <div className="max-w-4xl mx-auto" style={{ paddingBottom: 'var(--dock-clearance)' }}>
        <LoadingState rows={5} label="Loading program" />
      </div>
    );
  }
  // Treat a query error the same as a missing program so the not-found state
  // paints immediately instead of waiting on retries.
  if (!program || programError) {
    return (
      <div className="max-w-4xl mx-auto" style={{ paddingBottom: 'var(--dock-clearance)' }}>
        <ErrorState title="Program not found">
          Deleted, or the link is no longer valid.
          <Link to="/workouts" className="block mt-3">
            <Button variant="primary" size="lg">Back to Workouts</Button>
          </Link>
        </ErrorState>
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
          toast.success("Enrolled. Start the first workout from this page.");
        },
        onError: () => toast.error("Not enrolled. Check your connection and try again."),
      }
    );
  };

  const handlePause = () => {
    statusMutation.mutate(
      { id: enrollment.id, status: "paused" },
      { onSuccess: () => toast.success("Program paused.") }
    );
  };

  const handleResume = () => {
    statusMutation.mutate(
      { id: enrollment.id, status: "active" },
      { onSuccess: () => toast.success("Program resumed.") }
    );
  };

  const handleRestart = () => {
    setShowRestartDialog(true);
  };

  const confirmRestart = () => {
    deleteEnrollmentMutation.mutate(enrollment.id, {
      onSuccess: () => {
        setShowRestartDialog(false);
        toast.success("Enrollment canceled. You can re-enroll at any time.");
      },
      onError: () => {
        setShowRestartDialog(false);
        toast.error("Enrollment not canceled. Try again.");
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
        toast.success("Program deleted.");
        navigate("/workouts");
      },
      onError: () => {
        setShowDeleteDialog(false);
        toast.error("Program not deleted. Try again.");
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

  const primaryAction = !enrollment
    ? { label: user ? "Start Program" : "Sign in to Start", onClick: () => user ? setShowEnrollDialog(true) : navigate("/login", { state: { returnTo: location.pathname } }) }
    : isEnrolled && currentWorkout
    ? { label: "Start Next Workout", onClick: handleStartWorkout }
    : enrollment?.status === "paused"
    ? { label: "Resume", onClick: handleResume }
    : null;

  const trainingDays = workouts.filter((w) => w.exercises?.length > 0).length;
  const goal = program.focus || program.goal;

  return (
    <div>
      {primaryAction && (
        <div
          className="md:hidden fixed inset-x-0 bottom-0 z-30 px-gutter pt-3 bg-charcoal-surface border-t border-charcoal-border shadow-elev-2"
          style={{ paddingBottom: 'calc(var(--dock-total-height) + 16px + env(safe-area-inset-bottom))' }}
        >
          <Button variant="primary" size="lg" className="w-full" onClick={primaryAction.onClick}>
            <Play className="w-4 h-4 mr-2" />
            {primaryAction.label}
          </Button>
        </div>
      )}
      <div className="max-w-2xl mx-auto pb-[calc(6rem+var(--dock-total-height))] md:pb-[var(--dock-clearance)]">
        <PageHeader
          eyebrow={goal ? (GOAL_LABELS[goal] || goal) : undefined}
          title={program.title || program.name}
          meta={enrollment && positionLabel ? positionLabel : `${durationLabel} · ${frequencyLabel}`}
        />

        <div className="flex flex-col gap-stack">
        <Card>
          <CardContent className="pt-4 flex flex-col gap-3">
            {enrollment?.status && enrollment.status !== "active" && (
              <div>
                <Badge variant="outline" className="capitalize">{enrollment.status}</Badge>
              </div>
            )}
            {enrollment && positionLabel && (
              <div className="flex flex-col gap-2">
                <Stat
                  size="sm"
                  label="Progress"
                  value={`${completedCount} / ${totalWorkouts}`}
                  unit="workouts"
                  reason={`${progressPercent}% of ${numCycles} cycle${numCycles !== 1 ? "s" : ""} complete`}
                />
                <div className="h-1.5 bg-track rounded-pill overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-pill transition-[width] duration-slow ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
            {program.description && (
              <div>
                <p className={cn("text-body text-ink-muted", !showDescription && "line-clamp-2")}>
                  {program.description}
                </p>
                {program.description.length > 90 && (
                  <button
                    onClick={() => setShowDescription((v) => !v)}
                    className="min-h-tap inline-flex items-center text-caption text-ink-muted hover:text-ink transition-colors duration-base"
                    aria-expanded={showDescription}
                  >
                    {showDescription ? "Less" : "More"}
                  </button>
                )}
              </div>
            )}
            <p className="text-caption text-ink-muted tabular-nums">{trainingDays} training days</p>
            {program.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {program.tags.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                ))}
              </div>
            )}
              <div className="flex flex-col gap-2">
                {!enrollment && (
                  <>
                    <Button
                      onClick={() => user ? setShowEnrollDialog(true) : navigate("/login", { state: { returnTo: location.pathname } })}
                      variant="primary"
                      size="lg"
                      className="hidden md:flex w-full"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {user ? "Start Program" : "Sign in to Start"}
                    </Button>
                    {!user && (
                      <p className="text-caption text-center text-ink-muted">
                        New here?{' '}
                        <Link
                          to="/signup"
                          state={{ returnTo: location.pathname }}
                          className="text-ink underline"
                        >
                          Sign up
                        </Link>
                      </p>
                    )}
                  </>
                )}
                {isEnrolled && currentWorkout && (
                  <Button
                    onClick={handleStartWorkout}
                    variant="primary"
                    size="lg"
                    className="hidden md:flex w-full"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Next Workout
                  </Button>
                )}
                {enrollment?.status === "paused" && (
                  <Button variant="primary" size="lg" className="hidden md:flex w-full" onClick={handleResume}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Resume
                  </Button>
                )}

                {/* Secondary / management controls — the default header carries
                    only the coral CTA + a single "Manage" toggle. Every demoted
                    control (Pause/Cancel status actions, owner Edit/Export, and
                    destructive Delete) lives inside the overflow so the resting
                    header reads as one action, not a wall of grey buttons. */}
                {(isEnrolled || enrollment?.status === "paused" || isOwner) && (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => setShowManageActions((v) => !v)}
                      aria-expanded={showManageActions}
                    >
                      Manage
                      <ChevronDown className={`w-4 h-4 ml-1.5 transition-transform duration-base ${showManageActions ? "rotate-180" : ""}`} />
                    </Button>
                    {showManageActions && (
                      <div className="grid grid-cols-2 gap-2">
                        {isEnrolled && (
                          <Button variant="secondary" className="w-full min-w-0" onClick={handlePause}>
                            <Pause className="w-4 h-4 mr-1.5" />
                            Pause
                          </Button>
                        )}
                        {(isEnrolled || enrollment?.status === "paused") && (
                          <Button
                            variant="secondary"
                            className="w-full min-w-0"
                            onClick={handleRestart}
                          >
                            <Ban className="w-4 h-4 mr-1.5" />
                            Cancel
                          </Button>
                        )}
                        {isOwner && (
                          <Button
                            variant="secondary"
                            className="w-full min-w-0"
                            onClick={() => navigate(`/program-builder?edit=${program.id}`)}
                          >
                            <Edit className="w-4 h-4 mr-1.5" />
                            Edit
                          </Button>
                        )}
                        {isOwner && (
                          <Button
                            variant="secondary"
                            className="w-full min-w-0"
                            onClick={() => {
                              exportProgramAsJson(program);
                              toast.success("Program exported.");
                            }}
                          >
                            <Download className="w-4 h-4 mr-1.5" />
                            Export
                          </Button>
                        )}
                        {isOwner && (
                          <Button
                            variant="destructive"
                            className="w-full min-w-0"
                            onClick={handleDelete}
                          >
                            <Trash2 className="w-4 h-4 mr-1.5" />
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
          </CardContent>
        </Card>

        {/* Schedule Grid */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
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
                className="mt-4 w-full flex items-center justify-center gap-1.5 min-h-tap text-body text-ink-muted hover:text-ink transition-colors duration-base"
              >
                {showAllCycles ? "Show current cycle only" : `Show all ${numCycles} cycles`}
                <ChevronDown className={`w-4 h-4 transition-transform duration-base ${showAllCycles ? "rotate-180" : ""}`} />
              </button>
            )}
          </CardContent>
        </Card>

        {/* Exercise progression state */}
        {enrollment?.progression_state && Object.keys(enrollment.progression_state).filter(k => !k.startsWith('_')).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Progression</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
              const DEFAULT_VISIBLE = 5;
              const allEntries = Object.entries(enrollment.progression_state).filter(([key]) => !key.startsWith('_'));
              // Prioritize stalled exercises ahead of ready-to-progress so the cap keeps the most urgent.
              const actionableEntries = allEntries
                .filter(([, state]) => (state.stalled && Number(state.working_weight) > 0) || state.ready_to_progress)
                .sort(([, a], [, b]) => (b.stalled ? 1 : 0) - (a.stalled ? 1 : 0));
              const baseEntries = actionableEntries.length === 0 ? allEntries : actionableEntries;
              // Collapsed by default: lead with a small capped list, route the rest behind "Show all".
              const visibleEntries = showAllProgression ? allEntries : baseEntries.slice(0, DEFAULT_VISIBLE);
              const hiddenCount = allEntries.length - visibleEntries.length;
              // Surface any stall suggestion that repeats verbatim on 2+ visible cards once as a
              // banner instead of having the user re-read identical boilerplate per card.
              // Bodyweight lifts have no load, so a weight-based stall verdict is meaningless for them.
              const isBodyweight = (s) => !(Number(s.working_weight) > 0);
              const isStalled = (s) => s.stalled && !isBodyweight(s);
              // Near-identical advice (differing only by digits/case/spacing) collapses to one banner.
              const adviceKey = (t) => t.toLowerCase().replace(/[\d.]+/g, "#").replace(/\s+/g, " ").trim();
              const suggestionCounts = visibleEntries
                .filter(([, s]) => isStalled(s) && s.stall_suggestion)
                .reduce((acc, [, s]) => {
                  const k = adviceKey(s.stall_suggestion);
                  const cur = acc.get(k);
                  return acc.set(k, { text: cur?.text ?? s.stall_suggestion, count: (cur?.count || 0) + 1 });
                }, new Map());
              const sharedSuggestions = [...suggestionCounts.values()]
                .filter(({ count }) => count >= 2)
                .map(({ text }) => text);
              const sharedKeys = new Set([...suggestionCounts.entries()].filter(([, v]) => v.count >= 2).map(([k]) => k));
              return (
              <div className="space-y-2">
                {sharedSuggestions.map((text) => (
                  <Card key={text} variant="inset" className="p-3 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-warn" />
                    <p className="text-caption text-warn tabular-nums">{text}</p>
                  </Card>
                ))}
                {visibleEntries
                  .map(([name, state]) => {
                    const effortVal = state.last_session_rir_avg ?? state.last_session_rpe_avg;
                    const sessions = state.sessions_at_current_weight || 0;
                    const bodyweight = isBodyweight(state);
                    return (
                    <Card key={name} variant="inset" className="overflow-hidden">
                      <ListRow
                        title={name}
                        value={bodyweight ? "Bodyweight" : state.working_weight}
                        unit={bodyweight ? undefined : "lb"}
                        trailing={
                          isStalled(state) ? (
                            <Badge variant="amber">Stalled</Badge>
                          ) : state.ready_to_progress ? (
                            <Badge variant="outline">Ready to progress</Badge>
                          ) : null
                        }
                      >
                        <span className="block text-caption text-ink-muted">
                          {`${sessions} session${sessions === 1 ? "" : "s"}${bodyweight ? "" : " at current weight"}${effortVal != null ? ` · avg ${effortVal.toFixed(1)} RIR` : ""}`}
                        </span>
                      </ListRow>
                      {isStalled(state) && state.stall_suggestion && !sharedKeys.has(adviceKey(state.stall_suggestion)) && (
                        <p className="px-gutter pb-3 text-caption text-warn tabular-nums flex items-start gap-2">
                          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{state.stall_suggestion}</span>
                        </p>
                      )}
                    </Card>
                  );
                  })}
                {!showAllProgression && hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAllProgression(true)}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 min-h-tap text-body text-ink-muted hover:text-ink transition-colors duration-base"
                  >
                    Show all {allEntries.length} exercises
                    <ChevronDown className="w-4 h-4" />
                  </button>
                )}
                {showAllProgression && allEntries.length > DEFAULT_VISIBLE && (
                  <button
                    onClick={() => setShowAllProgression(false)}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 min-h-tap text-body text-ink-muted hover:text-ink transition-colors duration-base"
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

        </div>

        {/* Workout detail dialog */}
        <Dialog open={!!showWorkoutDetail} onOpenChange={() => setShowWorkoutDetail(null)}>
          <DialogContent className="max-w-lg flex flex-col max-h-[85vh] p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-charcoal-border flex-shrink-0">
              <DialogTitle>{showWorkoutDetail?.title}</DialogTitle>
            </DialogHeader>
            {showWorkoutDetail && (
              <div
                className="overflow-y-auto flex-1 px-6 py-4 space-y-3"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
              >
                <div className="flex gap-2 text-body text-ink-muted">
                  <span>Day {showWorkoutDetail.day_index || showWorkoutDetail.day_number}</span>
                  {showWorkoutDetail.type && (
                    <>
                      <span>&middot;</span>
                      <Badge variant="outline" className="capitalize">
                        {showWorkoutDetail.type}
                      </Badge>
                    </>
                  )}
                </div>
                {showWorkoutDetail.notes && (
                  <p className="text-body text-ink-muted">{showWorkoutDetail.notes}</p>
                )}
                <div className="space-y-2">
                  {(showWorkoutDetail.exercises || []).map((ex, i) => {
                    const targets =
                      enrollment
                        ? calculateDailyTargets(ex, enrollment.progression_state)
                        : null;

                    return (
                      <Card key={i} variant="inset" className="overflow-hidden">
                        <ListRow
                          title={ex.name}
                          detail={`${ex.sets} sets × ${ex.rep_target || "?"} reps${ex.rir_target != null ? ` @ RIR ${ex.rir_target}` : ""}`}
                          value={targets?.workingWeight || undefined}
                          unit={targets?.workingWeight ? "lb" : undefined}
                          trailing={targets?.workingWeight ? <span className="text-caption text-ink-muted tabular-nums">Min {targets.dailyMin} lb</span> : null}
                        />
                      </Card>
                    );
                  })}
                  {(showWorkoutDetail.cardio_sessions || []).map((c, i) => (
                    <Card key={`cardio-${i}`} variant="inset" className="overflow-hidden">
                      <ListRow
                        title={c.title}
                        detail={`${c.duration_minutes} min${c.time_of_day && c.time_of_day !== "anytime" ? ` · ${c.time_of_day.toUpperCase()}` : ""}`}
                        trailing={<Badge variant="outline">Cardio</Badge>}
                      />
                    </Card>
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
              <p className="text-body text-ink-muted mt-2">
                Enter your current working weight for each exercise (optional, you can also
                enter these during your first session).
              </p>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div>
                <Label className="text-body text-ink-muted">Start date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 [color-scheme:dark]"
                />
              </div>

              <div className="space-y-3">
              {allExercises.map((ex) => (
                <div key={ex.name} className="flex items-center gap-3">
                  <Label className="flex-1 text-body text-ink-muted">{ex.name}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" inputMode="decimal"
                      placeholder="lb"
                      className="w-24"
                      value={startingWeights[ex.name] || ""}
                      onChange={(e) =>
                        setStartingWeights((prev) => ({
                          ...prev,
                          [ex.name]: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                    <span className="text-caption text-ink-muted">lb</span>
                  </div>
                </div>
              ))}
              </div>
            </div>
            <div
              className="flex gap-2 px-6 py-4 border-t border-charcoal-border shrink-0"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <Button variant="outline" className="flex-1" onClick={() => setShowEnrollDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleEnroll}
                disabled={enrollMutation.isPending}
              >
                {enrollMutation.isPaused
                  // React Query's default networkMode pauses (not fails) a
                  // mutation while offline — it resumes on its own on
                  // reconnect, so onError (handleEnroll's "Not enrolled. Check your connection and try again.")
                  // never fires. Same pattern as fuel f2590dcd.
                  ? "Offline - starts when you're back online"
                  : enrollMutation.isPending ? "Starting..." : "Start Program"}
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
            <p className="text-body text-ink-muted">
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
