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
  Calendar,
  Pencil,
  Search,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { searchGenericFoods, searchBrandedFoods } from "@/api/usda";
import { toast } from "sonner";

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

  const getTemplateTotals = (items) =>
    items.reduce(
      (acc, item) => ({
        calories: acc.calories + (item.calories || 0),
        protein: acc.protein + (item.protein_grams || 0),
        carbs: acc.carbs + (item.carbs_grams || 0),
        fats: acc.fats + (item.fats_grams || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-[#ccff00]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h2 className="text-xl font-bold text-left text-white">Meal Templates</h2>
          <p className="text-sm text-left text-[#a0a0a0]">
            Save meals from your Daily Log and quickly reapply them
          </p>
        </div>
      )}

      {sortedTemplates.length === 0 ? (
        <div className="text-center py-6 text-[#555555] text-sm">
          <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No templates yet.</p>
          <p className="text-xs mt-1">Save a meal from the daily log to get started.</p>
        </div>
      ) : compact ? (
        <div className="space-y-2">
          {sortedTemplates.map((template) => {
            const totals = getTemplateTotals(template.items || []);
            return (
              <div key={template.id} className="p-3 rounded-xl border border-[#2a2a2a]/50 bg-[#1a1a1a]/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white truncate block">{template.name}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {template.is_favorite && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                      <span className="text-xs text-[#555555] text-[#555555] capitalize">{template.template_type === "day" ? "Full Day" : template.meal_type || "Meal"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleFavoriteMutation.mutate({ id: template.id, is_favorite: !template.is_favorite })}
                      className={`p-1.5 transition-colors ${template.is_favorite ? 'text-yellow-500 hover:text-yellow-400' : 'text-[#a0a0a0] hover:text-yellow-500'}`}
                      title={template.is_favorite ? 'Unstar' : 'Star'}
                    >
                      <Star className="w-3 h-3" fill={template.is_favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-1.5 text-[#a0a0a0] hover:text-[#a0a0a0] transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleApply(template)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-colors"
                    >
                      <Play className="w-2.5 h-2.5" />Apply
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 text-xs font-mono">
                  <span className="text-white font-bold">{Math.round(totals.calories)}<span className="text-[#a0a0a0] font-normal ml-0.5">cal</span></span>
                  <span className="text-[#60a5fa]">P{Math.round(totals.protein)}g</span>
                  <span className="text-[#fbbf24]">C{Math.round(totals.carbs)}g</span>
                  <span className="text-[#f87171]">F{Math.round(totals.fats)}g</span>
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
                          ? "text-yellow-500 hover:text-yellow-600"
                          : "text-[#a0a0a0] hover:text-yellow-500"
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
                  <div className="text-xs text-[#555555] mb-3">
                    {template.items?.length || 0} items
                  </div>
                  <div className="flex gap-4 text-sm mb-4">
                    <div className="text-center">
                      <div className="font-bold text-white">
                        {Math.round(totals.calories)}
                      </div>
                      <div className="text-xs text-[#555555]">Cal</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-[#60a5fa]">
                        {Math.round(totals.protein)}g
                      </div>
                      <div className="text-xs text-[#555555]">Protein</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-green-600">
                        {Math.round(totals.carbs)}g
                      </div>
                      <div className="text-xs text-[#555555]">Carbs</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-yellow-600">
                        {Math.round(totals.fats)}g
                      </div>
                      <div className="text-xs text-[#555555]">Fats</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApply(template)}
                      className="flex-1 bg-[rgba(204,255,0,0.08)]0"
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
                      className="text-[#f87171] hover:text-[#f87171] hover:bg-[rgba(239,68,68,0.08)]"
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
      const entries = (template.items || []).map((item) => ({
        food_name: item.food_name,
        meal_type: item.meal_type || template.meal_type || "snack",
        serving_size: item.serving_size,
        calories: item.calories,
        protein_grams: item.protein_grams,
        carbs_grams: item.carbs_grams,
        fats_grams: item.fats_grams,
        date,
        created_by: userId,
      }));
      await Promise.all(entries.map((e) => db.entities.FoodEntry.create(e)));
    },
    onSuccess: () => {
      invalidateFood(queryClient);
      toast.success(`Template "${template.name}" applied!`);
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to apply template"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply Template: {template.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Items to add ({template.items?.length || 0})</Label>
            <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
              {(template.items || []).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg"
                >
                  <div>
                    <div className="font-medium text-sm text-white">
                      {item.food_name}
                    </div>
                    <div className="text-xs text-[#555555] capitalize">
                      {item.meal_type || template.meal_type}
                    </div>
                  </div>
                  <div className="text-xs text-[#a0a0a0]">
                    {item.calories} cal
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
            className="w-full bg-[rgba(204,255,0,0.08)]0"
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
      } catch {} finally {
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg flex flex-col p-0 overflow-hidden max-h-[90vh]">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-[#2a2a2a] shrink-0">
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
            </DialogHeader>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-3"
              placeholder="Template name"
            />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>

            {/* Food search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a0a0a0]" />
                {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a0a0a0] animate-spin" />}
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search foods to add..."
                  className="pl-9"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg max-h-52 overflow-y-auto">
                  {searchResults.map((food) => (
                    <button
                      key={food.fdcId}
                      onClick={() => addFromSearch(food)}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#1a1a1a] hover:bg-[#242424] transition-colors border-b border-[#2a2a2a]/60 last:border-0"
                    >
                      <p className="text-sm font-medium text-white truncate">{food.description}</p>
                      <p className="text-xs text-[#555555] font-mono">
                        {Math.round(food.calories * (food.servingSize || 100) / 100)} cal · P{Math.round(food.protein * (food.servingSize || 100) / 100)}g · C{Math.round(food.carbs * (food.servingSize || 100) / 100)}g · F{Math.round(food.fats * (food.servingSize || 100) / 100)}g
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Items */}
            <div className="space-y-2">
              {items.length === 0 && (
                <p className="text-sm text-[#a0a0a0] text-center py-6">No items yet. Search above or add manually.</p>
              )}
              {items.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-[#2a2a2a] overflow-hidden">
                  {/* Row header — click to expand */}
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-[#1a1a1a] hover:bg-[#242424]/50 transition-colors"
                    onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{item.food_name || <span className="text-[#a0a0a0] italic">Unnamed</span>}</p>
                      <p className="text-xs font-mono text-[#555555]">{item.calories} cal · P{item.protein_grams}g · C{item.carbs_grams}g · F{item.fats_grams}g</p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-[#a0a0a0] shrink-0 transition-transform ${expandedIndex === idx ? 'rotate-180' : ''}`} />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                      className="p-1 text-[#a0a0a0] hover:text-[#f87171] transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Expanded edit form */}
                  {expandedIndex === idx && (
                    <div className="px-3 pb-3 pt-2 border-t border-[#2a2a2a] bg-[#1a1a1a] bg-[#1a1a1a]/50 space-y-2">
                      <div>
                        <Label className="text-xs text-[#555555]">Food Name</Label>
                        <Input value={item.food_name} onChange={(e) => updateItem(idx, 'food_name', e.target.value)} className="mt-1 h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs text-[#555555]">Serving</Label>
                        <Input value={item.serving_size} onChange={(e) => updateItem(idx, 'serving_size', e.target.value)} className="mt-1 h-8 text-sm" placeholder="e.g. 100 g" />
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { field: 'calories', label: 'Cal' },
                          { field: 'protein_grams', label: 'Pro' },
                          { field: 'carbs_grams', label: 'Car' },
                          { field: 'fats_grams', label: 'Fat' },
                        ].map(({ field, label }) => (
                          <div key={field}>
                            <Label className="text-xs text-[#555555]">{label}</Label>
                            <Input
                              type="number"
                              value={item[field]}
                              onChange={(e) => updateItem(idx, field, parseFloat(e.target.value) || 0)}
                              className="mt-1 h-8 text-sm"
                              min={0}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add manually */}
            <button
              onClick={addManual}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-[#a0a0a0] hover:text-violet-600 border border-dashed border-[#2a2a2a] rounded-lg hover:border-violet-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add manually
            </button>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#2a2a2a] bg-[#121212] shrink-0 space-y-2">
            <Button onClick={handleSave} disabled={isSaving} className="w-full bg-[rgba(204,255,0,0.08)]0 hover:bg-[#ccff00] text-black font-bold">
              {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
            <Button
              onClick={() => setShowDeleteConfirm(true)}
              variant="ghost"
              className="w-full text-[#f87171] hover:text-[#f87171] hover:bg-[rgba(239,68,68,0.08)]"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Template
            </Button>
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
  const isDay = !mealType;

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

    const items = entries.map((e) => ({
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Save {isDay ? "Day" : `${mealType}`} as Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Template Name</Label>
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

          <div className="text-sm text-[#a0a0a0]">
            {entries.length} item{entries.length !== 1 ? "s" : ""} will be saved
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {entries.map((e, idx) => (
              <div key={idx} className="flex justify-between p-2 bg-[#1a1a1a] rounded text-sm">
                <span className="text-white">{e.food_name}</span>
                <span className="text-[#555555]">{e.calories} cal</span>
              </div>
            ))}
          </div>

          <Button
            onClick={handleSave}
            disabled={createMutation.isPending || !name.trim()}
            className="w-full bg-[rgba(204,255,0,0.08)]0"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
