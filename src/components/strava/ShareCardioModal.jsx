import { useState } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { ACTIVITY_TYPE_LABELS } from "@/lib/strava";

function fmt(meters) {
  if (!meters) return null;
  return `${(meters / 1609.34).toFixed(2)} mi`;
}
function fmtDuration(secs) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ShareCardioModal({ session, onClose, onShared }) {
  const { user } = useAuth();
  const [caption, setCaption] = useState("");
  const [sharing, setSharing] = useState(false);

  const typeLabel = ACTIVITY_TYPE_LABELS[session.activity_type] || session.activity_type;

  const handleShare = async () => {
    setSharing(true);
    try {
      await db.entities.SharedWorkout.create({
        created_by: user.id,
        workout_title: session.name,
        share_type: "cardio",
        caption: caption.trim() || null,
        prs: [],
        photo_urls: [],
        exercises: [{
          activity_type: session.activity_type,
          distance_meters: session.distance_meters,
          moving_time_seconds: session.moving_time_seconds,
          total_elevation_gain: session.total_elevation_gain,
          average_speed: session.average_speed,
          average_heartrate: session.average_heartrate,
          calories: session.calories,
          map_polyline: session.map_polyline || null,
        }],
      });
      toast.success("Activity shared!");
      onShared?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to share activity");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-[#FC4C02]" />
            Share Activity
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Sharing <span className="font-medium">{session.name}</span>
            {" "}({typeLabel}
            {fmt(session.distance_meters) ? ` · ${fmt(session.distance_meters)}` : ""}
            {fmtDuration(session.moving_time_seconds) ? ` · ${fmtDuration(session.moving_time_seconds)}` : ""}
            )
          </p>

          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 200))}
            placeholder="Add a caption (optional)"
            maxLength={200}
          />

          <Button onClick={handleShare} disabled={sharing} className="w-full">
            {sharing ? <LoadingSpinner size="small" className="mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
            Share to Feed
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full text-slate-500">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
