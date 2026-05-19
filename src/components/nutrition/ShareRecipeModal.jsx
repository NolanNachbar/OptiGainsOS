import { useState } from "react";
import { useShareRecipe } from "@/hooks/useSocialQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Share2, Globe, Lock } from "lucide-react";
import { toast } from "sonner";

export default function ShareRecipeModal({ recipe, onClose }) {
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const shareRecipe = useShareRecipe();

  const handleShare = () => {
    shareRecipe.mutate(
      {
        recipe_id: recipe.id,
        name: recipe.name,
        description: description.trim() || recipe.description || null,
        servings: recipe.servings,
        ingredients: recipe.ingredients,
        total_calories: recipe.total_calories,
        total_protein: recipe.total_protein,
        total_carbs: recipe.total_carbs,
        total_fats: recipe.total_fats,
        is_public: isPublic,
      },
      {
        onSuccess: () => {
          toast.success("Recipe shared!");
          onClose();
        },
        onError: () => toast.error("Failed to share recipe"),
      }
    );
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-brand" />
            Share Recipe
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-[#a0a0a0]">
            Share <span className="font-medium">{recipe.name}</span> with the community.
          </p>

          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="Tips, backstory, or notes about this recipe..."
              rows={3}
              maxLength={500}
              className="mt-1"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={isPublic ? "primary" : "outline"}
              size="sm"
              onClick={() => setIsPublic(true)}
            >
              <Globe className="w-3.5 h-3.5 mr-1" />
              Public
            </Button>
            <Button
              variant={!isPublic ? "primary" : "outline"}
              size="sm"
              onClick={() => setIsPublic(false)}
            >
              <Lock className="w-3.5 h-3.5 mr-1" />
              Friends Only
            </Button>
          </div>

          {/* Nutrition preview */}
          <div className="bg-[#1a1a1a] rounded-lg p-3">
            <p className="text-xs text-[#555555] mb-2">Nutrition per serving</p>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div>
                <p className="font-bold text-white">{recipe.total_calories || 0}</p>
                <p className="text-[#555555]">Cal</p>
              </div>
              <div>
                <p className="font-bold text-white">{recipe.total_protein || 0}g</p>
                <p className="text-[#555555]">Protein</p>
              </div>
              <div>
                <p className="font-bold text-white">{recipe.total_carbs || 0}g</p>
                <p className="text-[#555555]">Carbs</p>
              </div>
              <div>
                <p className="font-bold text-white">{recipe.total_fats || 0}g</p>
                <p className="text-[#555555]">Fats</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleShare}
              disabled={shareRecipe.isPending}
            >
              {shareRecipe.isPending ? "Sharing..." : "Share Recipe"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
