import { useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { GripVertical, Clock, Target } from "lucide-react";

/**
 * Draggable workout card for the workout library bank.
 * Styled to match the WorkoutCard on the Workouts page.
 * Drag onto a CycleDayGrid slot to assign it to that day.
 */
export default function DraggableWorkoutCard({ workout, isOverlay = false }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: workout.id,
    data: { workout },
  });

  // Only apply transform on the overlay clone, not the source card
  const style = isOverlay && transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`w-full sm:w-[calc(50%-0.25rem)] lg:w-[calc(33.333%-0.375rem)] ${
        isDragging && !isOverlay ? "opacity-30" : ""
      }`}
    >
      <Card
        className={`overflow-hidden cursor-grab active:cursor-grabbing transition-all duration-150 ${
          isOverlay
            ? "scale-105 ring-2 ring-brand/30"
            : ""
        }`}
      >
        <div className="h-1.5 bg-brand" />
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {workout.type && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {workout.type}
                  </Badge>
                )}
              </div>
              <p className="text-sm font-bold text-white truncate">
                {workout.title}
              </p>
              {workout.description && (
                <p className="text-xs text-[#555555]  line-clamp-1 mt-0.5">
                  {workout.description}
                </p>
              )}
                <div className="flex items-center gap-3 mt-2 text-xs text-[#555555] ">
                {workout.duration_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {workout.duration_minutes} min
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  {workout.exercises?.length || 0} exercises
                </span>
              </div>
            </div>
            <GripVertical className="w-4 h-4 text-[#a0a0a0]  flex-shrink-0 mt-1" />
          </div>
        </div>
      </Card>
    </div>
  );
}
