import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PosePillRow } from "@/components/ui/system";
import {
  AlertTriangle, ArrowLeftRight, Camera, Check,
  Loader2, Pencil, TrendingDown, TrendingUp, X,
} from "lucide-react";

const POSES = [
  { key: "front-relaxed", label: "Front relaxed",      cue: "Face the camera, arms relaxed at your sides, stand naturally. Don't suck in." },
  { key: "front-flexed",  label: "Front double biceps", cue: "Face the camera, flex both arms up, spread your lats." },
  { key: "side-chest",    label: "Side chest",          cue: "Turn to your right side, near arm across chest, brace. Same side every time." },
  { key: "abs-thighs",    label: "Abs & thighs",        cue: "Face the camera, slight ab crunch, one leg forward to show quads." },
  { key: "back-relaxed",  label: "Back relaxed",        cue: "Face away, arms relaxed at your sides, stand naturally." },
  { key: "back-flexed",   label: "Back double biceps",  cue: "Face away, flex both arms up, spread your lats." },
];
const POSE_LABEL = Object.fromEntries(POSES.map((p) => [p.key, p.label]));

export default function PhysiqueTracker({ hideHeader = false }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading: loadingEntries, isError: entriesError } = useQuery({
    queryKey: ['physique-entries', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physique_entries")
        .select("*")
        .eq("created_by", user.id)
        .order("taken_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const withUrls = await Promise.all((data ?? []).map(async (e) => {
        const { data: s } = await supabase.storage.from("physique").createSignedUrl(e.photo_path, 3600);
        return { ...e, url: s?.signedUrl };
      }));
      return withUrls;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const updatePoseMutation = useMutation({
    mutationFn: async ({ id, pose }) => {
      const { error } = await supabase
        .from("physique_entries")
        .update({ pose })
        .eq("id", id)
        .eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['physique-entries', user?.id] });
      setEditingPose(null);
    },
  });

  const fileInputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pose, setPose] = useState(POSES[0].key);
  const [filterPose, setFilterPose] = useState(null);

  // Compare
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  // Pose edit
  const [editingPose, setEditingPose] = useState(null);

  // History grid cap (avoid an unbounded scroll wall on the primary view)
  const HISTORY_CAP = 12;
  const [showAllHistory, setShowAllHistory] = useState(false);

  const toggleCompareId = (id) => {
    setCompareIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev.slice(-1), id];
      if (next.length === 2) setShowCompare(true);
      return next;
    });
  };

  const exitCompare = () => {
    setCompareMode(false);
    setCompareIds([]);
    setShowCompare(false);
  };

  const compareEntries = compareIds.map(id => entries.find(e => e.id === id)).filter(Boolean);
  const editingEntry = entries.find(e => e.id === editingPose);

  const handleFile = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !user?.id) return;
    setError(""); setBusy(true);

    try {
      const isVideo = file.type.startsWith("video/");
      const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;

      setStatus("Uploading…");
      const { error: upErr } = await supabase.storage
        .from("physique").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      setStatus(isVideo ? "Saving…" : "Analyzing physique…");
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-physique", {
        body: { path, media_type: isVideo ? "video" : "photo", pose },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      setStatus("");
      await queryClient.invalidateQueries({ queryKey: ['physique-entries', user?.id] });
    } catch (e) {
      setError(e.message || String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const latest = entries.find((e) => e.bodyfat_estimate != null);
  const prev   = entries.filter((e) => e.bodyfat_estimate != null && e.pose === latest?.pose)[1];
  const delta  = latest && prev ? (latest.bodyfat_estimate - prev.bodyfat_estimate) : null;

  const filteredEntries = entries.filter((e) => !filterPose || e.pose === filterPose);
  const visibleEntries = showAllHistory ? filteredEntries : filteredEntries.slice(0, HISTORY_CAP);

  return (
    <div className={`px-4 py-6 md:px-8 bg-charcoal min-h-screen ${hideHeader ? "pt-0 px-0 md:px-0 min-h-0" : ""}`}>
      <div className="max-w-3xl mx-auto">
        {!hideHeader && (
          <h1 className="hidden lg:block type-display text-[22px] mb-1 rise-in">Physique</h1>
        )}
        {/* One instructional voice: the static "track the trend" guidance lives
            here as the page subtitle (muted); the pose cue below is the only
            per-shot instruction, at one ink level. */}
        <p className="text-xs font-semibold text-muted-2 mb-4">
          Track the trend — same pose, lighting and distance each time.
        </p>

        {/* Pose picker */}
        <div className="section-label mb-2">Pose for this shot</div>
        <PosePillRow
          variant="solid"
          value={pose}
          onChange={setPose}
          disabled={busy}
          className="mb-2 [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]"
          options={POSES.map((p) => ({ value: p.key, label: p.label }))}
        />
        <p className="text-xs font-semibold text-secondary mb-4">
          {POSES.find((p) => p.key === pose)?.cue}
        </p>

        {/* Upload */}
        <label className="block">
          <input ref={fileInputRef} type="file" accept="image/*,video/*"
                 className="hidden" onChange={handleFile} disabled={busy} />
          <Button asChild variant="volt" size="lg" className="w-full" disabled={busy}>
            <span className="flex items-center justify-center gap-2 cursor-pointer">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {busy ? (status || "Working…") : `Upload ${POSE_LABEL[pose]} shot`}
            </span>
          </Button>
        </label>

        {error && (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-bad">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {/* Latest analysis */}
        {latest?.analysis && (
          <div className="mt-5">
            <div className="section-label mb-2">Latest</div>
            <div className="glass px-4 pt-4 pb-4 rise-in">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-technical text-2xl font-extrabold text-ink">
                  {latest.bodyfat_estimate}% <span className="text-sm font-semibold text-muted-2">est. BF</span>
                </div>
                <div className="font-technical text-xs font-semibold text-muted-2">
                  {latest.analysis.bodyfat_range} · confidence {latest.confidence ?? "—"} · {format(parseISO(latest.taken_at), 'MMM d, yyyy')}
                </div>
              </div>
              {delta != null && (
                <div className={`flex items-center gap-1 font-technical text-sm font-extrabold ${delta <= 0 ? "text-teal" : "text-warn"}`}>
                  {delta > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                </div>
              )}
            </div>
            {latest.analysis.assessment && (
              <p className="mt-2 text-sm font-semibold text-secondary line-clamp-2">{latest.analysis.assessment}</p>
            )}
            {Array.isArray(latest.analysis.focus_areas) && latest.analysis.focus_areas.length > 0 && (
              <div className="mt-2.5">
                <div className="section-label mb-1.5">Focus</div>
                <div className="flex flex-wrap gap-1.5">
                  {latest.analysis.focus_areas.map((area) => (
                    <span key={area} className="pill-value pill-value--sm font-semibold">{area}</span>
                  ))}
                </div>
              </div>
            )}
            {latest.analysis.vs_lean_goal && (
              <p className="mt-1 text-xs font-semibold text-muted-2">
                <span>At a leaner BF: </span>{latest.analysis.vs_lean_goal}
              </p>
            )}
            </div>
          </div>
        )}

        {/* History */}
        {loadingEntries ? (
          <div className="mt-6">
            <div className="section-label mb-2">History</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="glass-inset h-48 sm:h-44 animate-pulse" />
              ))}
            </div>
          </div>
        ) : entriesError ? (
          <div className="mt-6 py-8 text-center glass-inset">
            <p className="text-sm font-semibold text-bad">Could not load history.</p>
            <p className="text-xs font-semibold text-faint mt-1">Check your connection and try again.</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-6 py-8 px-4 text-center glass-inset flex flex-col items-center">
            <Camera className="w-7 h-7 text-muted-2 mb-3" />
            <p className="text-sm font-semibold text-muted-2">No shots yet.</p>
            <p className="text-xs font-semibold text-faint mt-1">Use the button above to upload your first photo.</p>
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="section-label">History</div>
              <div className="flex items-center gap-2">
                {compareMode ? (
                  <>
                    <span className="text-[11px] font-semibold text-muted-2">
                      {compareIds.length === 0 ? "Pick 2 photos" : compareIds.length === 1 ? "Pick 1 more" : ""}
                    </span>
                    {compareIds.length === 2 && (
                      <Button variant="outline" size="sm" className="min-h-[44px] text-xs" onClick={() => setShowCompare(true)}>
                        Compare
                      </Button>
                    )}
                    <button onClick={exitCompare} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setCompareMode(true)}
                    className="flex items-center gap-1.5 min-h-[44px] text-[11px] font-bold text-muted-2 hover:text-ink transition-colors px-3 py-1 rounded-md hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Compare
                  </button>
                )}
              </div>
            </div>

            {/* Pose filter — quieter chips so a filter never competes with the selector */}
            <PosePillRow
              variant="chip"
              value={filterPose}
              onChange={setFilterPose}
              className="mb-3"
              options={[
                { value: null, label: "All" },
                ...POSES.map((p) => ({ value: p.key, label: p.label })),
              ]}
            />

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {visibleEntries.map((e, i) => {
                const isSelected = compareIds.includes(e.id);
                return (
                  <div
                    key={e.id}
                    className="group relative glass-inset tile tile-interactive overflow-hidden active:opacity-90 rise-in"
                    style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
                  >
                    {/* Image */}
                    {e.url && e.media_type === "photo"
                      ? <img src={e.url} alt={format(parseISO(e.taken_at), 'MMM d, yyyy')} className="w-full h-48 sm:h-44 object-cover" />
                      : <div className="w-full h-48 sm:h-44 flex items-center justify-center text-faint text-xs font-semibold">video</div>
                    }

                    {/* Compare mode tap overlay */}
                    {compareMode && (
                      <button
                        onClick={() => toggleCompareId(e.id)}
                        className="absolute inset-0 z-10"
                        aria-label={isSelected ? "Deselect" : "Select for comparison"}
                      >
                        <div className={`absolute inset-0 transition-colors ${isSelected ? "bg-brand/30" : "hover:bg-[var(--glass-bg)]"}`} />
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand flex items-center justify-center">
                            <Check className="w-3 h-3 text-[var(--color-action-dark)]" />
                          </div>
                        )}
                      </button>
                    )}

                    {/* Edit pencil — a glass-elevated chip so it reads over any
                        photo without an ad-hoc drop-shadow. 44px tap target. */}
                    {!compareMode && (
                      <button
                        onClick={() => setEditingPose(e.id)}
                        className="absolute top-1.5 right-1.5 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center text-secondary hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-full"
                        aria-label="Fix pose"
                      >
                        <span className="glass-elevated h-8 w-8 rounded-full flex items-center justify-center">
                          <Pencil className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    )}

                    {/* Card footer */}
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-2">
                      {e.pose && <div className="truncate">{POSE_LABEL[e.pose] || e.pose}</div>}
                      <div className="flex justify-between font-technical">
                        <span>{format(parseISO(e.taken_at), 'MMM d, yyyy')}</span>
                        {e.bodyfat_estimate != null && <span className="font-extrabold text-ink">{e.bodyfat_estimate}%</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!showAllHistory && filteredEntries.length > HISTORY_CAP && (
              <button
                onClick={() => setShowAllHistory(true)}
                className="mt-3 w-full min-h-[44px] rounded-md text-xs font-bold text-muted-2 hover:text-ink border-[0.5px] border-charcoal-border bg-[var(--glass-inset-bg)] hover:bg-[var(--glass-bg)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Show all {filteredEntries.length}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Thumb-zone upload — a floating coral action pinned within the safe
          area, above the dock, so the primary action is reachable after the
          fold (the inline CTA above sits in the upper third). Re-triggers the
          same file input. Hidden while an overlay owns the screen or while a
          shot is processing. */}
      {entries.length > 0 && !showCompare && !editingEntry && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          aria-label={`Upload ${POSE_LABEL[pose]} shot`}
          className="fixed right-4 z-40 h-14 w-14 rounded-full cta-coral !p-0 disabled:opacity-60 rise-in"
          style={{ bottom: 'calc(var(--dock-clearance) + env(safe-area-inset-bottom))' }}
        >
          {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
        </button>
      )}

      {/* Side-by-side comparison — bottom sheet on mobile */}
      <Dialog open={showCompare && compareEntries.length === 2} onOpenChange={setShowCompare}>
        <DialogContent className="max-w-3xl">
          {(() => {
            const hasDelta = compareEntries[0]?.bodyfat_estimate != null && compareEntries[1]?.bodyfat_estimate != null;
            const newer = compareEntries.length === 2 && parseISO(compareEntries[0].taken_at) > parseISO(compareEntries[1].taken_at) ? compareEntries[0] : compareEntries[1];
            const older = newer === compareEntries[0] ? compareEntries[1] : compareEntries[0];
            const change = hasDelta ? newer.bodyfat_estimate - older.bodyfat_estimate : null;
            return (
              <div className="mb-4">
                <h2 className="type-display text-lg">Side by side</h2>
                {hasDelta && (
                  <>
                    {/* Delta sized below the title so the title stays the loudest
                        element; the date earns its own muted label line. */}
                    <div className={`mt-1 font-technical text-xl font-extrabold ${change <= 0 ? "text-teal" : "text-warn"}`}>
                      {change > 0 ? "+" : ""}{change.toFixed(1)}%
                    </div>
                    <div className="section-label mt-0.5">since {format(parseISO(older.taken_at), 'MMM d, yyyy')}</div>
                  </>
                )}
              </div>
            );
          })()}
          {/* Photos are the feature — go single column / large on mobile and only
              split into two columns at md+. Cap at ~58vh so a portrait shot still
              reads full-height on a phone. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {compareEntries.map(e => (
              <div key={e.id}>
                {e.url && e.media_type === "photo"
                  ? <img src={e.url} alt={`Physique photo from ${format(parseISO(e.taken_at), 'MMM d, yyyy')}`} className="w-full rounded-lg object-contain" style={{ maxHeight: "58vh" }} />
                  : <div className="w-full h-48 flex items-center justify-center glass-inset rounded-lg text-muted-2 text-sm font-semibold">video</div>
                }
                <div className="mt-2.5 space-y-1">
                  <div className="section-label">{POSE_LABEL[e.pose] || e.pose || "—"}</div>
                  <div className="font-technical text-xs text-faint">{format(parseISO(e.taken_at), 'MMM d, yyyy')}</div>
                  {e.bodyfat_estimate != null && (
                    <div className="font-technical text-2xl font-extrabold text-ink">{e.bodyfat_estimate}% <span className="text-sm font-semibold text-muted-2">est. BF</span></div>
                  )}
                  {e.analysis?.assessment && (
                    <p className="text-xs font-semibold text-secondary pt-1 line-clamp-2">{e.analysis.assessment}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fix pose — bottom sheet on mobile */}
      <Dialog open={!!editingEntry} onOpenChange={(o) => { if (!o) setEditingPose(null); }}>
        <DialogContent>
          <div className="section-label mb-3">Fix pose</div>
          <div className="flex flex-col gap-1.5">
            {POSES.map(p => (
              <button
                key={p.key}
                disabled={updatePoseMutation.isPending}
                onClick={() => updatePoseMutation.mutate({ id: editingEntry.id, pose: p.key })}
                className={`text-left px-3 min-h-[44px] rounded-md text-sm font-bold transition-colors flex items-center gap-2 ${
                  editingEntry?.pose === p.key
                    ? "bg-brand/15 text-brand"
                    : "text-ink hover:bg-white/[0.06]"
                }`}
              >
                {editingEntry?.pose === p.key && <Check className="w-4 h-4 shrink-0" />}
                {p.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
