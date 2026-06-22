import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { db } from "@/api/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateBodyWeight, invalidateProfile } from "@/lib/queryKeys";
import { format } from "date-fns";
import { Scale, Loader2 } from "lucide-react";
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

  const weightUnit = profile?.weight_unit || "lbs";
  const lastWeight = profile?.current_weight;

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
      toast.success("Weight logged");
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
      <DialogContent className="max-w-md flex flex-col" sheetMinHeight="">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-ink-secondary" /> Log Your Weight
          </DialogTitle>
        </DialogHeader>
        {/* Flex column so the Save CTA rides mt-auto down to the bottom safe-area
            thumb zone with no empty glass band beneath it (weigh-in-modal-1,4). */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div>
            <label className="form-label mb-2 block">
              Weight ({weightUnit})
            </label>
            {/* Quiet trailing 'lbs' unit adornment inside the input (weigh-in-modal-3). */}
            <div className="relative">
              <Input
                type="text"
                inputMode="decimal"
                step="0.1"
                enterKeyHint="done"
                placeholder="Enter weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="type-display tabular-nums text-2xl sm:text-3xl h-16 pr-14"
                autoFocus
              />
              <span
                className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-medium text-ink-faint"
                aria-hidden="true"
              >
                {weightUnit}
              </span>
            </div>
            {lastWeight != null && (
              <p className="text-xs text-ink-faint mt-2">
                Last: <span className="tabular-nums">{lastWeight}</span> {weightUnit}
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="volt"
            size="lg"
            className="w-full mt-auto"
            disabled={weighInMutation.isPending || !weight || parseFloat(weight) <= 0}
          >
            {weighInMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 spin-loop" /> Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
