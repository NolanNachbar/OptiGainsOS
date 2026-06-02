import { Brain } from 'lucide-react';

export default function Mind() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <Brain className="w-12 h-12 text-brand opacity-60" />
      <h2 className="text-xl font-bold text-white">Mind</h2>
      <p className="text-[#a0a0a0] text-sm max-w-xs">
        Reading log, study log, and skills tracker coming in Phase 6.
      </p>
    </div>
  );
}
