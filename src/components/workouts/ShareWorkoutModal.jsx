import { useState, useEffect, useRef } from "react";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Share2, Dumbbell, BarChart3, Trophy, Camera, X } from "lucide-react";
import { toast } from "sonner";
import { detectPRs } from "@/utils/exerciseStats";
import { uploadWorkoutPhoto } from "@/utils/imageUpload";

export default function ShareWorkoutModal({ workoutTitle, exercises, onClose, onShared }) {
  const { user } = useAuth();
  const [caption, setCaption] = useState("");
  const [sharing, setSharing] = useState(false);
  const [prs, setPrs] = useState([]);
  const [photos, setPhotos] = useState([]); // File objects
  const [photoPreviews, setPhotoPreviews] = useState([]); // Data URLs for preview
  const fileInputRef = useRef(null);

  // Detect PRs on mount
  useEffect(() => {
    if (!exercises || exercises.length === 0 || !user) return;

    const detect = async () => {
      try {
        const { data: allLogs } = await supabase
          .from('workout_logs')
          .select('exercises, log_date')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false });

        const currentLog = { exercises, log_date: new Date().toISOString().slice(0, 10) };
        const detected = detectPRs(currentLog, allLogs || []);
        setPrs(detected);
      } catch {
        // Silent fail — PRs are non-critical
      }
    };
    detect();
  }, [exercises, user]);

  const handleAddPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 3) {
      toast.error("Maximum 3 photos allowed");
      return;
    }

    const validFiles = files.filter((f) => {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} is not an image`);
        return false;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} is too large (max 5MB)`);
        return false;
      }
      return true;
    });

    setPhotos((prev) => [...prev, ...validFiles]);

    // Generate previews
    for (const file of validFiles) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotoPreviews((prev) => [...prev, ev.target.result]);
      };
      reader.readAsDataURL(file);
    }

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleShare = async (shareType) => {
    setSharing(true);
    try {
      let sharedExercises;

      if (shareType === 'blank') {
        sharedExercises = exercises.map(ex => ({
          name: ex.name,
          sets: ex.sets?.length || ex.sets || 3,
          reps: ex.sets?.[0]?.reps || ex.reps || 10,
          notes: ex.notes || null,
        }));
      } else {
        sharedExercises = exercises.map(ex => ({
          name: ex.name,
          notes: ex.notes || null,
          sets: (ex.sets || []).map(s => ({
            set_number: s.set_number,
            reps: s.reps,
            weight: s.weight,
            completed: s.completed,
          })),
        }));
      }

      // Create the shared workout first to get an ID
      const shared = await db.entities.SharedWorkout.create({
        created_by: user.id,
        workout_title: workoutTitle,
        exercises: sharedExercises,
        share_type: shareType,
        caption: caption.trim() || null,
        prs: prs.length > 0 ? prs : [],
        photo_urls: [],
      });

      // Upload photos if any
      if (photos.length > 0) {
        const uploadedPaths = [];
        for (const file of photos) {
          try {
            const path = await uploadWorkoutPhoto(user.id, shared.id, file);
            uploadedPaths.push(path);
          } catch {
            // Continue with other photos if one fails
          }
        }

        if (uploadedPaths.length > 0) {
          await db.entities.SharedWorkout.update(shared.id, {
            photo_urls: uploadedPaths,
          });
        }
      }

      toast.success("Workout shared to your profile!");
      onShared?.();
    } catch (err) {
      toast.error(err.message || "Failed to share workout");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary-600" />
            Share Workout
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Share <span className="font-medium">{workoutTitle}</span> to your profile so friends can use it as a template.
          </p>

          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 200))}
            placeholder="Add a caption (optional)"
            maxLength={200}
          />

          {/* Photo attachment */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddPhotos}
            />
            {photoPreviews.length > 0 && (
              <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                {photoPreviews.map((src, i) => (
                  <div key={i} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                <Camera className="w-3.5 h-3.5 mr-1" />
                {photos.length === 0 ? "Add Photos" : "Add More"} ({photos.length}/3)
              </Button>
            )}
          </div>

          {prs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-700 font-medium text-sm">
                <Trophy className="w-4 h-4" />
                Personal Records Detected!
              </div>
              {prs.map((pr, i) => (
                <p key={i} className="text-sm text-amber-600 ml-5.5">
                  {pr.exercise}: {pr.weight} lbs x {pr.reps}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <Button
              onClick={() => handleShare('blank')}
              disabled={sharing}
              variant="outline"
              className="w-full justify-start h-auto py-3"
            >
              {sharing ? <LoadingSpinner size="small" className="mr-3" /> : <Dumbbell className="w-5 h-5 mr-3 text-primary-600" />}
              <div className="text-left">
                <div className="font-medium">Exercises Only</div>
                <div className="text-xs text-slate-500">Share the routine without your weights/reps</div>
              </div>
            </Button>

            <Button
              onClick={() => handleShare('detailed')}
              disabled={sharing}
              variant="outline"
              className="w-full justify-start h-auto py-3"
            >
              {sharing ? <LoadingSpinner size="small" className="mr-3" /> : <BarChart3 className="w-5 h-5 mr-3 text-blue-600" />}
              <div className="text-left">
                <div className="font-medium">With Performance</div>
                <div className="text-xs text-slate-500">Include your sets, weights, and reps</div>
              </div>
            </Button>
          </div>

          <Button variant="ghost" onClick={onClose} className="w-full text-slate-500">
            Skip
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
