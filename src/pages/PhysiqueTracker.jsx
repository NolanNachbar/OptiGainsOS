import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PosePillRow } from "@/components/ui/system";
import {
  AlertTriangle, ArrowLeftRight, Camera, Check, Film,
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
  const [filterOpen, setFilterOpen] = useState(false);

  // Compare
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  // Pose edit
  const [editingPose, setEditingPose] = useState(null);

  // Upload review — file-select stages a preview; analysis only fires on confirm.
  const [pending, setPending] = useState(null); // { file, previewUrl, isVideo }

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

  // File-select only stages the chosen media for review — nothing uploads until
  // the user confirms Analyze in the review sheet.
  const handleFile = (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !user?.id) return;
    setError("");
    const isVideo = file.type.startsWith("video/");
    setPending({ file, previewUrl: URL.createObjectURL(file), isVideo });
  };

  const closeReview = () => {
    setPending((p) => {
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return null;
    });
  };

  const retakePending = () => {
    closeReview();
    fileInputRef.current?.click();
  };

  const confirmUpload = async () => {
    if (!pending || !user?.id) return;
    const { file, isVideo } = pending;
    setError(""); setBusy(true);

    try {
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
      closeReview();
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
          <h1 className="hidden lg:block type-display text-[22px] mb-4 rise-in">Physique</h1>
        )}

        {/* Hidden file input — both the empty-state CTA and the coral FAB drive it. */}
        <input ref={fileInputRef} type="file" accept="image/*,video/*"
               className="hidden" onChange={handleFile} disabled={busy} />

        {/* Pose picker — wrapped in a glass control panel so it reads as a setup
            panel for the shot, not a second tab bar trailing the nav strip. The
            coral FAB is the sole upload trigger; this panel only configures pose. */}
        <div className="glass px-4 pt-4 pb-4 mt-4 rise-in">
          <div className="section-label mb-2">Pose for this shot</div>
          <PosePillRow
            variant="solid"
            value={pose}
            onChange={setPose}
            disabled={busy}
            className="mb-2 [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]"
            options={POSES.map((p) => ({ value: p.key, label: p.label }))}
          />
          {/* One instructional voice: the per-shot pose cue is the single
              instruction line; the static "same pose/lighting" reminder rides as a
              muted tail rather than its own stacked subtitle above. */}
          <p className="text-xs font-semibold text-secondary">
            {POSES.find((p) => p.key === pose)?.cue}{" "}
            <span className="text-muted-2">Same lighting and distance each time to track the trend.</span>
          </p>
        </div>

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
                  {latest.analysis.bodyfat_range} · <span className="font-technical">confidence {latest.confidence ?? "—"}/10</span> · {format(parseISO(latest.taken_at), 'MMM d, yyyy')}
                </div>
              </div>
              {delta != null && (
                <div className={`flex items-center gap-1 font-technical text-sm font-extrabold ${delta <= 0 ? "text-ok" : "text-warn"}`}>
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
              <p className="mt-1.5 text-[11px] font-semibold text-faint">
                <span className="text-muted-2">At a leaner BF: </span>{latest.analysis.vs_lean_goal}
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
          // Fill the space below the pose panel and center the prompt so the
          // screen reads composed, not half-empty. Height = viewport minus the
          // panel/header above and the dock below.
          <div
            className="mt-6 px-4 text-center glass-inset flex flex-col items-center justify-center"
            style={{ minHeight: "calc(100vh - 360px - var(--dock-clearance))" }}
          >
            <Camera className="w-7 h-7 text-muted-2 mb-3" />
            <p className="text-sm font-semibold text-muted-2">No shots yet.</p>
            <p className="text-xs font-semibold text-faint mt-1 mb-4">Upload your first photo to start tracking.</p>
            <Button variant="volt" size="lg" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {busy ? (status || "Working…") : `Upload ${POSE_LABEL[pose]} shot`}
            </Button>
            <p className="text-[11px] font-semibold text-faint mt-4 max-w-[34ch]">
              Each shot is analyzed for estimated body fat and tracked over time so you can compare poses side by side.
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <div className="section-label mb-2">History</div>

            {/* Single inline control row above the grid: Filter (left) and Compare
                (right) share one rail so they no longer stack into two separate
                bands pushing the grid down. In compare mode this same rail hosts
                the pick-state hint + exit. */}
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                {compareMode ? (
                  <>
                    <span className="text-[11px] font-semibold text-muted-2">
                      {compareIds.length === 0 ? "Pick 2 photos" : compareIds.length === 1 ? "Pick 1 more" : "Ready"}
                    </span>
                    <div className="flex items-center gap-2">
                      {compareIds.length === 2 && (
                        <Button variant="ghost" size="sm" className="min-h-[44px] text-xs" onClick={() => setShowCompare(true)}>
                          Compare
                        </Button>
                      )}
                      <button onClick={exitCompare} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setFilterOpen((o) => !o)}
                      aria-expanded={filterOpen}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full text-[11px] font-bold border-[0.5px] border-charcoal-border bg-[var(--glass-inset-bg)] text-ink-muted hover:bg-[var(--glass-bg)] hover:text-ink active:opacity-90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 rotate-90" />
                      Filter: <span className="text-ink">{filterPose ? POSE_LABEL[filterPose] : "All"}</span>
                    </button>
                    <button
                      onClick={() => setCompareMode(true)}
                      className="flex items-center gap-1.5 min-h-[44px] text-[11px] font-bold text-muted-2 hover:text-ink transition-colors px-3 rounded-md hover:bg-[var(--glass-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Compare
                    </button>
                  </>
                )}
              </div>
              {!compareMode && filterOpen && (
                <PosePillRow
                  variant="chip"
                  value={filterPose}
                  onChange={(v) => { setFilterPose(v); setFilterOpen(false); }}
                  className="mt-2 rise-in"
                  options={[
                    { value: null, label: "All" },
                    ...POSES.map((p) => ({ value: p.key, label: p.label })),
                  ]}
                />
              )}
            </div>

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
                      : <div className="w-full h-48 sm:h-44 flex flex-col items-center justify-center gap-1.5 text-faint text-xs font-semibold">
                          <Film className="w-5 h-5" /> Video
                        </div>
                    }

                    {/* Compare mode tap overlay */}
                    {compareMode && (
                      <button
                        onClick={() => toggleCompareId(e.id)}
                        className="absolute inset-0 z-10"
                        aria-label={isSelected ? "Deselect" : "Select for comparison"}
                      >
                        {/* Selected = a neutral track-tinted wash + a 0.5px coral
                            ring (data outline, not a coral fill). The coral check
                            badge stays the single action mark. */}
                        <div className={`absolute inset-0 transition-colors ${isSelected ? "bg-track ring-[0.5px] ring-inset ring-brand" : "hover:bg-[var(--glass-bg)]"}`} />
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
                    <div className="px-2 py-1 text-[11px] font-semibold text-muted-2">
                      {e.pose && <div className="truncate">{POSE_LABEL[e.pose] || e.pose}</div>}
                      <div className="flex items-baseline justify-between gap-1 font-technical">
                        <span className="text-[11px]">{format(parseISO(e.taken_at), 'MMM d, yyyy')}</span>
                        {e.bodyfat_estimate != null && <span className="text-sm font-extrabold text-ink">{e.bodyfat_estimate}%</span>}
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
      {entries.length > 0 && !showCompare && !editingEntry && !pending && (
        <Button
          variant="volt"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          aria-label={`Upload ${POSE_LABEL[pose]} shot`}
          className="fixed right-4 z-40 h-14 w-14 !rounded-full !p-0 rise-in"
          style={{ bottom: 'calc(var(--dock-clearance) + env(safe-area-inset-bottom))' }}
        >
          {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
        </Button>
      )}

      {/* Side-by-side comparison — bottom sheet on mobile */}
      <Dialog open={showCompare && compareEntries.length === 2} onOpenChange={setShowCompare}>
        {/* Two side-by-side photos read fine within the standard sheet/dialog
            width; max-w-2xl keeps the columns from stretching wide on desktop
            while staying full-bleed on mobile (DialogContent is w-full there). */}
        <DialogContent className="max-w-2xl">
          {(() => {
            // Defensive guard: this block only has a meaningful comparison when
            // exactly two entries are resolved. A partial/empty compare state
            // (mid-selection, an id that hasn't resolved, or an exit transition
            // while Radix keeps DialogContent mounted) must never reach the
            // .pose / .taken_at access below. Degrade to nothing rendered.
            if (compareEntries.length !== 2) return null;
            const [a, b] = compareEntries;
            const hasDelta = a?.bodyfat_estimate != null && b?.bodyfat_estimate != null;
            const newer = parseISO(a?.taken_at) > parseISO(b?.taken_at) ? a : b;
            const older = newer === a ? b : a;
            const change = hasDelta ? newer.bodyfat_estimate - older.bodyfat_estimate : null;
            // A delta across two different poses isn't a like-for-like BF change,
            // so suppress the headline number and annotate instead of misleading.
            const crossPose = newer?.pose && older?.pose && newer.pose !== older.pose;
            return (
              <DialogHeader>
                <DialogTitle>Side by side</DialogTitle>
                {hasDelta && (
                  crossPose ? (
                    <div className="mt-1 text-xs font-semibold text-muted-2">
                      Cross-pose comparison — BF delta hidden. Match poses to read a trend.
                    </div>
                  ) : (
                    /* Aggregate delta is the hero datum of this sheet — sized well
                       above the per-photo figures. BF is a biometric so it rides
                       the spectrum both ways: ok = leaner, warn = gain. */
                    <div className={`hero-metric font-technical text-2xl mt-1 ${change <= 0 ? "text-ok" : "text-warn"}`}>
                      {change > 0 ? "+" : ""}{change.toFixed(1)}%
                    </div>
                  )
                )}
              </DialogHeader>
            );
          })()}
          {/* The point of this sheet is the comparison, so the two shots stay
              true side-by-side at every width (grid-cols-2 even at 390px). Cap
              the height lower (~42vh) so both columns plus the per-photo readout
              fit a phone without scrolling. */}
          <div className="grid grid-cols-2 gap-3">
            {compareEntries.length === 2 && compareEntries.map((e, i) => (
              <div key={e.id} className="rise-in" style={{ animationDelay: `${i * 0.04}s` }}>
                {e.url && e.media_type === "photo"
                  ? <img src={e.url} alt={`Physique photo from ${format(parseISO(e.taken_at), 'MMM d, yyyy')}`} className="w-full rounded-lg object-contain" style={{ maxHeight: "42vh" }} />
                  : <div className="w-full h-40 flex flex-col items-center justify-center gap-1.5 glass-inset rounded-lg text-muted-2 text-sm font-semibold">
                      <Film className="w-6 h-6" /> Video
                    </div>
                }
                <div className="mt-2.5 space-y-1">
                  <div className="section-label">{POSE_LABEL[e.pose] || e.pose || "—"}</div>
                  <div className="font-technical text-xs text-faint">{format(parseISO(e.taken_at), 'MMM d, yyyy')}</div>
                  {e.bodyfat_estimate != null && (
                    <div className="font-technical text-base font-extrabold text-ink">{e.bodyfat_estimate}% <span className="text-xs font-semibold text-muted-2">est. BF</span></div>
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
                className={`text-left px-3 min-h-[44px] rounded-md text-sm font-bold transition-colors active:opacity-90 flex items-center gap-2 ${
                  editingEntry?.pose === p.key
                    ? "bg-brand/15 text-brand"
                    : "text-ink hover:bg-[var(--glass-bg)]"
                }`}
              >
                {editingEntry?.pose === p.key && <Check className="w-4 h-4 shrink-0" />}
                {p.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload review — confirm before anything uploads. File-select only stages
          the media; Analyze (coral) commits, Retake (ghost) re-opens the picker. */}
      <Dialog open={!!pending} onOpenChange={(o) => { if (!o && !busy) closeReview(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review shot</DialogTitle>
          </DialogHeader>
          {pending && (
            <>
              <div className="rounded-lg overflow-hidden glass-inset flex items-center justify-center">
                {pending.isVideo
                  ? <div className="w-full h-56 flex flex-col items-center justify-center gap-1.5 text-muted-2 text-sm font-semibold">
                      <Film className="w-7 h-7" /> Video selected
                    </div>
                  : <img src={pending.previewUrl} alt="Selected shot to review" className="w-full object-contain" style={{ maxHeight: "48vh" }} />
                }
              </div>
              {/* Pose is editable in place — a wrong pose set on the picker above
                  is correctable here before analysis commits. */}
              <div className="mt-3">
                <div className="section-label mb-1.5">Pose</div>
                <PosePillRow
                  variant="solid"
                  value={pose}
                  onChange={setPose}
                  disabled={busy}
                  options={POSES.map((p) => ({ value: p.key, label: p.label }))}
                />
              </div>
              {error && (
                <div className="mt-3 flex items-start gap-1.5 text-xs text-bad">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                </div>
              )}
              {/* Analyze (volt) is the committed full-width action; Retake is a
                  quieter inline ghost so the two no longer read as equal weight. */}
              <div className="mt-4 flex flex-col gap-2">
                <Button variant="volt" size="lg" className="w-full" disabled={busy} onClick={confirmUpload}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {busy ? (status || "Working…") : "Analyze"}
                </Button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={retakePending}
                  className="self-center inline-flex items-center gap-1.5 min-h-[44px] px-3 text-xs font-bold text-muted-2 hover:text-ink transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md"
                >
                  <Camera className="w-3.5 h-3.5" /> Retake
                </button>
              </div>

              {/* Processing overlay — covers the sheet body during upload/analysis
                  so the staged shot can't be re-tapped while busy. */}
              {busy && (
                <div className="absolute inset-0 z-10 glass-inset rounded-lg flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-7 h-7 animate-spin text-brand" />
                  <span className="text-xs font-semibold text-secondary">{status || "Working…"}</span>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
