import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { db } from "@/api/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateBodyWeight, invalidateProfile } from "@/lib/queryKeys";
import { format } from "date-fns";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function WeighInModal({ open, onOpenChange }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState("");

  const weighInMutation = useMutation({
    mutationFn: async (weightData) => {
      const entry = await db.entities.BodyWeightEntry.create({
        weight: parseFloat(weightData.weight),
        recorded_date: format(new Date(), "yyyy-MM-dd"),
        notes: null,
        created_by: user.id,
      });
      if (profile?.id) {
        await db.entities.UserProfile.update(profile.id, { current_weight: parseFloat(weightData.weight) });
      }
      return entry;
    },
    onSuccess: () => {
      toast.success("Weight logged successfully!");
      onOpenChange(false);
      setWeight("");
      invalidateBodyWeight(queryClient);
      invalidateProfile(queryClient);
    },
    onError: () => {
      toast.error("Failed to log weight");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!weight || parseFloat(weight) <= 0) {
      toast.error("Please enter a valid weight");
      return;
    }
    weighInMutation.mutate({ weight });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5" /> Log Your Weight
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink-muted mb-2 block">
              Weight ({profile?.weight_unit || "lbs"})
            </label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="Enter your weight"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="tabular-nums"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="dim"
              size="lg"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="flex-1"
              disabled={weighInMutation.isPending}
            >
              {weighInMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
