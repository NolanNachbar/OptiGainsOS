import { useState } from 'react';
import { X } from 'lucide-react';

const STORAGE_KEY = 'medical_disclaimer_dismissed';

export default function MedicalDisclaimer() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="relative bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-400 mb-4">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-zinc-500 hover:text-zinc-300"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <p className="pr-6">
        <span className="font-medium text-zinc-300">Medical disclaimer:</span>{' '}
        Recommendations are for informational purposes only and are not medical advice.
        Consult a healthcare professional before beginning any new exercise or nutrition program.
      </p>
    </div>
  );
}
