import { getWorkoutBodyData } from "@/utils/muscleVolumeUtils";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import { SegmentedControl } from "@/components/ui/system";

// Extracted from WorkoutDetail.jsx (no behavior change).
export default function AnatomySidebar({ isLogging, muscleView, setMuscleView, workout }) {
  return (
    <>
        {workout.exercises?.length > 0 && (() => {
          const bodyData = getWorkoutBodyData(workout.exercises);
          return bodyData.length > 0 ? (
            <div
              className="hidden lg:flex flex-col items-center w-52 shrink-0 sticky"
              style={{ top: isLogging ? 'calc(var(--layout-header-height, 56px) + 8rem)' : 'calc(var(--layout-header-height, 56px) + 1.5rem)' }}
            >
              <p className="text-micro font-semibold tracking-[0.08em] text-ink-muted mb-2 self-start">Muscles worked</p>
              <SegmentedControl
                value={muscleView}
                onChange={setMuscleView}
                size="md"
                className="mb-3"
                options={[
                  { value: "anterior", label: "Front" },
                  { value: "posterior", label: "Back" },
                ]}
              />
              <MuscleHeatMap data={bodyData} view={muscleView} maxWidth={200} />
            </div>
          ) : null;
        })()}
    </>
  );
}
