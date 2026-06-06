import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import QuickCapture from "@/components/QuickCapture";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Brain, BookOpen, GraduationCap, History, Plus, Trash2, Pencil,
  Star, AlertTriangle, Timer, Layers, X, CheckCircle2, Zap,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";

// ─── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_LABELS = { reading: "Reading", finished: "Finished", paused: "Paused", "want-to-read": "Want to Read" };
const STATUS_COLORS = {
  reading: "bg-brand/10 text-brand border-brand/20",
  finished: "bg-green-500/10 text-green-400 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  "want-to-read": "bg-charcoal-elevated text-slate-400 border-charcoal-border",
};
const CAT_COLORS = {
  technical: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  business: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  philosophy: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  other: "bg-charcoal-elevated text-slate-500 border-charcoal-border",
};
const MEDIUM_COLORS = {
  video: "bg-red-500/10 text-red-400 border-red-500/20",
  book: "bg-brand/10 text-brand border-brand/20",
  project: "bg-green-500/10 text-green-400 border-green-500/20",
  course: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  article: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

function StarRating({ value, onChange, readonly }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => !readonly && onChange?.(n)}
          className={`transition-colors ${readonly ? "cursor-default" : "cursor-pointer hover:text-brand"} ${n <= (value || 0) ? "text-brand" : "text-slate-700"}`}
          disabled={readonly}
        >
          <Star className="w-4 h-4 fill-current" />
        </button>
      ))}
    </div>
  );
}

// ─── Reading Tab ───────────────────────────────────────────────────────────────
function ReadingTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", author: "", category: "technical", status: "want-to-read", rating: 0, notes: "" });

  const { data: books = [] } = useQuery({
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
        started_at: form.status === "reading" || form.status === "finished" ? (form.started_at || format(new Date(), "yyyy-MM-dd")) : null,
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
    mutationFn: async ({ id, status }) => {
      const updates = { status };
      if (status === "reading") updates.started_at = format(new Date(), "yyyy-MM-dd");
      if (status === "finished") updates.finished_at = format(new Date(), "yyyy-MM-dd");
      const { error } = await supabase.from("reading_log").update(updates).eq("id", id).eq("created_by", user.id);
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
  });

  const openEdit = (book) => {
    setForm({ title: book.title, author: book.author || "", category: book.category || "other", status: book.status, rating: book.rating || 0, notes: book.notes || "" });
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
          <p className="text-xs text-slate-500">{books.filter(b => b.status === "finished").length} finished · {currentlyReading.length} in progress</p>
        </div>
        <Button variant="volt" size="sm" onClick={() => { resetForm(); setEditing(null); setShowAdd(true); }} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Book
        </Button>
      </div>

      {currentlyReading.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">Currently Reading</h3>
          <div className="space-y-3">
            {currentlyReading.map(book => <BookCard key={book.id} book={book} onEdit={openEdit} onDelete={del.mutate} onStatusChange={updateStatus.mutate} />)}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">All Books</h3>
          <div className="space-y-3">
            {[...rest].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)).map(book => (
              <BookCard key={book.id} book={book} onEdit={openEdit} onDelete={del.mutate} onStatusChange={updateStatus.mutate} />
            ))}
          </div>
        </div>
      )}

      {books.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-charcoal-border rounded-2xl">
          <BookOpen className="w-8 h-8 text-slate-800 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No books yet.</p>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); setEditing(null); resetForm(); } }}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader><DialogTitle className="text-white">{editing ? "Edit Book" : "Add Book"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">Title</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Book title" className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">Author</Label>
              <Input value={form.author} onChange={e => setForm(p => ({ ...p, author: e.target.value }))} placeholder="Author" className="h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400 mb-1.5 block">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["technical","business","philosophy","other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400 mb-1.5 block">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">Rating</Label>
              <StarRating value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">Notes</Label>
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
    <div className="p-4 rounded-xl bg-charcoal-surface border border-charcoal-border group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{book.title}</p>
          {book.author && <p className="text-xs text-slate-500">{book.author}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(book)} className="p-1 text-slate-500 hover:text-brand opacity-0 group-hover:opacity-100 transition-all">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(book.id)} className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onStatusChange({ id: book.id, status: STATUS_NEXT[book.status] })}
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${STATUS_COLORS[book.status]}`}
        >
          {STATUS_LABELS[book.status]}
        </button>
        {book.category && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CAT_COLORS[book.category] || CAT_COLORS.other}`}>
            {book.category}
          </span>
        )}
        {book.rating > 0 && <StarRating value={book.rating} readonly />}
      </div>
      {book.notes && <p className="text-xs text-slate-400 mt-2 italic border-l-2 border-charcoal-border pl-2">{book.notes}</p>}
    </div>
  );
}

// ─── Study Tab ─────────────────────────────────────────────────────────────────
function StudyTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ topic: "", duration_min: "", medium: "video", notes: "" });

  const { data: logs = [] } = useQuery({
    queryKey: ["study-log", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("study_log").select("*").eq("created_by", user.id).order("logged_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const weeklyHours = logs.filter(l => {
    const days = differenceInDays(new Date(), parseISO(l.logged_at));
    return days <= 7;
  }).reduce((s, l) => s + (l.duration_min || 0), 0) / 60;

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
  });

  return (
    <div className="space-y-6">
      <Card className="glass glass-interactive">
        <CardContent className="pt-4 px-5 pb-5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
            <Zap className="w-3 h-3" /> Log Study Session
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-charcoal-surface border border-charcoal-border text-center">
          <p className="text-2xl font-bold text-white">{weeklyHours.toFixed(1)}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">hrs this week</p>
        </div>
        <div className="p-4 rounded-xl bg-charcoal-surface border border-charcoal-border text-center">
          <p className="text-2xl font-bold text-white">{logs.length}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">total sessions</p>
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <History className="w-3 h-3" /> Recent Sessions
        </h3>
        <div className="space-y-2">
          {logs.length === 0 && (
            <div className="py-12 text-center border-2 border-dashed border-charcoal-border rounded-2xl">
              <GraduationCap className="w-7 h-7 text-slate-800 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No study sessions yet.</p>
            </div>
          )}
          {logs.map(log => (
            <div key={log.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-charcoal-surface border border-charcoal-border group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white truncate">{log.topic}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Timer className="w-3 h-3" />{log.duration_min} min
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${MEDIUM_COLORS[log.medium] || ""}`}>{log.medium}</span>
                  <span className="text-[10px] text-slate-500">{format(parseISO(log.logged_at), "MMM d")}</span>
                </div>
              </div>
              <button onClick={() => del.mutate(log.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Skills Tab ────────────────────────────────────────────────────────────────
function SkillsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", level: 3 });

  const { data: skills = [] } = useQuery({
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
  });

  const stale = skills.filter(s => {
    if (!s.last_practiced_at) return true;
    return differenceInDays(new Date(), parseISO(s.last_practiced_at)) > 14;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {stale.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-yellow-400">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {skills.map(skill => {
          const daysSince = skill.last_practiced_at ? differenceInDays(new Date(), parseISO(skill.last_practiced_at)) : null;
          const isStale = daysSince === null || daysSince > 14;
          return (
            <div key={skill.id} className={`p-4 rounded-xl border group ${isStale ? "bg-yellow-500/[3%] border-yellow-500/10" : "glass glass-interactive"}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-white">{skill.name}</p>
                  {skill.category && <p className="text-[10px] text-slate-500">{skill.category}</p>}
                </div>
                <button onClick={() => del.mutate(skill.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 mb-3">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    onClick={() => updateLevel.mutate({ id: skill.id, level: n })}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${n <= (skill.level || 0) ? "bg-brand" : "bg-slate-700"}`}
                  />
                ))}
                <span className="text-[10px] text-slate-500 ml-1">Level {skill.level || 0}/5</span>
              </div>
              <div className="flex items-center justify-between">
                {isStale ? (
                  <span className="text-[10px] text-yellow-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {daysSince === null ? "Never practiced" : `${daysSince}d ago`}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">{daysSince}d ago</span>
                )}
                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-brand hover:bg-brand/10 px-2" onClick={() => practiced.mutate(skill.id)}>
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Practiced
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {skills.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-charcoal-border rounded-2xl">
          <Layers className="w-8 h-8 text-slate-800 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No skills tracked yet.</p>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader><DialogTitle className="text-white">Add Skill</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">Skill name</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. TypeScript" className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">Category (optional)</Label>
              <Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Frontend, Machine Learning" className="h-9" />
            </div>
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">Current level</Label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    onClick={() => setForm(p => ({ ...p, level: n }))}
                    className={`w-8 h-8 rounded-full text-xs font-bold border transition-colors ${n === form.level ? "bg-brand text-black border-brand" : "bg-charcoal-elevated text-slate-500 border-charcoal-border"}`}
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
  const { data: recentLogs = [] } = useQuery({
    queryKey: ["capture-inbox", "mind"],
    queryFn: async () => {
      const { data, error } = await supabase.from("capture_inbox").select("*").eq("created_by", user.id).eq("domain", "mind").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
          <BookOpen className="w-3 h-3" /> New Learning Log
        </h2>
        <QuickCapture domain="mind" placeholder="What did you learn today? Notes on books, courses, or technical concepts..." />
        <p className="text-[10px] text-slate-500 mt-2 italic">Picked up by your desktop agent and organized into Obsidian.</p>
      </div>
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
          <History className="w-3 h-3" /> Recent Streams
        </h2>
        <div className="space-y-3">
          {recentLogs.length > 0 ? recentLogs.map(log => (
            <div key={log.id} className="p-4 rounded-xl bg-charcoal-surface border border-charcoal-border">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] text-brand font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand/5">
                  {format(parseISO(log.created_at), "MMM d, h:mm a")}
                </span>
                {log.processed && <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">Synced</span>}
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{log.content}</p>
            </div>
          )) : (
            <div className="py-12 text-center border-2 border-dashed border-charcoal-border rounded-2xl">
              <GraduationCap className="w-8 h-8 text-slate-800 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No recent learning logs.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Mind({ hideHeader }) {
  return (
    <div className={`px-4 py-6 md:px-8 bg-charcoal min-h-screen ${hideHeader ? 'pt-0 px-0 md:px-0' : ''}`}>
      <div className="max-w-3xl mx-auto">
        {!hideHeader && (
          <header className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-lg bg-brand/10">
                <Brain className="w-5 h-5 text-brand" />
              </div>
              <h1 className="text-2xl font-bold text-white">Mind & Learning</h1>
            </div>
            <p className="text-slate-400 text-sm pl-12">Track what you're reading, studying, and building.</p>
          </header>
        )}

        <Tabs defaultValue="capture">
          <TabsList className="mb-6">
            <TabsTrigger value="capture">Capture</TabsTrigger>
            <TabsTrigger value="reading">Reading</TabsTrigger>
            <TabsTrigger value="study">Study</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
          </TabsList>
          <TabsContent value="capture"><CaptureTab /></TabsContent>
          <TabsContent value="reading"><ReadingTab /></TabsContent>
          <TabsContent value="study"><StudyTab /></TabsContent>
          <TabsContent value="skills"><SkillsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
