import { useState, useEffect } from "react";
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
  Edit,
  Share2,
  Download,
  Dumbbell,
  Calendar,
  AlertTriangle,
  Repeat,
  Activity,
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

  if (programLoading || enrollmentLoading) return <LoadingScreen />;
  if (!program) {
    return (
      <div className="p-6 text-center">
        <p className="text-ink-muted">Program not found.</p>
        <Link to="/workouts">
          <Button variant="outline" className="mt-4">Back to Workouts</Button>
        </Link>
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
    <div className="p-4 md:p-6 min-h-screen transition-colors duration-300">
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
                  {program.goal && (
                    <Badge variant="outline">
                      {GOAL_LABELS[program.goal] || program.goal}
                    </Badge>
                  )}
                  {enrollment?.status && (
                    <Badge
                      variant="outline"
                      className={
                        enrollment.status === "active"
                          ? "bg-teal/10 text-teal border-teal/25"
                          : enrollment.status === "completed"
                          ? "bg-leaf/10 text-leaf border-leaf/20"
                          : "bg-white/[0.06] text-ink-muted border-white/10"
                      }
                    >
                      {enrollment.status}
                    </Badge>
                  )}
                </div>
                <h1 className="type-display text-2xl mb-1">
                  {program.name}
                </h1>
                {program.description && (
                  <p className="text-ink-muted text-sm">{program.description}</p>
                )}

                <div className="flex flex-wrap gap-4 mt-3 text-sm text-ink-muted ">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-ink-muted " />
                    {durationLabel}
                  </div>
                  <div className="flex items-center gap-1">
                    <Repeat className="w-4 h-4 text-ink-muted " />
                    {frequencyLabel}
                  </div>
                  <div className="flex items-center gap-1">
                    <Dumbbell className="w-4 h-4 text-ink-muted " />
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
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Next Workout
                  </Button>
                )}
                {isEnrolled && (
                  <Button variant="outline" size="sm" onClick={handlePause}>
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                )}
                {enrollment?.status === "paused" && (
                  <Button variant="outline" size="sm" onClick={handleResume}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Resume
                  </Button>
                )}
                {(isEnrolled || enrollment?.status === "paused") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestart}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Cancel Enrollment
                  </Button>
                )}
                {isOwner && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/program-builder?edit=${program.id}`)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        exportProgramAsJson(program);
                        toast.success("Program exported");
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export JSON
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {enrollment && (
              <div className="mt-4 pt-4 border-t hairline">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-technical text-ink-muted">
                    {positionLabel && (
                      <span className="font-semibold mr-2">{positionLabel}</span>
                    )}
                    {completedCount} / {totalWorkouts} workouts
                  </span>
                  <span className="font-technical font-extrabold text-teal">{progressPercent}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal rounded-full transition-all duration-500"
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
            <CardContent className="py-3">
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
            <CycleDayGrid
              workouts={workouts}
              cycleLength={program.cycle_length || program.days_per_week || 7}
              numCycles={program.num_cycles || program.duration_weeks || 4}
              enrollment={enrollment}
              onCellClick={(workout) => {
                if (workout) setShowWorkoutDetail(workout);
              }}
            />
          </CardContent>
        </Card>

        {/* Exercise progression state */}
        {enrollment?.progression_state && Object.keys(enrollment.progression_state).filter(k => !k.startsWith('_')).length > 0 && (
          <Card className="rise-in-3">
            <CardHeader>
              <CardTitle className="text-lg text-ink">Progression Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(enrollment.progression_state)
                  .filter(([key]) => !key.startsWith('_'))
                  .map(([name, state]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between glass-inset p-3"
                    >
                      <div>
                        <p className="font-medium text-sm text-ink">{name}</p>
                        <p className="font-technical text-xs text-ink-muted">
                          {state.sessions_at_current_weight || 0} sessions at current weight
                          {state.last_session_rpe_avg != null && (
                            <> &middot; Avg RIR {state.last_session_rpe_avg.toFixed(1)}</>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="pill-value inline-block text-ink">
                          {state.working_weight} <small className="text-[9.5px] font-semibold text-ink-muted">lbs</small>
                        </p>
                        {state.ready_to_progress && (
                          <Badge variant="green" className="text-xs mt-1">
                            Ready to progress
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
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
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
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
                  <p className="text-sm text-ink-muted ">{showWorkoutDetail.notes}</p>
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
                            {ex.rir_target && ` @ RIR ${ex.rir_target}`}
                          </p>
                        </div>
                        {targets?.workingWeight && (
                          <div className="text-right">
                            <p className="pill-value inline-block text-ink">{targets.workingWeight} <small className="text-[9.5px] font-semibold text-ink-muted">lbs</small></p>
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
                            {c.duration_minutes} min{c.time_of_day !== "anytime" ? ` · ${c.time_of_day.toUpperCase()}` : ""}
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
              <p className="text-sm text-ink-muted  mt-2">
                Enter your current working weight for each exercise (optional — you can also
                enter these during your first session).
              </p>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div>
                <Label className="text-sm text-ink-muted ">Start Date</Label>
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
                  <Label className="flex-1 text-sm text-ink-muted ">{ex.name}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="lbs"
                      className="w-24 bg-charcoal-surface  border-charcoal-border  text-ink placeholder:text-ink-muted "
                      value={startingWeights[ex.name] || ""}
                      onChange={(e) =>
                        setStartingWeights((prev) => ({
                          ...prev,
                          [ex.name]: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                    <span className="text-xs text-ink-muted ">lbs</span>
                  </div>
                </div>
              ))}
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-charcoal-border bg-charcoal-surface  shrink-0">
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
            <p className="text-sm text-ink-muted ">
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
