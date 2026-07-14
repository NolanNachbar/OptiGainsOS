import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Wraps one exercise's card in sortable positioning; hands the drag handle's
// attributes/listeners down as a render-prop so ExerciseCard can put the grip
// icon wherever it belongs in its own header instead of wrapping the whole card.
export default function SortableExerciseRow({ id, exerciseIndex, className, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      data-tutorial={exerciseIndex === 0 ? "exercise-card" : undefined}
      className={className}
    >
      {children({ attributes, listeners })}
    </div>
  );
}
