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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase, Building2, UserPlus, History, Plus, Trash2, Pencil,
  AlertTriangle, X, ArrowRight, Calendar, ChevronRight,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";

// ─── Constants ─────────────────────────────────────────────────────────────────
const APP_STATUSES = ["applied", "screening", "interview", "offer", "rejected"];
const STATUS_COLORS = {
  applied:    "bg-carb/10 text-carb border-carb/20",
  screening:  "bg-warn/10 text-warn border-warn/20",
  interview:  "bg-gold/10 text-gold border-gold/20",
  offer:      "bg-leaf/10 text-leaf border-leaf/20",
  rejected:   "bg-bad/10 text-bad border-bad/20",
};

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

// ─── Application Form ──────────────────────────────────────────────────────────
function AppForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    company: initial?.company || "",
    role: initial?.role || "",
    date_applied: initial?.date_applied || format(new Date(), "yyyy-MM-dd"),
    status: initial?.status || "applied",
    notes: initial?.notes || "",
    next_action: initial?.next_action || "",
    next_action_date: initial?.next_action_date || "",
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs text-ink-muted mb-1.5 block">Company</Label>
          <Input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="Company name" className="h-9" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-ink-muted mb-1.5 block">Role</Label>
          <Input value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} placeholder="Job title" className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-ink-muted mb-1.5 block">Applied</Label>
          <Input type="date" value={form.date_applied} onChange={e => setForm(p => ({ ...p, date_applied: e.target.value }))} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs text-ink-muted mb-1.5 block">Status</Label>
          <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {APP_STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs text-ink-muted mb-1.5 block">Notes</Label>
        <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Recruiter name, salary range, etc." className="h-9" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs text-ink-muted mb-1.5 block">Next action</Label>
          <Input value={form.next_action} onChange={e => setForm(p => ({ ...p, next_action: e.target.value }))} placeholder="e.g. Follow up with recruiter" className="h-9" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-ink-muted mb-1.5 block">Next action date</Label>
          <Input type="date" value={form.next_action_date} onChange={e => setForm(p => ({ ...p, next_action_date: e.target.value }))} className="h-9 text-sm" />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant="volt" size="sm" className="flex-1" disabled={!form.company.trim() || !form.role.trim()} onClick={() => onSave(form)}>Save</Button>
      </div>
    </div>
  );
}

// ─── Pipeline Tab ──────────────────────────────────────────────────────────────
const ACTIVE_STATUSES = ["applied", "screening", "interview", "offer"];
const STATUS_NEXT = { applied: "screening", screening: "interview", interview: "offer" };

function PipelineTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: apps = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["job-applications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_applications").select("*").eq("created_by", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const save = useMutation({
    mutationFn: async (form) => {
      if (editing) {
        const { error } = await supabase.from("job_applications").update(form).eq("id", editing.id).eq("created_by", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("job_applications").insert({ ...form, created_by: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-applications"] });
      setShowAdd(false);
      setEditing(null);
      toast.success(editing ? "Updated" : "Application added");
    },
    onError: () => toast.error("Failed to save"),
  });

  const advance = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from("job_applications").update({ status }).eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-applications"] }),
    onError: () => toast.error("Failed to update"),
  });

  const del = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("job_applications").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-applications"] }),
    onError: () => toast.error("Failed to delete"),
  });

  const active = apps.filter(a => ACTIVE_STATUSES.includes(a.status));
  const rejected = apps.filter(a => a.status === "rejected");
  const thisWeek = apps.filter(a => {
    if (!a.date_applied) return false;
    return differenceInDays(new Date(), parseISO(a.date_applied)) <= 7;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 font-technical text-xs font-semibold text-muted-2">
          <span><span className="font-extrabold text-ink">{active.length}</span> active</span>
          <span><span className="font-extrabold text-ink">{thisWeek}</span> applied this week</span>
        </div>
        <Button variant="volt" size="sm" onClick={() => { setEditing(null); setShowAdd(true); }} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Application
        </Button>
      </div>

      <TabQueryState isLoading={isLoading} isError={isError} onRetry={refetch} />

      {/* Kanban columns */}
      {!isLoading && !isError && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ACTIVE_STATUSES.map(status => {
          const col = apps.filter(a => a.status === status);
          return (
            <div key={status} className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-[0.5px] ${STATUS_COLORS[status]}`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
                <span className="font-technical text-[10px] font-semibold text-muted-2">{col.length}</span>
              </div>
              {col.map(app => (
                <div key={app.id} className="p-3 glass glass-interactive group text-left">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-ink truncate">{app.company}</p>
                      <p className="text-[10px] font-semibold text-muted-2 truncate">{app.role}</p>
                    </div>
                    <div className="flex flex-col gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0">
                      <button onClick={() => { setEditing(app); setShowAdd(true); }} className="p-2.5 -m-1 text-muted-2 hover:text-ink">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => setConfirmDelete(app.id)} className="p-2.5 -m-1 text-muted-2 hover:text-bad">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {app.date_applied && (
                    <p className="font-technical text-[10px] font-semibold text-muted-2 mb-2">{format(parseISO(app.date_applied), "MMM d")}</p>
                  )}
                  <div className="flex gap-1">
                    {STATUS_NEXT[status] && (
                      <button
                        onClick={() => advance.mutate({ id: app.id, status: STATUS_NEXT[status] })}
                        className="text-[10px] font-bold flex items-center gap-0.5 px-1.5 -mx-1.5 py-2.5 -my-1 text-muted-2 hover:text-gold transition-colors"
                      >
                        <ArrowRight className="w-3 h-3" /> Move
                      </button>
                    )}
                    <button
                      onClick={() => advance.mutate({ id: app.id, status: "rejected" })}
                      className="text-[10px] px-2.5 -mr-1 py-2.5 -my-1 text-muted-2 hover:text-bad transition-colors ml-auto"
                    >
                      ✕
                    </button>
                  </div>
                  {app.next_action && (
                    <p className="text-[10px] font-semibold text-muted-2 mt-1.5 pt-1.5 border-t hairline truncate">{app.next_action}</p>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      )}

      {rejected.length > 0 && (
        <div>
          <h3 className="section-label mb-2">Rejected ({rejected.length})</h3>
          <div className="space-y-1.5">
            {rejected.map(app => (
              <div key={app.id} className="flex items-center gap-3 px-3 py-2 glass-inset group opacity-60">
                <span className="text-xs text-ink font-bold">{app.company}</span>
                <span className="text-[10px] font-semibold text-muted-2">{app.role}</span>
                <button onClick={() => setConfirmDelete(app.id)} className="ml-auto p-2.5 -m-2 opacity-60 md:opacity-0 md:group-hover:opacity-100 text-muted-2 hover:text-bad">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !isError && apps.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-white/10 rounded-2xl">
          <Building2 className="w-8 h-8 text-faint mx-auto mb-2" />
          <p className="text-sm font-semibold text-muted-2">No applications yet.</p>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}
        title="Delete application?"
        description="This permanently removes the application and its notes."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => { del.mutate(confirmDelete); setConfirmDelete(null); }}
      />

      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader><DialogTitle className="text-ink">{editing ? "Edit Application" : "Add Application"}</DialogTitle></DialogHeader>
          <AppForm
            initial={editing}
            onSave={(form) => save.mutate(form)}
            onClose={() => { setShowAdd(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Networking Tab ────────────────────────────────────────────────────────────
function NetworkForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    person_name: initial?.person_name || "",
    company: initial?.company || "",
    interaction_type: initial?.interaction_type || "LinkedIn",
    date: initial?.date || format(new Date(), "yyyy-MM-dd"),
    notes: initial?.notes || "",
    follow_up_date: initial?.follow_up_date || "",
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs text-ink-muted mb-1.5 block">Person</Label>
          <Input value={form.person_name} onChange={e => setForm(p => ({ ...p, person_name: e.target.value }))} placeholder="Name" className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-ink-muted mb-1.5 block">Company</Label>
          <Input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="Company" className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-ink-muted mb-1.5 block">Type</Label>
          <Input value={form.interaction_type} onChange={e => setForm(p => ({ ...p, interaction_type: e.target.value }))} placeholder="LinkedIn, Coffee chat" className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-ink-muted mb-1.5 block">Date</Label>
          <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs text-ink-muted mb-1.5 block">Follow-up by</Label>
          <Input type="date" value={form.follow_up_date} onChange={e => setForm(p => ({ ...p, follow_up_date: e.target.value }))} className="h-9 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs text-ink-muted mb-1.5 block">Notes</Label>
        <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="What was discussed, what to follow up on..." className="h-9" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant="volt" size="sm" className="flex-1" disabled={!form.person_name.trim()} onClick={() => onSave(form)}>Save</Button>
      </div>
    </div>
  );
}

function NetworkingTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: contacts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["networking-log", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("networking_log").select("*").eq("created_by", user.id).order("follow_up_date", { ascending: true, nullsLast: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const save = useMutation({
    mutationFn: async (form) => {
      if (editing) {
        const { error } = await supabase.from("networking_log").update(form).eq("id", editing.id).eq("created_by", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("networking_log").insert({ ...form, created_by: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["networking-log"] });
      setShowAdd(false);
      setEditing(null);
      toast.success(editing ? "Updated" : "Contact added");
    },
    onError: () => toast.error("Failed to save"),
  });

  const del = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("networking_log").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networking-log"] }),
    onError: () => toast.error("Failed to delete"),
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const overdue = contacts.filter(c => c.follow_up_date && c.follow_up_date < today);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {overdue.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-bad">
            <AlertTriangle className="w-3.5 h-3.5" />
            {overdue.length} follow-up{overdue.length > 1 ? "s" : ""} overdue
          </div>
        )}
        <Button variant="volt" size="sm" className="gap-1.5 ml-auto" onClick={() => { setEditing(null); setShowAdd(true); }}>
          <Plus className="w-3.5 h-3.5" /> Add Contact
        </Button>
      </div>

      <div className="space-y-3">
        <TabQueryState isLoading={isLoading} isError={isError} onRetry={refetch} />
        {!isLoading && !isError && contacts.length === 0 && (
          <div className="py-16 text-center border-2 border-dashed border-white/10 rounded-2xl">
            <UserPlus className="w-8 h-8 text-faint mx-auto mb-2" />
            <p className="text-sm font-semibold text-muted-2">No networking contacts yet.</p>
          </div>
        )}
        {contacts.map(contact => {
          const isOverdue = contact.follow_up_date && contact.follow_up_date < today;
          return (
            <div key={contact.id} className={`p-4 group ${isOverdue ? "rounded-[20px] border-[0.5px] bg-bad/[0.04] border-bad/15" : "glass glass-interactive"}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-ink">{contact.person_name}</span>
                    {contact.interaction_type && (
                      <Badge variant="outline" className="text-[10px] border-white/10 text-muted-2 bg-transparent">{contact.interaction_type}</Badge>
                    )}
                  </div>
                  {contact.company && <p className="text-xs font-semibold text-muted-2">{contact.company}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0">
                  <button onClick={() => { setEditing(contact); setShowAdd(true); }} className="p-2.5 -m-1 text-muted-2 hover:text-ink">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setConfirmDelete(contact.id)} className="p-2.5 -m-1 text-muted-2 hover:text-bad">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {contact.notes && <p className="text-xs font-semibold text-muted-2 mb-2">{contact.notes}</p>}
              <div className="flex items-center gap-3 font-technical text-[10px] font-semibold">
                {contact.date && (
                  <span className="text-muted-2">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {format(parseISO(contact.date), "MMM d")}
                  </span>
                )}
                {contact.follow_up_date && (
                  <span className={isOverdue ? "text-bad font-bold" : "text-muted-2"}>
                    {isOverdue ? <AlertTriangle className="w-3 h-3 inline mr-1" /> : <ChevronRight className="w-3 h-3 inline" />}
                    Follow up {format(parseISO(contact.follow_up_date), "MMM d")}
                    {isOverdue && ` (${differenceInDays(new Date(), parseISO(contact.follow_up_date))}d overdue)`}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}
        title="Delete contact?"
        description="This permanently removes the contact and its notes."
        confirmText="Delete"
        variant="danger"
        onConfirm={() => { del.mutate(confirmDelete); setConfirmDelete(null); }}
      />

      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader><DialogTitle className="text-ink">{editing ? "Edit Contact" : "Add Contact"}</DialogTitle></DialogHeader>
          <NetworkForm
            initial={editing}
            onSave={(form) => save.mutate(form)}
            onClose={() => { setShowAdd(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Capture Tab ───────────────────────────────────────────────────────────────
function CaptureTab() {
  const { user } = useAuth();
  const { data: recentLogs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["capture-inbox", "career", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("capture_inbox").select("*").eq("created_by", user.id).eq("domain", "career").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-label mb-4 flex items-center gap-2">
          <UserPlus className="w-3 h-3 text-gold" /> New Pipeline Event
        </h2>
        <QuickCapture domain="career" placeholder="Applied to X, interviewed with Y, or reached out to Z on LinkedIn..." />
        <p className="text-[10px] font-semibold text-muted-2 mt-2 italic">The desktop agent parses these into your career pipeline in Obsidian.</p>
      </div>
      <div>
        <h2 className="section-label mb-4 flex items-center gap-2">
          <History className="w-3 h-3" /> Recent Events
        </h2>
        <div className="space-y-3">
          <TabQueryState isLoading={isLoading} isError={isError} onRetry={refetch} />
          {recentLogs.length > 0 ? recentLogs.map(log => (
            <div key={log.id} className="glass p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-technical text-[10px] text-gold font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-[7px] bg-gold/10">
                  {format(parseISO(log.created_at), "MMM d, h:mm a")}
                </span>
                {log.processed && <span className="text-[10px] text-leaf font-bold uppercase tracking-wider">Processed</span>}
              </div>
              <p className="text-sm font-semibold text-secondary whitespace-pre-wrap leading-relaxed">{log.content}</p>
            </div>
          )) : (!isLoading && !isError && (
            <div className="py-12 text-center border-2 border-dashed border-white/10 rounded-2xl">
              <Building2 className="w-8 h-8 text-faint mx-auto mb-2" />
              <p className="text-sm font-semibold text-muted-2">No recent career events.</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Career({ hideHeader }) {
  return (
    <div className={`px-4 py-6 md:px-8 bg-charcoal min-h-screen ${hideHeader ? 'pt-0 px-0 md:px-0 min-h-0' : ''}`}>
      <div className="max-w-3xl mx-auto">
        {!hideHeader && (
          <header className="mb-6 rise-in">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 bg-gold/[0.13]">
                <Briefcase className="w-[15px] h-[15px] text-gold" />
              </div>
              <h1 className="type-display text-2xl">Career & Pipeline</h1>
            </div>
            <p className="text-muted-2 font-semibold text-sm pl-11">Track applications, networking, and job search momentum.</p>
          </header>
        )}

        <Tabs defaultValue="pipeline">
          <TabsList className="mb-6">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="networking">Networking</TabsTrigger>
            <TabsTrigger value="capture">Capture</TabsTrigger>
          </TabsList>
          <TabsContent value="pipeline"><PipelineTab /></TabsContent>
          <TabsContent value="networking"><NetworkingTab /></TabsContent>
          <TabsContent value="capture"><CaptureTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
