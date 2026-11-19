import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Dumbbell } from "lucide-react";
import { isRunEx } from "@/components/workouts/detail/workoutDetailUtils";

// Extracted from WorkoutDetail.jsx (no behavior change).
export default function WorkoutViewMode({ CardioSessions, handleStartLogging, isProgramSource, programWorkout, weightUnit, workout }) {
  return (
    <>
          <>
          <Card className="">
            <CardHeader className="pt-4 pb-2">
              <CardTitle className="text-title font-extrabold text-ink">Exercises</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {workout.exercises?.map((exercise, index) => {
                const isLogFormat = Array.isArray(exercise.sets);
                return (
                  <div key={index} className="glass-inset px-4 py-3.5">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full glass-inset border border-charcoal-border flex items-center justify-center text-ink-secondary font-technical font-extrabold text-body flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-emph font-extrabold text-ink mb-2">{exercise.name}</h4>
                          {isLogFormat ? (
                            <table className="w-full text-sm mt-2">
                              <thead>
                                <tr className="border-b border-charcoal-border">
                                  <th className="text-left py-2 px-2 text-micro text-ink-muted">Set</th>
                                  <th className="text-left py-2 px-2 text-micro text-ink-muted">Weight</th>
                                  <th className="text-left py-2 px-2 text-micro text-ink-muted">Reps</th>
                                </tr>
                              </thead>
                              <tbody>
                                {exercise.sets.map((set, si) => (
                                  <tr key={si} className="border-b border-charcoal-borderSoft">
                                    <td className="py-2 px-2 font-technical font-extrabold text-ink-muted">{set.set_number}</td>
                                    <td className="py-2 px-2 font-technical font-semibold text-ink-secondary">{set.weight} <span className="text-caption text-ink-faint">{weightUnit}</span></td>
                                    <td className="py-2 px-2 font-technical font-semibold text-ink-secondary">{set.duration_s != null ? `${set.duration_s}s` : set.reps}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="flex flex-wrap gap-4 text-caption font-semibold text-ink-muted">
                              {exercise.sets > 1 && (
                                <div>
                                  <span className="text-ink-muted">Sets:</span> <span className="font-technical font-extrabold text-ink-secondary">{exercise.sets}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-ink-muted">{exercise.sets === 1 ? 'Duration / Target' : 'Reps'}:</span> <span className="font-technical font-extrabold text-ink-secondary">{exercise.reps}</span>
                              </div>
                              {exercise.rest_seconds > 0 && (
                                <div>
                                  <span className="text-ink-muted">Rest:</span> <span className="font-technical font-extrabold text-ink-secondary">{exercise.rest_seconds}s</span>
                                </div>
                              )}
                            </div>
                          )}
                          {exercise.notes && (
                            <p className="text-xs font-semibold text-ink-muted mt-2 italic">{exercise.notes}</p>
                          )}
                        </div>
                      </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Conditioning — read-only run/swim detail (was missing from view mode,
              so a two-a-day's run had no clickable detail). */}
          {isProgramSource &&
            (programWorkout?.cardio_sessions?.length > 0 ||
              (programWorkout?.exercises || []).some(isRunEx)) && (
            <Card className="mt-3">
              <CardContent className="pt-4 pb-4">
                <CardioSessions programWorkout={programWorkout} />
              </CardContent>
            </Card>
          )}

          {/* Sticky thumb-zone primary action — mobile only. Keeps "Start
              Logging" reachable after scrolling the exercise list. Clears the
              floating dock via --dock-clearance + safe-area inset.
              wd-6: the CTA is its own teal action surface, so the wrapping
              glass-elevated panel (a card around a button) is dropped — the
              button rides directly in the sticky slot with no redundant chrome
              behind it. */}
          <div
            className="lg:hidden sticky bottom-0 -mx-4 px-4 pt-3 z-30 pointer-events-none"
            style={{ paddingBottom: 'calc(var(--dock-clearance) + env(safe-area-inset-bottom))' }}
          >
            <Button
              onClick={handleStartLogging}
              variant="volt"
              size="lg"
              className="w-full pointer-events-auto"
              data-tutorial="start-logging-btn"
            >
              <Dumbbell className="w-5 h-5 mr-2" />
              Start Logging Workout
            </Button>
          </div>
          </>
    </>
  );
}
