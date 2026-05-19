import { History } from "lucide-react";

export default function ExerciseCardPreview() {
  return (
    <div className="bg-[#1a1a1a] border-2 border-[#2a2a2a] rounded-xl p-4 max-w-sm mx-auto">
      {/* Exercise header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-brand/[8%]0 flex items-center justify-center text-black font-bold text-sm">
          1
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-white">Barbell Bench Press</h4>
          {/* Last performance indicator */}
          <div className="flex items-center gap-1.5 mt-1">
            <History className="w-3 h-3 text-[#555555]" />
            <span className="text-xs text-[#a0a0a0]">
              Last: <span className="font-semibold text-brand">185 lbs × 5</span>
              <span className="text-[#555555] ml-1">(Mar 12)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Sets table preview */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-[#a0a0a0] pb-2 border-b border-[#2a2a2a]">
          <span className="w-10">Set</span>
          <span className="w-20">Weight</span>
          <span className="w-16">Reps</span>
        </div>
        {[1, 2, 3].map((set) => (
          <div key={set} className="flex items-center gap-2">
            <span className="w-10 font-medium text-[#a0a0a0] text-[#a0a0a0] text-sm">{set}</span>
            <div className="w-20 h-9 bg-brand/[8%] border-2 border-brand/30 rounded-lg flex items-center justify-center">
              <span className="text-sm font-medium text-brand text-brand">185</span>
            </div>
            <div className="w-16 h-9 bg-[#1a1a1a] bg-[#121212]/50 border border-[#2a2a2a] border-[#2a2a2a] rounded-lg flex items-center justify-center">
              <span className="text-sm text-[#a0a0a0] text-[#a0a0a0]">5</span>
            </div>
          </div>
        ))}
      </div>

      {/* Annotation arrow */}
      <div className="mt-3 flex items-center gap-2 text-xs text-brand font-medium">
        <span>←</span>
        <span>Auto-filled from last workout!</span>
      </div>
    </div>
  );
}
