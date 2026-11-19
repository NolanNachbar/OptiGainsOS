// Extracted from ExerciseCard.jsx (no behavior change).

export default function LoadWhy({ loadWhy, whyOpen, setWhyOpen }) {
  return (
    <>
        {Array.isArray(loadWhy) && loadWhy.length > 0 && (
          <div className="pb-1.5">
            <button
              type="button"
              aria-expanded={whyOpen}
              onClick={() => setWhyOpen((v) => !v)}
              className="text-[11px] font-semibold text-ink-faint underline-offset-2 hover:underline min-h-[28px] touch-manipulation"
            >
              {whyOpen ? 'Hide why this weight' : 'Why this weight'}
            </button>
            {whyOpen && (
              <ul className="mt-1 space-y-0.5 text-[11px] text-ink-muted font-technical">
                {loadWhy.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            )}
          </div>
        )}
    </>
  );
}
