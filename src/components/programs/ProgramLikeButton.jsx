import { Flame } from "lucide-react";
import { useProgramReactions } from "@/hooks/useProgramReactions";

export default function ProgramLikeButton({ sharedProgramId }) {
  const { likeCount, userLiked, toggleLike, isLoading } = useProgramReactions(sharedProgramId);

  return (
    <button
      onClick={toggleLike}
      disabled={isLoading}
      className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
        userLiked ? "text-orange-500" : "text-[#555555] hover:text-orange-500"
      }`}
    >
      <Flame className={`w-4 h-4 ${userLiked ? "fill-orange-500" : ""}`} />
      {likeCount > 0 ? likeCount : "Fire"}
    </button>
  );
}
