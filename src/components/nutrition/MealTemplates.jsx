import { useState, useEffect } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys, invalidateMealTemplates, invalidateFood } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  UtensilsCrossed,
  Plus,
  Trash2,
  Star,
  Play,
  Loader2,
  Pencil,
  Search,
  ChevronDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { searchGenericFoods, searchBrandedFoods } from "@/api/usda";
import { toast } from "sonner";

// Sum macros across a template/entry item list. Module-scoped so the apply +
// save dialogs (separate components) share one source of truth.
const getTemplateTotals = (items = []) =>
  items.reduce(
    (acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein: acc.protein + (item.protein_grams || 0),
      carbs: acc.carbs + (item.carbs_grams || 0),
      fats: acc.fats + (item.fats_grams || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

export default function MealTemplates({ compact = false }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }

  const { data: templates = [], isLoading } = useQuery({
    queryKey: queryKeys.mealTemplates(user?.id),
    queryFn: () => db.entities.MealTemplate.filter({ created_by: user.id }),
    enabled: !!user,
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => db.entities.MealTemplate.delete(id),
    onSuccess: () => {
      invalidateMealTemplates(queryClient);
      toast.success("Template deleted");
    },
    onError: () => toast.error("Failed to delete template"),
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ id, is_favorite }) =>
      db.entities.MealTemplate.update(id, { is_favorite }),
    onSuccess: () => invalidateMealTemplates(queryClient),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, ...data }) => db.entities.MealTemplate.update(id, data),
    onSuccess: () => {
      invalidateMealTemplates(queryClient);
      toast.success("Template updated!");
      setShowEditDialog(false);
      setEditingTemplate(null);
    },
    onError: () => toast.error("Failed to update template"),
  });

  const handleDelete = (template) => {
    setDeleteTarget({ id: template.id, name: template.name });
  };

  const handleApply = (template) => {
    setApplyingTemplate(template);
    setShowApplyDialog(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setShowEditDialog(true);
  };

  // Sort: favorites first, then by created_at desc
  const sortedTemplates = [...templates].sort((a, b) => {
    if (a.is_favorite && !b.is_favorite) return -1;
    if (!a.is_favorite && b.is_favorite) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h2 className="text-xl font-bold text-left text-ink">Meal Templates</h2>
          <p className="text-sm text-left text-ink-muted">
            Save meals from your Daily Log and quickly reapply them
          </p>
        </div>
      )}

      {sortedTemplates.length === 0 ? (
        <div className="text-center py-6 text-ink-muted text-sm">
          <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No templates yet.</p>
          <p className="text-xs mt-1">Save a meal from the daily log to get started.</p>
        </div>
      ) : compact ? (
        <div className="space-y-2">
          {sortedTemplates.map((template) => {
            const totals = getTemplateTotals(template.items || []);
            return (
              <div key={template.id} className="p-3 rounded-xl border border-charcoal-border/50 bg-charcoal-surface/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-ink truncate block">{template.name}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {template.is_favorite && <Star className="w-3 h-3 text-gold fill-gold shrink-0" />}
                      <span className="text-xs text-ink-muted capitalize">{template.template_type === "day" ? "Full Day" : template.meal_type || "Meal"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleFavoriteMutation.mutate({ id: template.id, is_favorite: !template.is_favorite })}
                      aria-label={template.is_favorite ? 'Unstar' : 'Star'}
                      className={`h-11 w-11 border-0 bg-transparent shadow-none hover:bg-transparent transition-colors ${template.is_favorite ? 'text-gold hover:text-gold' : 'text-ink-muted hover:text-gold'}`}
                    >
                      <Star className="w-4 h-4" fill={template.is_favorite ? 'currentColor' : 'none'} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(template)}
                      aria-label="Edit template"
                      className="h-11 w-11 border-0 bg-transparent shadow-none text-ink-muted hover:text-ink hover:bg-transparent transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleApply(template)}
                      className="h-11 px-3 text-xs"
                    >
                      <Play className="w-3 h-3" />Apply
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-xs tabular-nums">
                  <span className="text-gold font-bold">{Math.round(totals.calories)}<span className="text-ink-muted font-normal ml-0.5">cal</span></span>
                  <span className="text-coral">P{Math.round(totals.protein)}g</span>
                  <span className="text-carb">C{Math.round(totals.carbs)}g</span>
                  <span className="text-fat">F{Math.round(totals.fats)}g</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {sortedTemplates.map((template) => {
            const totals = getTemplateTotals(template.items || []);
            return (
              <Card key={template.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary">
                          {template.template_type === "day" ? "Full Day" : "Meal"}
                        </Badge>
                        {template.meal_type && template.template_type === "meal" && (
                          <Badge variant="outline" className="capitalize">
                            {template.meal_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        toggleFavoriteMutation.mutate({
                          id: template.id,
                          is_favorite: !template.is_favorite,
                        })
                      }
                      className={
                        template.is_favorite
                          ? "text-gold hover:text-gold"
                          : "text-ink-muted hover:text-gold"
                      }
                    >
                      <Star
                        className="w-4 h-4"
                        fill={template.is_favorite ? "currentColor" : "none"}
                      />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-ink-muted mb-3">
                    {template.items?.length || 0} items
                  </div>
                  <div className="flex gap-4 text-sm mb-4">
                    <div className="text-center">
                      <div className="font-bold text-gold tabular-nums">
                        {Math.round(totals.calories)}
                      </div>
                      <div className="text-xs text-ink-muted">Cal</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-coral tabular-nums">
                        {Math.round(totals.protein)}g
                      </div>
                      <div className="text-xs text-ink-muted">Protein</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-carb tabular-nums">
                        {Math.round(totals.carbs)}g
                      </div>
                      <div className="text-xs text-ink-muted">Carbs</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-fat tabular-nums">
                        {Math.round(totals.fats)}g
                      </div>
                      <div className="text-xs text-ink-muted">Fats</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApply(template)}
                      className="flex-1 bg-brand"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(template)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(template)}
                      className="text-bad hover:text-bad hover:bg-bad/10"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showApplyDialog && applyingTemplate && (
        <ApplyTemplateDialog
          open={showApplyDialog}
          onOpenChange={(open) => {
            setShowApplyDialog(open);
            if (!open) setApplyingTemplate(null);
          }}
          template={applyingTemplate}
          userId={user.id}
        />
      )}

      {showEditDialog && editingTemplate && (
        <EditTemplateDialog
          open={showEditDialog}
          onOpenChange={(open) => {
            setShowEditDialog(open);
            if (!open) setEditingTemplate(null);
          }}
          template={editingTemplate}
          onSave={(data) =>
            updateTemplateMutation.mutate({ id: editingTemplate.id, ...data })
          }
          isSaving={updateTemplateMutation.isPending}
          onDelete={() => {
            setShowEditDialog(false);
            setEditingTemplate(null);
            deleteTemplateMutation.mutate(editingTemplate.id);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Template?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          deleteTemplateMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        loading={deleteTemplateMutation.isPending}
      />
    </div>
  );
}

function ApplyTemplateDialog({ open, onOpenChange, template, userId }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const applyMutation = useMutation({
    mutationFn: async () => {
      const entries = (template.items || []).map((item) => {
        // Parse "300 g" into amount=300, unit="g"
        const parts = String(item.serving_size || "").split(" ");
        const amount = parseFloat(parts[0]) || 1;
        const unit = parts.slice(1).join(" ") || "serving";

        return {
          food_name: item.food_name,
          meal_type: item.meal_type || template.meal_type || "snack",
          serving_size: amount,
          serving_unit: unit,
          calories: item.calories,
          protein_grams: item.protein_grams,
          carbs_grams: item.carbs_grams,
          fats_grams: item.fats_grams,
          date,
          created_by: userId,
        };
      });
      await Promise.all(entries.map((e) => db.entities.FoodEntry.create(e)));
    },
    onSuccess: () => {
      invalidateFood(queryClient);
      toast.success(`Template "${template.name}" applied!`);
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to apply template"),
  });

  const totals = getTemplateTotals(template.items || []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent sheetMinHeight="">
        <DialogHeader>
          <DialogTitle>Apply Template: {template.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="section-label block mb-1">Date</Label>
            {/* Native date inputs render their own calendar indicator; the extra
                lucide glyph + pl-9 produced two calendar marks, so we rely on the
                native indicator alone. */}
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={applyMutation.isPending}
              className="mt-1 font-technical"
            />
          </div>

          <div>
            <p className="section-label">Items to add ({template.items?.length || 0})</p>
            {/* Template total summary */}
            <div className="flex items-center justify-between gap-3 mt-2 px-3 py-2.5 rounded-lg glass-inset">
              <span className="text-xs text-ink-muted uppercase tracking-wide">Total</span>
              <div className="flex gap-3 text-xs tabular-nums">
                <span className="text-gold font-bold">{Math.round(totals.calories)}<span className="text-ink-muted font-normal ml-0.5">cal</span></span>
                <span className="text-coral font-semibold">P{Math.round(totals.protein)}g</span>
                <span className="text-carb font-semibold">C{Math.round(totals.carbs)}g</span>
                <span className="text-fat font-semibold">F{Math.round(totals.fats)}g</span>
              </div>
            </div>
            {/* No inner scroll region on mobile — the whole sheet scrolls as one
                surface; a long item list is gated behind md: so the desktop
                dialog still caps its own height. */}
            <div className="space-y-2 mt-2 md:max-h-64 md:overflow-y-auto">
              {(template.items || []).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 p-3 bg-charcoal-surface/60 border border-charcoal-border/50 rounded-lg"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-ink truncate">
                      {item.food_name}
                    </div>
                    <div className="text-xs text-ink-muted capitalize">
                      {item.meal_type || template.meal_type}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-gold font-semibold tabular-nums">
                      {Math.round(item.calories || 0)}<span className="text-ink-muted font-normal ml-0.5">cal</span>
                    </div>
                    <div className="text-xs tabular-nums mt-0.5 flex gap-1.5 justify-end">
                      <span className="text-coral">P{Math.round(item.protein_grams || 0)}g</span>
                      <span className="text-carb">C{Math.round(item.carbs_grams || 0)}g</span>
                      <span className="text-fat">F{Math.round(item.fats_grams || 0)}g</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              variant="primary"
              size="lg"
              className="w-full"
            >
              {applyMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                "Apply to Food Log"
              )}
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              disabled={applyMutation.isPending}
              variant="ghost"
              size="lg"
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditTemplateDialog({ open, onOpenChange, template, onSave, isSaving, onDelete }) {
  const [name, setName] = useState(template.name);
  const [items, setItems] = useState(template.items || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setName(template.name);
    setItems(template.items || []);
    setExpandedIndex(null);
    setSearchQuery('');
    setSearchResults([]);
  }, [template.id]);

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [generic, branded] = await Promise.all([
          searchGenericFoods(searchQuery, 5),
          searchBrandedFoods(searchQuery, 5),
        ]);
        setSearchResults([...generic.slice(0, 4), ...branded.slice(0, 4)]);
      } catch {
        setSearchResults([]);
        toast.error("Food search failed. Check your connection and try again.");
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addFromSearch = (food) => {
    const servingG = food.servingSize || 100;
    const scale = servingG / 100;
    setItems(prev => [...prev, {
      food_name: food.description.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
      serving_size: `${servingG} ${food.servingSizeUnit || 'g'}`,
      calories: Math.round(food.calories * scale),
      protein_grams: Math.round(food.protein * scale * 10) / 10,
      carbs_grams: Math.round(food.carbs * scale * 10) / 10,
      fats_grams: Math.round(food.fats * scale * 10) / 10,
      meal_type: template.meal_type || 'snack',
    }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const addManual = () => {
    const newItems = [...items, { food_name: '', serving_size: '', calories: 0, protein_grams: 0, carbs_grams: 0, fats_grams: 0, meal_type: template.meal_type || 'snack' }];
    setItems(newItems);
    setExpandedIndex(newItems.length - 1);
  };

  const removeItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setExpandedIndex(prev => prev === index ? null : prev > index ? prev - 1 : prev);
  };

  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    onSave({ name: name.trim(), items });
  };

  // Running totals so a template named for a calorie target shows its current
  // sum live as items are edited/added/removed. Reuses the shared summer.
  const editTotals = getTemplateTotals(items);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg flex flex-col p-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-charcoal-border shrink-0">
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
            </DialogHeader>
            <Label className="section-label mt-3 block">Template Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder="Template name"
            />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>

            {/* Food search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted animate-spin" />}
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search foods to add..."
                  className="pl-9"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="mt-2 glass-sheet border border-charcoal-border/50 rounded-lg overflow-hidden">
                  {searchResults.map((food) => (
                    <button
                      key={food.fdcId}
                      onClick={() => addFromSearch(food)}
                      className="w-full text-left px-4 py-3 min-h-11 hover:bg-charcoal-elevated/60 active:bg-charcoal-elevated transition-colors duration-200 [transition-timing-function:var(--ease)] border-b border-charcoal-border/50 last:border-0"
                    >
                      <p className="text-sm font-medium text-ink truncate">{food.description}</p>
                      <p className="text-xs tabular-nums flex gap-2">
                        <span className="text-gold">{Math.round(food.calories * (food.servingSize || 100) / 100)} cal</span>
                        <span className="text-coral">P{Math.round(food.protein * (food.servingSize || 100) / 100)}g</span>
                        <span className="text-carb">C{Math.round(food.carbs * (food.servingSize || 100) / 100)}g</span>
                        <span className="text-fat">F{Math.round(food.fats * (food.servingSize || 100) / 100)}g</span>
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Running total — sticks to the top of the scroll region so the
                sum stays visible while editing a long item list. Each datum
                owns its hue: calories=gold, P=coral, C=carb, F=fat. */}
            {items.length > 0 && (
              <div className="sticky top-0 z-10 -mx-6 px-6 py-2 glass-sheet border-b border-charcoal-border/50 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-muted uppercase tracking-wide">Total</span>
                <div className="flex gap-3 text-xs tabular-nums">
                  <span className="text-gold font-bold">{Math.round(editTotals.calories)}<span className="text-ink-muted font-normal ml-0.5">cal</span></span>
                  <span className="text-coral font-semibold">P{Math.round(editTotals.protein)}g</span>
                  <span className="text-carb font-semibold">C{Math.round(editTotals.carbs)}g</span>
                  <span className="text-fat font-semibold">F{Math.round(editTotals.fats)}g</span>
                </div>
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              {items.length === 0 && (
                <p className="text-sm text-ink-muted text-center py-6">No items yet. Search above or add manually.</p>
              )}
              {items.map((item, idx) => {
                const isOpen = expandedIndex === idx;
                return (
                <div key={idx} className="rounded-lg border border-charcoal-border overflow-hidden">
                  {/* Row header — press the row body to expand; the chevron is its
                      own explicit 44px affordance with aria-expanded. */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    className="flex items-center gap-2 pl-3 py-2.5 cursor-pointer transition-[background,transform] duration-200 [transition-timing-function:var(--ease)] hover:bg-charcoal-elevated/50 active:bg-charcoal-elevated active:scale-[0.99]"
                    onClick={() => setExpandedIndex(isOpen ? null : idx)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedIndex(isOpen ? null : idx); } }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{item.food_name || <span className="text-ink-muted italic">Unnamed</span>}</p>
                      <p className="text-xs tabular-nums truncate flex gap-2">
                        <span className="text-gold">{Math.round(item.calories || 0)} cal</span>
                        <span className="text-coral">P{Math.round(item.protein_grams || 0)}g</span>
                        <span className="text-carb">C{Math.round(item.carbs_grams || 0)}g</span>
                        <span className="text-fat">F{Math.round(item.fats_grams || 0)}g</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={isOpen ? 'Collapse item' : 'Expand item'}
                      aria-expanded={isOpen}
                      onClick={(e) => { e.stopPropagation(); setExpandedIndex(isOpen ? null : idx); }}
                      className="h-11 w-11 flex items-center justify-center shrink-0 text-ink-muted hover:text-ink transition-colors duration-200 [transition-timing-function:var(--ease)]"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 [transition-timing-function:var(--ease)] ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove item"
                      onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                      className="h-11 w-11 border-0 bg-transparent shadow-none text-ink-muted hover:text-bad hover:bg-transparent shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Expanded edit form — animates open via a grid-rows collapse on
                      the single system easing instead of an instant mount. */}
                  <div
                    className="grid transition-[grid-template-rows,opacity] duration-200 [transition-timing-function:var(--ease)]"
                    style={{ gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0 }}
                  >
                    <div className="overflow-hidden">
                      <div className="px-3 pb-3 pt-2 border-t border-charcoal-border bg-charcoal-surface/50 space-y-2">
                        <div>
                          <Label className="text-xs text-ink-muted">Food Name</Label>
                          <Input value={item.food_name} onChange={(e) => updateItem(idx, 'food_name', e.target.value)} className="mt-1 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs text-ink-muted">Serving</Label>
                          <Input value={item.serving_size} onChange={(e) => updateItem(idx, 'serving_size', e.target.value)} className="mt-1 text-sm" placeholder="e.g. 100 g" />
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { field: 'calories', label: 'Cal', hue: 'text-gold' },
                            { field: 'protein_grams', label: 'P', hue: 'text-coral' },
                            { field: 'carbs_grams', label: 'C', hue: 'text-carb' },
                            { field: 'fats_grams', label: 'F', hue: 'text-fat' },
                          ].map(({ field, label, hue }) => (
                            <div key={field}>
                              <Label className={`text-xs font-semibold ${hue}`}>{label}</Label>
                              <Input
                                type="number"
                                value={item[field]}
                                onChange={(e) => updateItem(idx, field, parseFloat(e.target.value) || 0)}
                                className="mt-1 text-sm px-2"
                                min={0}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            {/* Add manually */}
            <button
              type="button"
              onClick={addManual}
              className="w-full min-h-11 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-ink-muted hover:text-ink border border-dashed border-charcoal-border rounded-lg hover:border-coral/40 transition-colors duration-200 [transition-timing-function:var(--ease)]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add manually
            </button>
          </div>

          {/* Footer */}
          <div
            className="px-6 py-4 border-t border-charcoal-border bg-charcoal-surface/80 shrink-0 space-y-2"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <Button onClick={handleSave} disabled={isSaving} variant="primary" size="lg" className="w-full">
              {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
            {/* Destructive action demoted to a quiet, right-aligned text control
                so the coral Save owns the thumb zone and Delete isn't adjacent. */}
            <div className="flex justify-end">
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                variant="dim"
                size="sm"
                className="border-0 text-ink-muted hover:text-bad"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Template?"
        description={`This will permanently delete "${name}". This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={onDelete}
      />
    </>
  );
}

// Exported helper for FoodTracker to create templates from existing entries
export function SaveAsTemplateDialog({ open, onOpenChange, entries, mealType, userId }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  // Per-item curation: every entry starts selected; the user can uncheck rows
  // so a day-as-template doesn't have to capture everything they logged.
  const [selected, setSelected] = useState(() => entries.map(() => true));
  const isDay = !mealType;

  useEffect(() => {
    setSelected(entries.map(() => true));
  }, [entries]);

  const toggle = (idx) =>
    setSelected((prev) => prev.map((v, i) => (i === idx ? !v : v)));

  // One source of truth for the desktop list cap: the md: scroll region shows
  // VISIBLE_ROWS rows before scrolling, and the "+N more" hint is derived from
  // the same number so the count and the cap can never drift apart.
  const VISIBLE_ROWS = 4;
  const hiddenCount = entries.length - VISIBLE_ROWS;

  const selectedEntries = entries.filter((_, idx) => selected[idx]);
  const totals = getTemplateTotals(
    selectedEntries.map((e) => ({
      calories: e.calories,
      protein_grams: e.protein_grams,
      carbs_grams: e.carbs_grams,
      fats_grams: e.fats_grams,
    }))
  );

  const createMutation = useMutation({
    mutationFn: (data) => db.entities.MealTemplate.create(data),
    onSuccess: () => {
      invalidateMealTemplates(queryClient);
      toast.success("Template saved!");
      onOpenChange(false);
      setName("");
    },
    onError: () => toast.error("Failed to save template"),
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    if (selectedEntries.length === 0) {
      toast.error("Select at least one item");
      return;
    }

    const items = selectedEntries.map((e) => ({
      food_name: e.food_name,
      serving_size: e.serving_size,
      calories: e.calories,
      protein_grams: e.protein_grams,
      carbs_grams: e.carbs_grams,
      fats_grams: e.fats_grams,
      meal_type: e.meal_type,
    }));

    createMutation.mutate({
      name: name.trim(),
      template_type: isDay ? "day" : "meal",
      meal_type: mealType || null,
      items,
      is_favorite: false,
      created_by: userId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-charcoal-border shrink-0">
          <DialogHeader className="mb-0">
            <DialogTitle>
              Save {isDay ? "Day" : `${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`} as Template
            </DialogTitle>
          </DialogHeader>
          <Label className="section-label mt-3 block">Template Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              isDay
                ? "e.g., Weekday Eating"
                : `e.g., ${mealType ? mealType.charAt(0).toUpperCase() + mealType.slice(1) : "Meal"} Favorites`
            }
            className="mt-1"
            autoFocus
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <p className="text-sm text-ink font-semibold tabular-nums">
            {selectedEntries.length} of {entries.length} item{entries.length !== 1 ? "s" : ""} to save
          </p>
          {/* Selected total summary */}
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg glass-inset">
            <span className="text-xs text-ink-muted uppercase tracking-wide">Total</span>
            <div className="flex gap-3 text-xs tabular-nums">
              <span className="text-gold font-bold">{Math.round(totals.calories)}<span className="text-ink-muted font-normal ml-0.5">cal</span></span>
              <span className="text-coral font-semibold">P{Math.round(totals.protein)}g</span>
              <span className="text-carb font-semibold">C{Math.round(totals.carbs)}g</span>
              <span className="text-fat font-semibold">F{Math.round(totals.fats)}g</span>
            </div>
          </div>
          {/* Row cap on BOTH breakpoints — a long day-as-template would otherwise
              push the count + total off-screen. The list scrolls within this cap
              (40dvh on mobile, 48 on desktop) and the "+N more" hint below is
              derived from the same VISIBLE_ROWS so count and cap never drift. */}
          <div className="space-y-2 max-h-[40dvh] overflow-y-auto md:max-h-48">
            {entries.map((e, idx) => (
              <label
                key={idx}
                className="flex items-center gap-3 p-2.5 min-h-11 bg-charcoal-surface/60 border border-charcoal-border/50 rounded-lg text-sm cursor-pointer"
              >
                <Checkbox
                  checked={selected[idx]}
                  onCheckedChange={() => toggle(idx)}
                  variant="neutral"
                  aria-label={`Include ${e.food_name}`}
                />
                <span className={`flex-1 truncate ${selected[idx] ? 'text-ink' : 'text-ink-muted line-through'}`}>{e.food_name}</span>
                <span className="text-gold font-semibold tabular-nums shrink-0">{Math.round(e.calories || 0)}<span className="text-ink-muted font-normal ml-0.5">cal</span></span>
              </label>
            ))}
          </div>
          {hiddenCount > 0 && (
            <p className="text-xs text-ink-muted text-center tabular-nums pt-0.5">
              +{hiddenCount} more below
            </p>
          )}
        </div>

        {/* Footer — pinned, non-scrolling, owns the thumb zone */}
        <div
          className="px-6 py-4 border-t border-charcoal-border bg-charcoal-surface/80 shrink-0 space-y-2"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <Button
            onClick={handleSave}
            disabled={createMutation.isPending || !name.trim() || selectedEntries.length === 0}
            variant="primary"
            size="lg"
            className="w-full"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Template"
            )}
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
            variant="ghost"
            size="lg"
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
