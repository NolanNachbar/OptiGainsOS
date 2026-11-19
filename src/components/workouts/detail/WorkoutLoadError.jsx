import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Dumbbell, RotateCw } from "lucide-react";

// Extracted from WorkoutDetail.jsx (no behavior change).
export default function WorkoutLoadError({ navigate, programLoadError, refetchEnrollment, refetchProgramWorkout }) {
  return (
    <>
      <div className="max-w-6xl mx-auto p-4 md:p-6 min-h-[calc(100dvh-var(--layout-header-height,56px)-var(--dock-clearance))] flex flex-col items-center justify-center">
        <Card className="w-full max-w-md mx-auto rise-in">
          <CardContent className="py-12 text-center">
            <i className="w-10 h-10 rounded-control glass-inset text-ink-muted flex items-center justify-center not-italic mx-auto mb-3">
              <Dumbbell className="w-5 h-5" />
            </i>
            {programLoadError ? (
              <>
                <h2 className="text-display text-ink mb-2">Couldn&apos;t load this workout</h2>
                <p className="text-body font-semibold text-ink-muted mb-6">
                  Couldn&apos;t load this program workout, try again.
                </p>
                <div className="flex flex-col sm:flex-row sm:justify-center gap-3">
                  <Button
                    variant="volt"
                    size="lg"
                    className="w-full sm:w-auto"
                    onClick={() => { refetchEnrollment(); refetchProgramWorkout(); }}
                  >
                    <RotateCw className="w-4 h-4 mr-2" />
                    Try again
                  </Button>
                  <Button variant="ghost" size="lg" className="w-full sm:w-auto" onClick={() => navigate("/workouts")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to workouts
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-display text-ink mb-2">Workout not found</h2>
                <p className="text-body font-semibold text-ink-muted mb-6">
                  This workout may have been deleted, or the link is no longer valid.
                </p>
                <Button variant="volt" size="lg" className="w-full sm:w-auto" onClick={() => navigate("/workouts")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to workouts
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
