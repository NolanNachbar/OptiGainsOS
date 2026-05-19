import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SocialContent } from "@/components/social/SocialContent";

export default function SocialFriends() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#121212] min-h-screen p-4">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate("/social")}
          className="flex items-center gap-1.5 text-sm font-medium text-[#555555] hover:text-brand transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Feed
        </button>
        <SocialContent />
      </div>
    </div>
  );
}
