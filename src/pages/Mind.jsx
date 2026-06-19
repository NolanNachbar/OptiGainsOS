import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import QuickCapture from "@/components/QuickCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SubTabs } from "@/components/ui/system";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, BookOpen, GraduationCap, History, Plus, Trash2, Pencil,
  Star, AlertTriangle, Timer, Layers, X, CheckCircle2, Zap,
} from "lucide-react";
import { format, parseISO, differenceInDays, subDays } from "date-fns";
import { toast } from "sonner";

// ─── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_LABELS = { reading: "Reading", finished: "Finished", paused: "Paused", "want-to-read": "Want to Read" };
const STATUS_COLORS = {
  reading: "bg-violet/10 text-violet border-violet/20",
  finished: "bg-leaf/10 text-leaf border-leaf/20",
  paused: "bg-warn/10 text-warn border-warn/20",
  "want-to-read": "bg-charcoal-surface2 text-muted-2 border-charcoal-border",
};
const CAT_COLORS = {
  technical: "bg-carb/10 text-carb border-carb/20",
  business: "bg-gold/10 text-gold border-gold/20",
  philosophy: "bg-violet/10 text-violet border-violet/20",
  other: "bg-charcoal-surface2 text-muted-2 border-charcoal-border",
};
const MEDIUM_COLORS = {
  video: "bg-carb/10 text-carb border-carb/20",
  book: "bg-violet/10 text-violet border-violet/20",
  project: "bg-leaf/10 text-leaf border-leaf/20",
  course: "bg-gold/10 text-gold border-gold/20",
  article: "bg-teal/10 text-teal border-teal/20",
};

function StarRating({ value, onChange, readonly }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => !readonly && onChange?.(n)}
          className={`transition-colors inline-flex items-center justify-center ${readonly ? "cursor-default" : "cursor-pointer hover:text-violet min-w-11 min-h-11 -m-2.5"} ${n <= (value || 0) ? "text-violet" : "text-ink-faint"}`}
          disabled={readonly}
        >
          <Star className="w-4 h-4 fill-current" />
        </button>
      ))}
    </div>
  );
}

function TabQueryState({ isLoading, isError, onRetry }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(n => <Skeleton key={n} className="h-20 rounded-2xl" />)}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-12 text-center border-2 border-dashed border-charcoal-border rounded-2xl">
        <AlertTriangle className="w-7 h-7 text-warn mx-auto mb-2" />
        <p className="text-sm font-semibold text-muted-2 mb-3">Couldn't load data.</p>
        <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  return null;
}

// ─── Reading Tab ───────────────────────────────────────────────────────────────
function ReadingTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showAllRest, setShowAllRest] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", category: "technical", status: "want-to-read", rating: 0, notes: "" });

  const { data: books = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["reading-log", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("reading_log").select("*").eq("created_by", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const resetForm = () => setForm({ title: "", author: "", category: "technical", status: "want-to-read", rating: 0, notes: "" });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        created_by: user.id,
        started_at: form.status === "reading" || form.status === "finished" ? (form.started_at || format(new Date(), "yyyy-MM-dd")) : (form.started_at || null),
        finished_at: form.status === "finished" ? (form.finished_at || format(new Date(), "yyyy-MM-dd")) : null,
      };
      if (editing) {
        const { error } = await supabase.from("reading_log").update(payload).eq("id", editing.id).eq("created_by", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reading_log").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reading-log"] });
      setShowAdd(false);
      setEditing(null);
      resetForm();
      toast.success(editing ? "Updated" : "Book added");
    },
    onError: () => toast.error("Failed to save"),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ book, status }) => {
      const updates = { status };
      if (status === "reading" && book.status !== "reading" && !book.started_at) updates.started_at = format(new Date(), "yyyy-MM-dd");
      if (status === "finished" && book.status !== "finished" && !book.finished_at) updates.finished_at = format(new Date(), "yyyy-MM-dd");
      const { error } = await supabase.from("reading_log").update(updates).eq("id", book.id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reading-log"] }),
    onError: () => toast.error("Failed to update"),
  });

  const del = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("reading_log").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reading-log"] }),
    onError: () => toast.error("Failed to delete"),
  });

  const openEdit = (book) => {
    setForm({ title: book.title, author: book.author || "", category: book.category || "other", status: book.status, rating: book.rating || 0, notes: book.notes || "", started_at: book.started_at || "", finished_at: book.finished_at || "" });
    setEditing(book);
    setShowAdd(true);
  };

  const currentlyReading = books.filter(b => b.status === "reading");
  const rest = books.filter(b => b.status !== "reading");
  const STATUS_ORDER = ["want-to-read", "paused", "finished"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-technical text-xs font-semibold text-muted-2">{books.filter(b => b.status === "finished").length} finished · {currentlyReading.length} in progress</p>
        </div>
        <Button variant="volt" size="sm" onClick={() => { resetForm(); setEditing(null); setShowAdd(true); }} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Book
        </Button>
      </div>

      <TabQueryState isLoading={isLoading} isError={isError} onRetry={refetch} />

      {currentlyReading.length > 0 && (
        <div>
          <h3 className="section-label !text-violet mb-3">Currently Reading</h3>
          <div className="space-y-3">
            {currentlyReading.map(book => <BookCard key={book.id} book={book} onEdit={openEdit} onDelete={setConfirmDelete} onStatusChange={updateStatus.mutate} />)}
          </div>
        </div>
      )}

      {rest.length > 0 && (() => {
        const sortedRest = [...rest].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
        const visibleRest = showAllRest ? sortedRest : sortedRest.slice(0, 6);
        return (
          <div>
            <h3 className="section-label mb-3">All Books</h3>
            <div className="space-y-3">
              {visibleRest.map(book => (
                <BookCard key={book.id} book={book} onEdit={openEdit} onDelete={setConfirmDelete} onStatusChange={updateStatus.mutate} />
              ))}
            </div>
            {sortedRest.length > 6 && (
              <Button variant="ghost" size="sm" className="w-full mt-3" onClick={() => setShowAllRest(v => !v)}>
                {showAllRest ? "Show less" : `Show ${sortedRest.length - 6} more`}
              </Button>
            )}
          </div>
        );
      })()}

      {!isLoading && !isError && books.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-charcoal-border rounded-2xl">
          <BookOpen className="w-8 h-8 text-faint mx-auto mb-2" />
          <p className="text-sm font-semibold text-muted-2 mb-3">Start your reading list — track books, takeaways, and ratings.</p>
          <Button variant="ghost" size="sm" onClick={() => { resetForm(); setEditing(null); setShowAdd(true); }}>Add your first book</Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}
        title="Delete book?"
        description="This permanently removes the book and its notes."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => { del.mutate(confirmDelete); setConfirmDelete(null); }}
      />

      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); setEditing(null); resetForm(); } }}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader><DialogTitle className="text-ink">{editing ? "Edit Book" : "Add Book"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-ink-muted mb-1.5 block">Title</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Book title" className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-ink-muted mb-1.5 block">Author</Label>
              <Input value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))} placeholder="Author" className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-ink-muted mb-1.5 block">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["technical","business","philosophy","other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-ink-muted mb-1.5 block">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-ink-muted mb-1.5 block">Rating</Label>
              <StarRating value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} />
            </div>
            <div>
              <Label className="text-xs text-ink-muted mb-1.5 block">Notes</Label>
              <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Key takeaways..." className="h-9" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setShowAdd(false); resetForm(); }}>Cancel</Button>
              <Button variant="volt" size="sm" className="flex-1" disabled={!form.title.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookCard({ book, onEdit, onDelete, onStatusChange }) {
  const STATUS_NEXT = { "want-to-read": "reading", reading: "finished", finished: "finished", paused: "reading" };
  return (
    <div className="glass glass-interactive p-4 group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-ink truncate">{book.title}</p>
          {book.author && <p className="text-xs font-semibold text-muted-2">{book.author}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(book)} className="min-w-11 min-h-11 -m-1.5 inline-flex items-center justify-center text-muted-2 hover:text-ink opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-all">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(book.id)} className="min-w-11 min-h-11 -m-1.5 inline-flex items-center justify-center text-muted-2 hover:text-bad opacity-60 md:opacity-0 md:group-hover:opacity-100 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onStatusChange({ book, status: STATUS_NEXT[book.status] })}
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-[0.5px] transition-colors ${STATUS_COLORS[book.status]}`}
        >
          {STATUS_LABELS[book.status]}
        </button>
        {book.category && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-[0.5px] ${CAT_COLORS[book.category] || CAT_COLORS.other}`}>
            {book.category}
          </span>
        )}
        {book.rating > 0 && <StarRating value={book.rating} readonly />}
      </div>
      {book.notes && <p className="text-xs font-semibold text-muted-2 mt-2 italic border-l-2 hairline pl-2">{book.notes}</p>}
    </div>
  );
}

// ─── Study Tab ─────────────────────────────────────────────────────────────────
function StudyTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ topic: "", duration_min: "", medium: "video", notes: "" });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: logs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["study-log", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("study_log").select("*").eq("created_by", user.id).order("logged_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: totalSessions, isError: totalSessionsError } = useQuery({
    queryKey: ["study-log", "count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase.from("study_log").select("*", { count: "exact", head: true }).eq("created_by", user.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: weekMinutes, isError: weekMinutesError } = useQuery({
    queryKey: ["study-log", "week-minutes", user?.id],
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase.from("study_log").select("duration_min").eq("created_by", user.id).gte("logged_at", since);
      if (error) throw error;
      return (data || []).reduce((s, l) => s + (l.duration_min || 0), 0);
    },
    enabled: !!user,
  });

  const weeklyHours = (weekMinutes ?? logs.filter(l => {
    const days = differenceInDays(new Date(), parseISO(l.logged_at));
    return days <= 7;
  }).reduce((s, l) => s + (l.duration_min || 0), 0)) / 60;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("study_log").insert({ ...form, duration_min: parseInt(form.duration_min), created_by: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study-log"] });
      setForm(p => ({ ...p, topic: "", duration_min: "", notes: "" }));
      toast.success("Study session logged");
    },
    onError: () => toast.error("Failed to save"),
  });

  const del = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("study_log").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["study-log"] }),
    onError: () => toast.error("Failed to delete"),
  });

  return (
    <div className="space-y-6">
      <div className="glass glass-interactive p-5">
        <h3 className="section-label mb-4 flex items-center gap-2">
          <Zap className="w-3 h-3 text-violet" /> Log Study Session
        </h3>
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Input value={form.topic} onChange={e => setForm(p => ({ ...p, topic: e.target.value }))} placeholder="Topic / Subject" className="h-9" />
              </div>
              <Input type="number" value={form.duration_min} onChange={e => setForm(p => ({ ...p, duration_min: e.target.value }))} placeholder="Minutes" className="h-9" />
              <Select value={form.medium} onValueChange={v => setForm(p => ({ ...p, medium: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["video","book","project","course","article"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)" className="h-9" />
            <Button
              variant="volt"
              className="w-full"
              disabled={!form.topic.trim() || !form.duration_min || save.isPending}
              onClick={() => save.mutate()}
            >
              Log Session
            </Button>
          </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass-inset p-4 text-center">
          <p className="font-technical text-2xl font-extrabold text-ink">{weekMinutesError ? "—" : weeklyHours.toFixed(1)}</p>
          <p className="text-[10px] font-bold text-muted-2 uppercase tracking-[0.08em] mt-0.5">hrs this week</p>
        </div>
        <div className="glass-inset p-4 text-center">
          <p className="font-technical text-2xl font-extrabold text-ink">{totalSessionsError ? "—" : (totalSessions ?? logs.length)}</p>
          <p className="text-[10px] font-bold text-muted-2 uppercase tracking-[0.08em] mt-0.5">total sessions</p>
        </div>
      </div>

      <div>
        <h3 className="section-label mb-3 flex items-center gap-2">
          <History className="w-3 h-3" /> Recent Sessions
        </h3>
        <div className="space-y-2">
          <TabQueryState isLoading={isLoading} isError={isError} onRetry={refetch} />
          {!isLoading && !isError && logs.length === 0 && (
            <div className="py-12 text-center border-2 border-dashed border-charcoal-border rounded-2xl">
              <GraduationCap className="w-7 h-7 text-faint mx-auto mb-2" />
              <p className="text-sm font-semibold text-muted-2">Log your first session above to start the streak.</p>
            </div>
          )}
          {logs.map(log => (
            <div key={log.id} className="flex items-center gap-3 px-4 py-3 glass-inset group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-ink truncate">{log.topic}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 font-technical text-[10px] font-semibold text-muted-2">
                    <Timer className="w-3 h-3" />{log.duration_min} min
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border-[0.5px] ${MEDIUM_COLORS[log.medium] || ""}`}>{log.medium}</span>
                  <span className="font-technical text-[10px] font-semibold text-muted-2">{format(parseISO(log.logged_at), "MMM d")}</span>
                </div>
              </div>
              <button onClick={() => setConfirmDelete(log.id)} className="min-w-11 min-h-11 -m-1.5 inline-flex items-center justify-center opacity-60 md:opacity-0 md:group-hover:opacity-100 text-muted-2 hover:text-bad transition-all shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}
        title="Delete study session?"
        description="This permanently removes the session from your log."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => { del.mutate(confirmDelete); setConfirmDelete(null); }}
      />
    </div>
  );
}

// ─── Skills Tab ────────────────────────────────────────────────────────────────
function SkillsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", level: 3 });

  const { data: skills = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["skills", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("skills").select("*").eq("created_by", user.id).order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("skills").insert({ ...form, created_by: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      setShowAdd(false);
      setForm({ name: "", category: "", level: 3 });
      toast.success("Skill added");
    },
    onError: () => toast.error("Failed to save"),
  });

  const practiced = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("skills").update({ last_practiced_at: format(new Date(), "yyyy-MM-dd") }).eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
    onError: () => toast.error("Failed to update"),
  });

  const updateLevel = useMutation({
    mutationFn: async ({ id, level }) => {
      const { error } = await supabase.from("skills").update({ level }).eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });

  const del = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("skills").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
    onError: () => toast.error("Failed to delete"),
  });

  const stale = skills.filter(s => {
    if (!s.last_practiced_at) return true;
    return differenceInDays(new Date(), parseISO(s.last_practiced_at)) > 14;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {stale.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-warn">
            <AlertTriangle className="w-3.5 h-3.5" />
            {stale.length} skill{stale.length > 1 ? "s" : ""} not practiced in 14+ days
          </div>
        )}
        <div className="ml-auto">
          <Button variant="volt" size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Skill
          </Button>
        </div>
      </div>

      <TabQueryState isLoading={isLoading} isError={isError} onRetry={refetch} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(showAllSkills ? skills : skills.slice(0, 6)).map(skill => {
          const daysSince = skill.last_practiced_at ? differenceInDays(new Date(), parseISO(skill.last_practiced_at)) : null;
          const isStale = daysSince === null || daysSince > 14;
          return (
            <div key={skill.id} className={`glass p-4 group ${isStale ? "rounded-2xl border-warn/15 bg-warn/[0.04]" : "glass-interactive"}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-extrabold text-ink">{skill.name}</p>
                  {skill.category && <p className="text-[10px] font-semibold text-muted-2">{skill.category}</p>}
                </div>
                <button onClick={() => setConfirmDelete(skill.id)} className="opacity-60 md:opacity-0 md:group-hover:opacity-100 text-muted-2 hover:text-bad transition-all min-w-11 min-h-11 -m-1.5 inline-flex items-center justify-center">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 mb-3">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    onClick={() => updateLevel.mutate({ id: skill.id, level: n })}
                    className="min-w-11 min-h-11 -m-2.5 inline-flex items-center justify-center rounded-full"
                  >
                    <span className={`block w-2.5 h-2.5 rounded-full transition-colors ${n <= (skill.level || 0) ? "bg-violet" : "bg-charcoal-surface2"}`} />
                  </button>
                ))}
                <span className="font-technical text-[10px] font-semibold text-muted-2 ml-1">Level {skill.level || 0}/5</span>
              </div>
              <div className="flex items-center justify-between">
                {isStale ? (
                  <span className="text-[10px] font-bold text-warn flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {daysSince === null ? "Never practiced" : `${daysSince}d ago`}
                  </span>
                ) : (
                  <span className="font-technical text-[10px] font-semibold text-muted-2">{daysSince}d ago</span>
                )}
                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-brand hover:bg-brand/10 px-2" onClick={() => practiced.mutate(skill.id)}>
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Practiced
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {skills.length > 6 && (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllSkills(v => !v)}>
          {showAllSkills ? "Show less" : `Show ${skills.length - 6} more`}
        </Button>
      )}

      {!isLoading && !isError && skills.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-charcoal-border rounded-2xl">
          <Layers className="w-8 h-8 text-faint mx-auto mb-2" />
          <p className="text-sm font-semibold text-muted-2 mb-3">Track what you're building — rate your level and keep skills warm.</p>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>Add your first skill</Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}
        title="Delete skill?"
        description="This permanently removes the skill and its practice history."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => { del.mutate(confirmDelete); setConfirmDelete(null); }}
      />

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader><DialogTitle className="text-ink">Add Skill</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-ink-muted mb-1.5 block">Skill name</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. TypeScript" className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-ink-muted mb-1.5 block">Category (optional)</Label>
              <Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Frontend, Machine Learning" className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-ink-muted mb-1.5 block">Current level</Label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    onClick={() => setForm(p => ({ ...p, level: n }))}
                    className={`w-8 h-8 rounded-full text-xs font-bold border-[0.5px] transition-colors ${n === form.level ? "bg-brand text-[var(--color-action-dark)] border-brand" : "bg-charcoal-surface2 text-muted-2 border-charcoal-border"}`}
                  >{n}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button variant="volt" size="sm" className="flex-1" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Capture Tab ───────────────────────────────────────────────────────────────
function CaptureTab() {
  const { user } = useAuth();
  const { data: recentLogs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["capture-inbox", "mind", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("capture_inbox").select("*").eq("created_by", user.id).eq("domain", "mind").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="section-label mb-3 flex items-center gap-2">
          <BookOpen className="w-3 h-3 text-violet" /> New Learning Log
        </h3>
        <QuickCapture domain="mind" placeholder="What did you learn today? Notes on books, courses, or technical concepts..." />
      </div>
      <div>
        <h3 className="section-label mb-3 flex items-center gap-2">
          <History className="w-3 h-3" /> Recent Streams
        </h3>
        <div className="space-y-3">
          <TabQueryState isLoading={isLoading} isError={isError} onRetry={refetch} />
          {recentLogs.length > 0 ? recentLogs.map(log => (
            <div key={log.id} className="glass p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-technical text-[10px] text-violet font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-violet/10">
                  {format(parseISO(log.created_at), "MMM d, h:mm a")}
                </span>
                {log.processed && <span className="text-[10px] text-leaf font-bold uppercase tracking-wider">Synced</span>}
              </div>
              <p className="text-sm font-semibold text-secondary whitespace-pre-wrap leading-relaxed">{log.content}</p>
            </div>
          )) : (!isLoading && !isError && (
            <div className="flex items-center gap-2 py-2 text-muted-2">
              <GraduationCap className="w-4 h-4 text-faint shrink-0" />
              <p className="text-sm font-semibold">Drop your first note above to start the stream.</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const MIND_TABS = [
  { id: "capture", label: "Capture", icon: Zap },
  { id: "reading", label: "Reading", icon: BookOpen },
  { id: "study", label: "Study", icon: GraduationCap },
  { id: "skills", label: "Skills", icon: Layers },
];

export default function Mind({ hideHeader }) {
  const [activeTab, setActiveTab] = useState("capture");
  return (
    <div className={hideHeader ? '' : 'px-4 py-6 md:px-8 bg-charcoal min-h-screen'}>
      <div className="max-w-3xl mx-auto">
        {!hideHeader && (
          <header className="mb-6 rise-in">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 bg-violet/[0.13]">
                <Brain className="w-[15px] h-[15px] text-violet" />
              </div>
              <h1 className="type-display text-2xl">Mind & Learning</h1>
            </div>
          </header>
        )}

        <SubTabs
          tabs={MIND_TABS}
          active={activeTab}
          onChange={setActiveTab}
          sticky={false}
          showOnDesktop
          className={`mb-6 ${hideHeader ? '' : '-mx-4 md:-mx-8'}`}
        />
        {activeTab === "capture" && <CaptureTab />}
        {activeTab === "reading" && <ReadingTab />}
        {activeTab === "study" && <StudyTab />}
        {activeTab === "skills" && <SkillsTab />}
      </div>
    </div>
  );
}
