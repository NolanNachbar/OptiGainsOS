import { useState } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateRecipes } from "@/lib/queryKeys";
import { scaleRecipeToServings } from "@/utils/nutritionUtils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BookOpen, Loader2, Pencil, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { RecipeFormDialog } from "@/components/nutrition/recipe/RecipeFormDialog";
import { LogRecipeDialog } from "@/components/nutrition/recipe/LogRecipeDialog";
import { RecipeCardMenu } from "@/components/nutrition/recipe/RecipeParts";

export default function RecipeBuilder({ showCreateDialog: externalShow, onCreateDialogChange, hideHeader = false, compact = false }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [internalShow, setInternalShow] = useState(false);
  const showCreateDialog = externalShow || internalShow;
  const setShowCreateDialog = (v) => {
    setInternalShow(v);
    onCreateDialogChange?.(v);
    if (v) setEditingRecipe(null);
  };
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [loggingRecipe, setLoggingRecipe] = useState(null);
  const [, setSharingRecipe] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: queryKeys.recipes(user?.id),
    queryFn: () => db.entities.Recipe.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const deleteRecipeMutation = useMutation({
    mutationFn: (id) => db.entities.Recipe.delete(id),
    onSuccess: () => {
      invalidateRecipes(queryClient);
      toast.success("Recipe deleted");
    },
    onError: () => toast.error("Recipe not deleted. Check your connection and try again."),
  });

  const handleEdit = (recipe) => {
    setEditingRecipe(recipe);
    setShowCreateDialog(true);
  };

  const handleLog = (recipe) => {
    setLoggingRecipe(recipe);
    setShowLogDialog(true);
  };

  const handleDelete = (recipe) => {
    setDeleteTarget({ id: recipe.id, name: recipe.name });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 spin-loop text-brand" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {recipes.length === 0 ? (
          <div className="text-center py-6 text-ink-muted text-sm">
            <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-ink font-semibold">No recipes yet</p>
            <p className="text-xs mt-1">Recipes you create with the + button appear here.</p>
          </div>
        ) : recipes.map((recipe) => {
          const perServing = scaleRecipeToServings(recipe, 1);
          return (
            <div key={recipe.id} className="tile p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-ink truncate block">{recipe.name}</span>
                  <span className="text-xs text-ink-muted capitalize">
                    {recipe.ingredients?.length || 0} ingredients · {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(recipe)}
                    aria-label="Edit recipe"
                    className="h-11 w-11 flex items-center justify-center rounded-lg text-ink-muted transition-colors duration-200 [transition-timing-function:var(--ease)] hover:text-ink hover:bg-[var(--glass-edge)] active:opacity-90"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <Button variant="volt" size="sm" onClick={() => handleLog(recipe)} className="min-h-[44px]">
                    <UtensilsCrossed className="w-3 h-3" />Log
                  </Button>
                </div>
              </div>
              <div className="flex gap-3 text-xs font-technical tabular-nums">
                <span className="text-gold font-bold">{Math.round(perServing.calories)}<span className="text-ink-muted font-normal ml-0.5">cal</span></span>
                <span className="text-coral">P{perServing.protein_grams}g</span>
                <span className="text-carb">C{perServing.carbs_grams}g</span>
                <span className="text-fat">F{perServing.fats_grams}g</span>
              </div>
            </div>
          );
        })}

        {showCreateDialog && (
          <RecipeFormDialog
            open={showCreateDialog}
            onOpenChange={(open) => { setShowCreateDialog(open); if (!open) setEditingRecipe(null); }}
            recipe={editingRecipe}
            userId={user.id}
          />
        )}
        {showLogDialog && loggingRecipe && (
          <LogRecipeDialog
            open={showLogDialog}
            onOpenChange={(open) => { setShowLogDialog(open); if (!open) setLoggingRecipe(null); }}
            recipe={loggingRecipe}
            userId={user.id}
          />
        )}
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete Recipe?"
          description={`This will permanently delete "${deleteTarget?.name}".`}
          confirmText="Delete" cancelText="Cancel" variant="danger"
          onConfirm={() => { deleteRecipeMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
          loading={deleteRecipeMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div>
          <h2 className="text-xl font-bold text-left text-ink">Your Recipes</h2>
          <p className="text-sm text-left text-ink-muted">
            Create custom recipes and log them to your daily tracker
          </p>
        </div>
      )}

      {recipes.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-charcoal-border">
          <BookOpen className="w-12 h-12 text-ink-muted mx-auto mb-3" />
          <h3 className="text-base font-semibold text-ink mb-1">No recipes yet</h3>
          <p className="text-sm text-ink-muted">Recipes you create with the New Recipe button appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recipes.map((recipe) => {
            const perServing = scaleRecipeToServings(recipe, 1);
            return (
              <div key={recipe.id} className="tile p-4 flex flex-col gap-3">
                {/* Name row */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink leading-snug">{recipe.name}</p>
                    {recipe.description && (
                      <p className="text-xs text-ink-muted mt-0.5 truncate">{recipe.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-semibold bg-charcoal-elevated text-ink-muted rounded-md px-1.5 py-0.5">
                    {recipe.servings}×
                  </span>
                </div>
                {/* Macros */}
                <div className="flex gap-4">
                  <div>
                    <p className="text-sm font-bold text-gold font-technical tabular-nums">{Math.round(perServing.calories)}</p>
                    <p className="text-xs text-ink-muted">Cal</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-coral font-technical tabular-nums">{perServing.protein_grams}g</p>
                    <p className="text-xs text-ink-muted">Pro</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-carb font-technical tabular-nums">{perServing.carbs_grams}g</p>
                    <p className="text-xs text-ink-muted">Carb</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-fat font-technical tabular-nums">{perServing.fats_grams}g</p>
                    <p className="text-xs text-ink-muted">Fat</p>
                  </div>
                </div>
                <p className="text-xs text-ink-muted -mt-1">
                  {recipe.ingredients?.length || 0} ingredients · per serving
                </p>
                {/* Actions — Log is the single full-width primary; Share / Edit /
                    Delete are demoted into the overflow menu. */}
                <div className="flex gap-1.5">
                  <Button variant="volt" size="sm" onClick={() => handleLog(recipe)} className="flex-1 min-h-[44px]">
                    <UtensilsCrossed className="w-3 h-3 mr-1" />Log
                  </Button>
                  <RecipeCardMenu
                    onShare={() => setSharingRecipe(recipe)}
                    onEdit={() => handleEdit(recipe)}
                    onDelete={() => handleDelete(recipe)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateDialog && (
        <RecipeFormDialog
          open={showCreateDialog}
          onOpenChange={(open) => {
            setShowCreateDialog(open);
            if (!open) setEditingRecipe(null);
          }}
          recipe={editingRecipe}
          userId={user.id}
        />
      )}

      {showLogDialog && loggingRecipe && (
        <LogRecipeDialog
          open={showLogDialog}
          onOpenChange={(open) => {
            setShowLogDialog(open);
            if (!open) setLoggingRecipe(null);
          }}
          recipe={loggingRecipe}
          userId={user.id}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Recipe?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          deleteRecipeMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        loading={deleteRecipeMutation.isPending}
      />
    </div>
  );
}

