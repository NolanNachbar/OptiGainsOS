export default function ProgressDots({ current, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current
              ? 'w-8 bg-primary-600'
              : 'w-1.5 bg-slate-300 dark:bg-slate-600'
          }`}
          aria-label={`Step ${i + 1} of ${total}${i === current ? ' (current)' : ''}`}
        />
      ))}
    </div>
  );
}
