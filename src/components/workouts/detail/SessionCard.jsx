import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Target, Dumbbell, Edit, Copy } from "lucide-react";
import { getWorkoutBodyData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";

// Extracted from WorkoutDetail.jsx (no behavior change).
export default function SessionCard({ chipsRow, cloneWorkoutMutation, handleStartLogging, isLogging, muscleToggleRow, muscleView, navigate, resumeSession, user, workout }) {
  return (
    <>
        {!isLogging && (
        <Card className="mb-6">
          <CardHeader className="pt-4 pb-2">
            <div className="flex items-center justify-between">
              {chipsRow}
              {muscleToggleRow}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row md:gap-8">
            <div className="flex-1 min-w-0">
              {/* Title + description */}
              <CardTitle className="type-display text-2xl mb-1">{workout.title}</CardTitle>
              {workout.description && workout.description.trim().toLowerCase() !== (workout.title || "").trim().toLowerCase() && (
                <p className="text-body font-semibold text-ink-muted mb-4">{workout.description}</p>
              )}
              {/* wd-5: one HERO figure (Exercises — always present, the core
                  count for the session) reads as the font-numeral tabular-nums font-bold leading-none tracking-tight; Duration is
                  subordinate (smaller, muted) so the two summary numbers form a
                  clear hierarchy instead of two equal-weight twins. */}
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-6">
                  <div className="flex items-center gap-2.5">
                    <Target className="w-6 h-6 text-ink-muted" />
                    <div>
                      <div className="text-micro font-semibold tracking-[0.08em] text-ink-muted">Exercises</div>
                      <div className="font-numeral tabular-nums font-bold leading-none tracking-tight text-display text-ink">{workout.exercises?.length || 0} <span className="text-caption font-semibold text-ink-muted">{(workout.exercises?.length || 0) === 1 ? 'exercise' : 'exercises'}</span></div>
                    </div>
                  </div>
                  {workout.duration_minutes != null && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-ink-faint" />
                      <div>
                        <div className="text-micro font-semibold tracking-[0.08em] text-ink-muted">Duration</div>
                        <div className="font-technical font-bold text-body text-ink-secondary">{workout.duration_minutes} <span className="text-caption font-semibold text-ink-muted">min</span></div>
                      </div>
                    </div>
                  )}
                </div>


                {!resumeSession && (
                  <div className="space-y-3">
                    <Button
                      onClick={handleStartLogging}
                      variant="volt"
                      size="lg"
                      className="w-full hidden lg:flex"
                    >
                      <Dumbbell className="w-5 h-5 mr-2" />
                      Start Logging Workout
                    </Button>
                    {workout.created_by === user.id && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => navigate(`/create-workout?edit=${workout.id}`)}
                          variant="outline"
                          size="lg"
                          className="flex-1"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Workout
                        </Button>
                        <Button
                          onClick={() => cloneWorkoutMutation.mutate()}
                          variant="outline"
                          size="lg"
                          className="flex-1"
                          disabled={cloneWorkoutMutation.isPending}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Clone
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: muscle figure sidebar */}
              {workout.exercises?.length > 0 && (() => {
                const bodyData = getWorkoutBodyData(workout.exercises);
                return bodyData.length > 0 ? (
                  <div className="flex flex-col items-center mt-4 md:mt-0 md:w-64 md:shrink-0 lg:hidden">
                    <MuscleHeatMap data={bodyData} view={muscleView} className="flex-1" maxWidth={150} />
                  </div>
                ) : null;
              })()}
          </CardContent>
        </Card>
        )}
    </>
  );
}
