import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { analytics } from "@/lib/analytics.js";
import {
  useProgram,
  useEnrollment,
  useEnrollInProgram,
  useUpdateEnrollmentStatus,
  useDeleteProgram,
  useDeleteEnrollment,
} from "@/hooks/useProgramQueries";
import { useShareProgram } from "@/hooks/useSocialQueries";
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
import { DIFFICULTY_COLORS } from "@/lib/constants";
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

const DIFFICULTY_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export default function ProgramDetail() {
  const { id: programId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (programId) analytics.programDeepLink(programId);
  }, [programId]);

  const { program, isLoading: programLoading } = useProgram(programId);
  const { enrollment, isLoading: enrollmentLoading } = useEnrollment(programId);
  const enrollMutation = useEnrollInProgram();
  const statusMutation = useUpdateEnrollmentStatus();
  const deleteMutation = useDeleteProgram();
  const deleteEnrollmentMutation = useDeleteEnrollment();
  const shareMutation = useShareProgram();

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
        <p className="text-slate-500">Program not found.</p>
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
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen transition-colors duration-300">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate("/workouts")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-4 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Workouts
        </button>

        {/* Header */}
        <Card className="border border-slate-200 dark:border-slate-700 shadow-lg mb-6 bg-white dark:bg-slate-800 border-l-4 border-l-purple-500 overflow-hidden">
          <CardContent className="pt-5 pb-5">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-2">
                  {program.difficulty && (
                    <Badge className={DIFFICULTY_COLORS[program.difficulty]}>
                      {DIFFICULTY_LABELS[program.difficulty] || program.difficulty}
                    </Badge>
                  )}
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
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700"
                          : enrollment.status === "completed"
                          ? "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:border-primary-700"
                          : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600"
                      }
                    >
                      {enrollment.status}
                    </Badge>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                  {program.name}
                </h1>
                {program.description && (
                  <p className="text-slate-500 text-sm">{program.description}</p>
                )}

                <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    {durationLabel}
                  </div>
                  <div className="flex items-center gap-1">
                    <Repeat className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    {frequencyLabel}
                  </div>
                  <div className="flex items-center gap-1">
                    <Dumbbell className="w-4 h-4 text-slate-400 dark:text-slate-500" />
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
                      className="bg-primary-600 hover:bg-primary-700"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {user ? "Start Program" : "Sign in to Start"}
                    </Button>
                    {!user && (
                      <p className="text-xs text-center text-slate-500">
                        New here?{' '}
                        <Link
                          to="/signup"
                          state={{ returnTo: location.pathname }}
                          className="text-primary-600 hover:text-primary-500 font-medium"
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
                    className="bg-primary-600 hover:bg-primary-700"
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
                {enrollment && (
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
                      onClick={() => {
                        shareMutation.mutate(
                          { programId: program.id, caption: "", isPublic: true },
                          {
                            onSuccess: () => toast.success("Program shared!"),
                            onError: () => toast.error("Failed to share"),
                          }
                        );
                      }}
                      disabled={shareMutation.isPending}
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                    </Button>
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
                      variant="outline"
                      size="sm"
                      className="text-danger-600 hover:bg-danger-50"
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
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-600 dark:text-slate-400">
                    {positionLabel && (
                      <span className="font-medium mr-2">{positionLabel}</span>
                    )}
                    {completedCount} / {totalWorkouts} workouts
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">{progressPercent}%</span>
                </div>
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recovery warnings */}
        {recoveryWarnings.length > 0 && (
          <Card className="border border-slate-200 dark:border-slate-700 shadow-sm mb-4 border-l-4 border-l-warning-400 bg-white dark:bg-slate-800">
            <CardContent className="py-3">
              {recoveryWarnings.map((w) => (
                <div key={w.muscle} className="flex items-start gap-2 text-sm text-warning-700 dark:text-warning-400">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{w.message}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Schedule Grid */}
        <Card className="border border-slate-200 dark:border-slate-700 shadow-lg mb-6 bg-white dark:bg-slate-800">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900 dark:text-white">Schedule</CardTitle>
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
          <Card className="border border-slate-200 dark:border-slate-700 shadow-lg bg-white dark:bg-slate-800">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900 dark:text-white">Progression Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(enrollment.progression_state)
                  .filter(([key]) => !key.startsWith('_'))
                  .map(([name, state]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/60"
                    >
                      <div>
                        <p className="font-medium text-sm text-slate-900 dark:text-white">{name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {state.sessions_at_current_weight || 0} sessions at current weight
                          {state.last_session_rpe_avg != null && (
                            <> &middot; Avg RIR {state.last_session_rpe_avg.toFixed(1)}</>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900 dark:text-white">
                          {state.working_weight} lbs
                        </p>
                        {state.ready_to_progress && (
                          <Badge className="bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400 text-xs">
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
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
              <DialogTitle>{showWorkoutDetail?.title}</DialogTitle>
            </DialogHeader>
            {showWorkoutDetail && (
              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
                <div className="flex gap-2 text-sm text-slate-500">
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
                  <p className="text-sm text-slate-600 dark:text-slate-400">{showWorkoutDetail.notes}</p>
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
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/60"
                      >
                        <div>
                          <p className="font-medium text-sm text-slate-900 dark:text-white">{ex.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {ex.sets} sets &times; {ex.rep_target || "?"} reps
                            {ex.rir_target && ` @ RIR ${ex.rir_target}`}
                          </p>
                        </div>
                        {targets?.workingWeight && (
                          <div className="text-right">
                            <p className="font-bold text-sm text-slate-900 dark:text-white">{targets.workingWeight} lbs</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
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
                      className="flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-orange-500" />
                        <div>
                          <p className="font-medium text-sm text-slate-900 dark:text-white">{c.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {c.duration_minutes} min{c.time_of_day !== "anytime" ? ` · ${c.time_of_day.toUpperCase()}` : ""}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-xs border-0">
                        Cardio
                      </Badge>
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
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                Enter your current working weight for each exercise (optional — you can also
                enter these during your first session).
              </p>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div>
                <Label className="text-sm text-slate-700 dark:text-slate-300">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-3">
              {allExercises.map((ex) => (
                <div key={ex.name} className="flex items-center gap-3">
                  <Label className="flex-1 text-sm text-slate-700 dark:text-slate-300">{ex.name}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="lbs"
                      className="w-24 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      value={startingWeights[ex.name] || ""}
                      onChange={(e) =>
                        setStartingWeights((prev) => ({
                          ...prev,
                          [ex.name]: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                    <span className="text-xs text-slate-400 dark:text-slate-500">lbs</span>
                  </div>
                </div>
              ))}
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-slate-200 bg-white dark:bg-slate-900 shrink-0">
              <Button variant="outline" className="flex-1" onClick={() => setShowEnrollDialog(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-primary-600"
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
            <p className="text-sm text-slate-600 dark:text-slate-400">
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
                className="flex-1 bg-danger-600 hover:bg-danger-700 text-white"
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
