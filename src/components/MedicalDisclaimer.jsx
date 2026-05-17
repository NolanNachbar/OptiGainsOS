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
    <div className="relative bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600 mb-4">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <p className="pr-6">
        <span className="font-medium text-slate-700">Medical disclaimer:</span>{' '}
        Recommendations are for informational purposes only and are not medical advice.
        Consult a healthcare professional before beginning any new exercise or nutrition program.
      </p>
    </div>
  );
}
