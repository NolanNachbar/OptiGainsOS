import { useState } from "react";
import CycleDayGrid from "@/components/programs/CycleDayGrid";
import WorkoutLibrarySidebar from "@/components/programs/WorkoutLibrarySidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, Dumbbell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import InlineDayEditor from "./InlineDayEditor";

export default function StepCycleDays({
  workouts,
  program,
  editingDay,
  editingWorkout,
  onCellClick,
  onClearDay,
  onCopyDay,
  updateWorkoutByDay,
  addExercise,
  removeExercise,
  updateExercise,
  addCardioWorkout,
  removeCardioWorkout,
  updateCardioWorkout,
}) {
  const [showLibraryMobile, setShowLibraryMobile] = useState(false);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-body">
                {program.cycle_length}-Day Cycle Template
              </CardTitle>
              <p className="text-caption text-ink-muted mt-1">
                Drag workouts from the library or click a day to build exercises inline.
                This template repeats for {program.num_cycles} cycle{program.num_cycles !== 1 ? "s" : ""}.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CycleDayGrid
            workouts={workouts}
            cycleLength={program.cycle_length}
            mode="edit"
            onCellClick={onCellClick}
            onClearDay={onClearDay}
          />

          <div className="mt-4 pt-4 border-t hairline">
            {/* Mobile: keep the cycle grid focal — collapse the library behind a toggle.
                Desktop always shows it. Sidebar stays mounted so DnD drag source persists. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLibraryMobile((v) => !v)}
              className="md:hidden w-full justify-between min-h-[44px] mb-3"
            >
              <span className="flex items-center gap-2">
                <Dumbbell className="w-4 h-4" />
                Workout Library
              </span>
              {showLibraryMobile ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
            <div className={showLibraryMobile ? "block" : "hidden md:block"}>
              <WorkoutLibrarySidebar />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inline exercise editor */}
      <AnimatePresence>
        {editingDay != null && editingWorkout && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.24, ease: [0.2, 0.7, 0.3, 1] }}
          >
            <InlineDayEditor
              dayIndex={editingDay}
              workout={editingWorkout}
              allWorkouts={workouts}
              updateWorkoutByDay={updateWorkoutByDay}
              addExercise={addExercise}
              removeExercise={removeExercise}
              updateExercise={updateExercise}
              onCopyDay={onCopyDay}
              onClose={() => onCellClick(null, null, editingDay)}
              addCardioWorkout={addCardioWorkout}
              removeCardioWorkout={removeCardioWorkout}
              updateCardioWorkout={updateCardioWorkout}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
