import { useState } from "react";
import { useProfile, useAllBodyWeightEntries } from "@/hooks/useUserQueries";
import { useLogWeight } from "@/hooks/useWeighIn";
import { toast } from "sonner";
import { Button, Input, Label, Sheet, ReasonLine } from "@/components/ui";

export default function WeighInModal({ open, onOpenChange }) {
  const { profile } = useProfile();
  const [weight, setWeight] = useState("");

  const weightUnit = profile?.weight_unit || "lbs";
  // Same source and precision as the Body history list (newest entry, one
  // decimal), so the hint and the history never show two different numbers.
  const { weightEntries } = useAllBodyWeightEntries();
  const newest = weightEntries?.[0];
  const lastWeight = newest?.weight != null ? Number(newest.weight).toFixed(1) : null;

  const weighInMutation = useLogWeight();
  const invalid = !weight || parseFloat(weight) <= 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (invalid) {
      toast.error("Enter a weight above 0.");
      return;
    }
    weighInMutation.mutate(
      { weight },
      {
        onSuccess: () => {
          toast.success("Weight logged");
          onOpenChange(false);
          setWeight("");
        },
        onError: () => toast.error("Weight not saved. Check your connection and try again."),
      }
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Log weight"
      footer={
        <Button
          type="submit"
          form="weigh-in-form"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={weighInMutation.isPending || invalid}
        >
          {weighInMutation.isPending ? "Saving" : "Save"}
        </Button>
      }
    >
      <form id="weigh-in-form" onSubmit={handleSubmit} className="flex flex-col gap-2 pt-2">
        <Label htmlFor="weigh-in-value" className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Weight ({weightUnit})
        </Label>
        <div className="relative">
          <Input
            id="weigh-in-value"
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="0.0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="h-16 pr-14 text-display font-numeral"
            autoFocus
          />
          <span
            className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-body text-ink-muted"
            aria-hidden="true"
          >
            {weightUnit}
          </span>
        </div>
        {lastWeight != null && <ReasonLine>Last logged {lastWeight} {weightUnit}</ReasonLine>}
      </form>
    </Sheet>
  );
}
