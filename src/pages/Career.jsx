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
  Briefcase, Building2, UserPlus, History, Plus, Trash2, Pencil,
  AlertTriangle, X, ArrowRight, Calendar, ChevronRight,
} from "lucide-react";
import { format, parseISO, differenceInDays, isAfter } from "date-fns";
import { toast } from "sonner";

// ─── Constants ─────────────────────────────────────────────────────────────────
const APP_STATUSES = ["applied", "screening", "interview", "offer", "rejected"];
const STATUS_COLORS = {
  applied:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  screening:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  interview:  "bg-brand/10 text-brand border-brand/20",
  offer:      "bg-green-500/10 text-green-400 border-green-500/20",
  rejected:   "bg-red-500/10 text-red-400 border-red-500/20",
};

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
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Company</Label>
          <Input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="Company name" className="h-9" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Role</Label>
          <Input value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} placeholder="Job title" className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Applied</Label>
          <Input type="date" value={form.date_applied} onChange={e => setForm(p => ({ ...p, date_applied: e.target.value }))} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Status</Label>
          <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {APP_STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Notes</Label>
        <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Recruiter name, salary range, etc." className="h-9" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Next action</Label>
          <Input value={form.next_action} onChange={e => setForm(p => ({ ...p, next_action: e.target.value }))} placeholder="e.g. Follow up with recruiter" className="h-9" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Next action date</Label>
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

  const { data: apps = [] } = useQuery({
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
        <div className="flex items-center gap-4 text-xs text-[#555555]">
          <span><span className="font-bold text-white">{active.length}</span> active</span>
          <span><span className="font-bold text-white">{thisWeek}</span> applied this week</span>
        </div>
        <Button variant="volt" size="sm" onClick={() => { setEditing(null); setShowAdd(true); }} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Application
        </Button>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ACTIVE_STATUSES.map(status => {
          const col = apps.filter(a => a.status === status);
          return (
            <div key={status} className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_COLORS[status]}`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
                <span className="text-[10px] text-[#555555]">{col.length}</span>
              </div>
              {col.map(app => (
                <div key={app.id} className="p-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] group text-left">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{app.company}</p>
                      <p className="text-[10px] text-[#a0a0a0] truncate">{app.role}</p>
                    </div>
                    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button onClick={() => { setEditing(app); setShowAdd(true); }} className="text-[#555555] hover:text-brand">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => del.mutate(app.id)} className="text-[#555555] hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {app.date_applied && (
                    <p className="text-[10px] text-[#555555] mb-2">{format(parseISO(app.date_applied), "MMM d")}</p>
                  )}
                  <div className="flex gap-1">
                    {STATUS_NEXT[status] && (
                      <button
                        onClick={() => advance.mutate({ id: app.id, status: STATUS_NEXT[status] })}
                        className="text-[10px] flex items-center gap-0.5 text-[#555555] hover:text-brand transition-colors"
                      >
                        <ArrowRight className="w-3 h-3" /> Move
                      </button>
                    )}
                    <button
                      onClick={() => advance.mutate({ id: app.id, status: "rejected" })}
                      className="text-[10px] text-[#555555] hover:text-red-400 transition-colors ml-auto"
                    >
                      ✕
                    </button>
                  </div>
                  {app.next_action && (
                    <p className="text-[10px] text-[#a0a0a0] mt-1.5 pt-1.5 border-t border-[#2a2a2a] truncate">{app.next_action}</p>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {rejected.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#555555] mb-2">Rejected ({rejected.length})</h3>
          <div className="space-y-1.5">
            {rejected.map(app => (
              <div key={app.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] group opacity-60">
                <span className="text-xs text-white font-medium">{app.company}</span>
                <span className="text-[10px] text-[#555555]">{app.role}</span>
                <button onClick={() => del.mutate(app.id)} className="ml-auto opacity-0 group-hover:opacity-100 text-[#555555] hover:text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {apps.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-[#2a2a2a] rounded-2xl">
          <Building2 className="w-8 h-8 text-[#2a2a2a] mx-auto mb-2" />
          <p className="text-sm text-[#555555]">No applications yet.</p>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader><DialogTitle className="text-white">{editing ? "Edit Application" : "Add Application"}</DialogTitle></DialogHeader>
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
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Person</Label>
          <Input value={form.person_name} onChange={e => setForm(p => ({ ...p, person_name: e.target.value }))} placeholder="Name" className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Company</Label>
          <Input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="Company" className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Type</Label>
          <Input value={form.interaction_type} onChange={e => setForm(p => ({ ...p, interaction_type: e.target.value }))} placeholder="LinkedIn, Coffee chat" className="h-9" />
        </div>
        <div>
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Date</Label>
          <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Follow-up by</Label>
          <Input type="date" value={form.follow_up_date} onChange={e => setForm(p => ({ ...p, follow_up_date: e.target.value }))} className="h-9 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs text-[#a0a0a0] mb-1.5 block">Notes</Label>
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

  const { data: contacts = [] } = useQuery({
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
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const overdue = contacts.filter(c => c.follow_up_date && c.follow_up_date < today);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {overdue.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            {overdue.length} follow-up{overdue.length > 1 ? "s" : ""} overdue
          </div>
        )}
        <Button variant="volt" size="sm" className="gap-1.5 ml-auto" onClick={() => { setEditing(null); setShowAdd(true); }}>
          <Plus className="w-3.5 h-3.5" /> Add Contact
        </Button>
      </div>

      <div className="space-y-3">
        {contacts.length === 0 && (
          <div className="py-16 text-center border-2 border-dashed border-[#2a2a2a] rounded-2xl">
            <UserPlus className="w-8 h-8 text-[#2a2a2a] mx-auto mb-2" />
            <p className="text-sm text-[#555555]">No networking contacts yet.</p>
          </div>
        )}
        {contacts.map(contact => {
          const isOverdue = contact.follow_up_date && contact.follow_up_date < today;
          return (
            <div key={contact.id} className={`p-4 rounded-xl border group ${isOverdue ? "bg-red-500/[3%] border-red-500/15" : "glass glass-interactive"}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{contact.person_name}</span>
                    {contact.interaction_type && (
                      <Badge variant="outline" className="text-[10px] border-[#333] text-[#555555] bg-transparent">{contact.interaction_type}</Badge>
                    )}
                  </div>
                  {contact.company && <p className="text-xs text-[#555555]">{contact.company}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <button onClick={() => { setEditing(contact); setShowAdd(true); }} className="p-1 text-[#555555] hover:text-brand">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => del.mutate(contact.id)} className="p-1 text-[#555555] hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {contact.notes && <p className="text-xs text-[#a0a0a0] mb-2">{contact.notes}</p>}
              <div className="flex items-center gap-3 text-[10px]">
                {contact.date && (
                  <span className="text-[#555555]">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {format(parseISO(contact.date), "MMM d")}
                  </span>
                )}
                {contact.follow_up_date && (
                  <span className={isOverdue ? "text-red-400 font-bold" : "text-[#a0a0a0]"}>
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

      <Dialog open={showAdd} onOpenChange={(v) => { if (!v) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent className="glass glass-interactive max-w-sm">
          <DialogHeader><DialogTitle className="text-white">{editing ? "Edit Contact" : "Add Contact"}</DialogTitle></DialogHeader>
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
  const { data: recentLogs = [] } = useQuery({
    queryKey: ["capture-inbox", "career"],
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
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#555555] mb-4 flex items-center gap-2">
          <UserPlus className="w-3 h-3" /> New Pipeline Event
        </h2>
        <QuickCapture domain="career" placeholder="Applied to X, interviewed with Y, or reached out to Z on LinkedIn..." />
        <p className="text-[10px] text-[#555555] mt-2 italic">The desktop agent parses these into your career pipeline in Obsidian.</p>
      </div>
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#555555] mb-4 flex items-center gap-2">
          <History className="w-3 h-3" /> Recent Events
        </h2>
        <div className="space-y-3">
          {recentLogs.length > 0 ? recentLogs.map(log => (
            <div key={log.id} className="p-4 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a]">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/5">
                  {format(parseISO(log.created_at), "MMM d, h:mm a")}
                </span>
                {log.processed && <span className="text-[10px] text-[#4ade80] font-bold uppercase tracking-wider">Processed</span>}
              </div>
              <p className="text-sm text-[#e0e0e0] whitespace-pre-wrap leading-relaxed">{log.content}</p>
            </div>
          )) : (
            <div className="py-12 text-center border-2 border-dashed border-[#2a2a2a] rounded-2xl">
              <Building2 className="w-8 h-8 text-[#2a2a2a] mx-auto mb-2" />
              <p className="text-sm text-[#555555]">No recent career events.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function Career({ hideHeader }) {
  return (
    <div className={`px-4 py-6 md:px-8 bg-[#121212] min-h-screen ${hideHeader ? 'pt-0 px-0 md:px-0' : ''}`}>
      <div className="max-w-3xl mx-auto">
        {!hideHeader && (
          <header className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-lg bg-indigo-500/10">
                <Briefcase className="w-5 h-5 text-indigo-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Career & Pipeline</h1>
            </div>
            <p className="text-[#a0a0a0] text-sm pl-12">Track applications, networking, and job search momentum.</p>
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
