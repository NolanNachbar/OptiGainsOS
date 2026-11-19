import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import {
  Button, Badge, Card, CardHeader, CardTitle, CardContent, PageHeader, ListRow, ReasonLine, Stat,
  EmptyState, ErrorState, Sheet, Skeleton, cn,
} from "@/components/ui";
import { PosePillRow } from "@/components/ui/system";
import PhysiqueTrendChart from "@/components/progress/PhysiqueTrendChart";
import { weeklyRate, signed, buildBfTrend } from "@/components/progress/trendMath";
import { useBodyWeightEntries } from "@/hooks/useUserQueries";
import {
  AlertTriangle, ArrowLeftRight, Camera, Check, Film,
  Loader2, Pencil, X,
} from "lucide-react";

// Pose protocol follows the coaching consensus (Legion / My PT Hub / Faarkrog):
// relaxed shots track fat change, flexed shots track muscle change, and the
// SIDE RELAXED profile is the single best fat-trend pose (waistline/lower back)
// — it was the missing one. Existing pose keys are kept so history stays intact.
const POSES = [
  { key: "front-relaxed", label: "Front relaxed",      cue: "Face the camera, arms relaxed at your sides, stand naturally. Don't suck in." },
  { key: "front-flexed",  label: "Front double biceps", cue: "Face the camera, flex both arms up, spread your lats." },
  { key: "side-relaxed",  label: "Side relaxed",        cue: "Turn to your right side, arms straight out in front (zombie arms) so your waistline stays visible. Stand natural, don't suck in." },
  { key: "side-chest",    label: "Side chest",          cue: "Turn to your right side, near arm across chest, brace. Same side every time." },
  { key: "abs-thighs",    label: "Abs & thighs",        cue: "Face the camera, exhale and flex your abs hard, one leg forward to show quads." },
  { key: "back-relaxed",  label: "Back relaxed",        cue: "Face away, arms relaxed at your sides, stand naturally." },
  { key: "back-flexed",   label: "Back double biceps",  cue: "Face away, flex both arms up, spread your lats." },
];
const POSE_LABEL = Object.fromEntries(POSES.map((p) => [p.key, p.label]));

// The Groq vision model has a low per-minute token budget shared across the
// whole account (8000 TPM) — one analysis call burns ~5800, so two uploads
// back-to-back in a batch routinely trip it. The edge function can't wait out
// the limit itself (it just forwards Groq's 429 as its own 502), so retry
// here instead of surfacing an error mid-batch. Groq's error body includes
// "try again in Ns" — honor that instead of guessing.
const RATE_LIMIT_MAX_RETRIES = 3;

async function invokeAnalyzePhysique(payload, onStatus) {
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    const { data, error } = await supabase.functions.invoke("analyze-physique", { body: payload });
    if (!error) return { data, error: null };

    let bodyText = "";
    try { bodyText = await error.context?.text?.(); } catch { /* body already consumed */ }
    const isRateLimit = /rate_limit_exceeded|Groq vision error 429/i.test(bodyText || "");
    if (!isRateLimit || attempt === RATE_LIMIT_MAX_RETRIES) {
      let message = bodyText;
      try { message = JSON.parse(bodyText)?.error || bodyText; } catch { /* not JSON */ }
      return { data: null, error: message ? new Error(message) : error };
    }

    const waitMatch = bodyText.match(/try again in ([\d.]+)s/i);
    const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 1 : 30;
    for (let s = waitSec; s > 0; s--) {
      onStatus?.(`Analysis is rate-limited. Retrying in ${s}s`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export default function PhysiqueTracker({ hideHeader = false }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { weightEntries } = useBodyWeightEntries();

  const { data: entries = [], isLoading: loadingEntries, isError: entriesError, refetch: refetchEntries } = useQuery({
    queryKey: ['physique-entries', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physique_entries")
        .select("*")
        .eq("created_by", user.id)
        // taken_at is date-granularity, so same-day uploads tie; created_at
        // breaks the tie so "Latest" tracks the most recently uploaded shot.
        .order("taken_at", { ascending: false })
        .order("created_at", { ascending: false })
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

  // Guided photo session — walks all 6 poses in order so you don't have to
  // remember which is next. `session.index` is the current pose; null = off.
  const [session, setSession] = useState(null);
  const [sessionDone, setSessionDone] = useState(false);

  const startSession = () => {
    setSessionDone(false);
    setSession({ index: 0 });
    setPose(POSES[0].key);
  };
  const endSession = () => setSession(null);

  // Compare
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  // Pose edit
  const [editingPose, setEditingPose] = useState(null);

  // Upload review — file-select stages a preview; analysis only fires on confirm.
  const [pending, setPending] = useState(null); // { file, previewUrl, isVideo, path, suggestedPose }
  // Bulk upload: extra staged shots waiting behind `pending`, plus the batch
  // size so the review sheet can read "Shot 2 of 6". Poses are auto-suggested
  // in guided-session order and stay editable per shot in the sheet.
  const [uploadQueue, setUploadQueue] = useState([]);
  const [batchTotal, setBatchTotal] = useState(0);

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
  // the user confirms Analyze in the review sheet. Multi-select stages a QUEUE:
  // the sheet steps through the shots one by one (check-in mornings are 6+
  // photos, one-at-a-time re-picking was the slow part), auto-suggesting poses
  // in guided order.
  const handleFile = (ev) => {
    const files = Array.from(ev.target.files || []);
    ev.target.value = "";
    if (!files.length || !user?.id) return;
    setError("");
    const now = Date.now();
    const items = files.map((file, i) => {
      const isVideo = file.type.startsWith("video/");
      // Stable storage path per staged shot (reused across retries), so a retry
      // after a lost response re-targets the SAME object + DB row rather than
      // inserting a duplicate that would skew the session-averaged BF. The `_i`
      // suffix keeps paths unique within one multi-select batch.
      const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase();
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo,
        path: `${user.id}/${now}_${i}.${ext}`,
        // Batch → guided pose order; single shot → whatever pose is armed.
        suggestedPose: files.length > 1 ? (POSES[i]?.key ?? POSES[POSES.length - 1].key) : pose,
      };
    });
    setPending(items[0]);
    setUploadQueue(items.slice(1));
    setBatchTotal(items.length);
    if (files.length > 1) setPose(items[0].suggestedPose);
  };

  const closeReview = () => {
    setPending((p) => {
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return null;
    });
    setUploadQueue((q) => {
      q.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setBatchTotal(0);
  };

  const retakePending = () => {
    closeReview();
    fileInputRef.current?.click();
  };

  const confirmUpload = async () => {
    if (!pending || !user?.id) return;
    const { file, isVideo, path } = pending;
    setError(""); setBusy(true);

    try {
      setStatus("Uploading");
      // upsert:true so a retry re-uploading the same stable path succeeds
      // instead of failing on "already exists".
      const { error: upErr } = await supabase.storage
        .from("physique").upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;

      setStatus(isVideo ? "Saving" : "Analyzing physique");
      const { data, error: fnErr } = await invokeAnalyzePhysique(
        // taken_at = local date so all of one evening's shots share a day (UTC
        // would split a late session across two days and mis-average it).
        { path, media_type: isVideo ? "video" : "photo", pose, taken_at: format(new Date(), "yyyy-MM-dd") },
        setStatus,
      );
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      setStatus("");
      // Batch: advance the review sheet to the next staged shot instead of
      // closing, arming its suggested pose. Last shot (or single) closes.
      if (uploadQueue.length > 0) {
        if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        const [next, ...rest] = uploadQueue;
        setPending(next);
        setUploadQueue(rest);
        setPose(next.suggestedPose);
      } else {
        closeReview();
      }
      await queryClient.invalidateQueries({ queryKey: ['physique-entries', user?.id] });

      // Guided session: advance to the next pose, or finish after the last one.
      if (session) {
        const next = session.index + 1;
        if (next < POSES.length) {
          setSession({ index: next });
          setPose(POSES[next].key);
        } else {
          setSession(null);
          setSessionDone(true);
        }
      }
    } catch (e) {
      setError(e.message || String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  // The headline BF is a SESSION reading: all of a morning's shots (same
  // taken_at date) averaged into one number, so it reflects every pose rather
  // than whichever photo was uploaded last. Per-shot estimates still show on the
  // history cards. Trend is session-over-session (this morning vs the prior one).
  const sessions = (() => {
    const byDay = new Map();
    for (const e of entries) {
      if (!byDay.has(e.taken_at)) byDay.set(e.taken_at, []);
      byDay.get(e.taken_at).push(e);
    }
    return [...byDay.entries()]
      .map(([date, es]) => {
        const ests = es.map((e) => e.bodyfat_estimate).filter((v) => v != null);
        const bf = ests.length ? ests.reduce((a, b) => a + b, 0) / ests.length : null;
        return { date, entries: es, bf, count: ests.length };
      })
      .filter((s) => s.bf != null)
      // entries are already taken_at desc, so Map preserves newest-first; sort
      // defensively in case the source order ever changes.
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  })();
  const latestSession = sessions[0] || null;
  const sessionBf = latestSession ? Math.round(latestSession.bf * 10) / 10 : null;
  // Representative entry for the qualitative read (assessment / focus / range):
  // the most recent ANALYZED PHOTO in the session. A same-day video carries a
  // stub analysis ({note}) with no bodyfat, which would blank the card, so
  // require a real bodyfat estimate too.
  const latest = latestSession?.entries.find((e) => e.bodyfat_estimate != null && e.analysis) || null;

  // Trend over raw: the headline is the smoothed BF trend plus its weekly rate.
  // Falls back to the change since the previous session until 7 days of
  // sessions exist.
  const bfTrend = buildBfTrend(sessions);
  const trendNow = bfTrend.length ? bfTrend[bfTrend.length - 1].trend : null;
  const bfRate = weeklyRate(bfTrend.map((r) => ({ date: r.date, value: r.trend })));
  const trendDeltaLabel = bfRate
    ? `${signed(bfRate.perWeek)}%/wk`
    : bfTrend.length >= 2
    ? `${signed(bfTrend[bfTrend.length - 1].trend - bfTrend[bfTrend.length - 2].trend)}% vs last session`
    : null;

  const filteredEntries = entries.filter((e) => !filterPose || e.pose === filterPose);
  const visibleEntries = showAllHistory ? filteredEntries : filteredEntries.slice(0, HISTORY_CAP);

  const captureLabel = busy
    ? (status || "Working")
    : session
    ? `Capture ${POSES[session.index].label}`
    : `Upload ${POSE_LABEL[pose]} shot`;
  const showEmptyCta = !loadingEntries && !entriesError && entries.length === 0 && !pending && !session;
  const latestDate = latestSession ? format(parseISO(latestSession.date), "MMM d") : null;

  const captureButton = (
    <Button variant="primary" size="lg" className="w-full mt-4" disabled={busy} onClick={() => fileInputRef.current?.click()}>
      {busy ? <Loader2 className="w-4 h-4 spin-loop" aria-hidden="true" /> : <Camera className="w-4 h-4" aria-hidden="true" />}
      {captureLabel}
    </Button>
  );

  return (
    <div className={cn("max-w-3xl mx-auto", hideHeader && "pt-0")}>
      {!hideHeader && (
        <PageHeader
          title="Physique"
          meta={entries.length > 0 ? `${entries.length} shots${latestDate ? `, latest session ${latestDate}` : ""}` : undefined}
        />
      )}

      {/* Hidden file input: every upload trigger drives it. `multiple` lets a
          check-in morning stage all its shots at once; the review sheet steps
          through them. */}
      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple
             className="hidden" onChange={handleFile} disabled={busy} />

      <div className="flex flex-col gap-stack">
        {/* Pose setup. Two modes: a guided session that walks every pose in order,
            or the manual picker for a one-off shot. */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>{session ? `Pose ${session.index + 1} of ${POSES.length}` : "Next shot"}</CardTitle>
            {session ? (
              <Button variant="outline" size="sm" onClick={endSession} disabled={busy}>End session</Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={startSession}>
                <Camera className="w-4 h-4" aria-hidden="true" /> Guided session
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {session ? (
              <>
                <p className="text-emph font-semibold text-ink">{POSES[session.index].label}</p>
                <p className="mt-1 text-body text-ink-secondary">{POSES[session.index].cue}</p>
                <ReasonLine className="mt-3">Same lighting and distance each time keeps the trend honest.</ReasonLine>
                <p className="mt-1 text-caption text-ink-muted">
                  Shooting solo? Use your phone camera's self-timer, then pick the shot from your library here.
                </p>
                {captureButton}
              </>
            ) : (
              <>
                <PosePillRow
                  variant="solid"
                  value={pose}
                  onChange={setPose}
                  disabled={busy}
                  className="mb-3 snap-x snap-mandatory scroll-pl-4 [&>button]:snap-start"
                  options={POSES.map((p) => ({ value: p.key, label: p.label }))}
                />
                <p className="text-body text-ink-secondary">{POSES.find((p) => p.key === pose)?.cue}</p>
                <ReasonLine className="mt-3">Same lighting and distance each time keeps the trend honest.</ReasonLine>
                {entries.length > 0 && captureButton}
                {sessionDone && (
                  <p className="mt-3 flex items-center gap-2 text-caption font-semibold text-leaf">
                    <Check className="w-4 h-4" aria-hidden="true" /> All {POSES.length} poses captured.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {error && (
          <div role="alert" className="flex items-start gap-2 px-4 text-caption text-bad">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" /> {error}
          </div>
        )}

        {/* Latest read: the smoothed BF trend is the headline; the session
            average it was built from sits in the reason line. */}
        {latest?.analysis && (
          <Card>
            <CardHeader>
              <CardTitle>Body fat</CardTitle>
            </CardHeader>
            <CardContent>
              <Stat
                label="Trend, est."
                size="md"
                value={trendNow != null ? trendNow.toFixed(1) : sessionBf}
                unit="%"
                delta={trendDeltaLabel}
                reason={`Smoothed over ${bfTrend.length} sessions. Latest ${sessionBf}% (${
                  latestSession.count > 1 ? `avg of ${latestSession.count} shots` : latest.analysis.bodyfat_range || "1 shot"
                }), ${format(parseISO(latestSession.date), "MMM d, yyyy")}`}
              />
              {latest.analysis.assessment && (
                <p className="mt-3 text-body text-ink-secondary line-clamp-2">{latest.analysis.assessment}</p>
              )}
              {Array.isArray(latest.analysis.focus_areas) && latest.analysis.focus_areas.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Focus</p>
                  <div className="flex flex-wrap gap-2">
                    {latest.analysis.focus_areas.map((area) => (
                      <Badge key={area} variant="outline">{area}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {latest.analysis.vs_lean_goal && (
                <p className="mt-3 text-caption text-ink-muted">
                  <span className="text-ink-secondary">At a leaner BF: </span>{latest.analysis.vs_lean_goal}
                </p>
              )}
              <p className="mt-3 text-caption text-ink-faint">
                Photo estimates run low in accuracy. Read the direction, not the level.
              </p>
            </CardContent>
          </Card>
        )}

        {/* BF and weight trends: the composition picture over time. */}
        {sessions.length >= 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <PhysiqueTrendChart sessions={sessions} weightEntries={weightEntries} />
            </CardContent>
          </Card>
        )}

        {/* History */}
        {loadingEntries ? (
          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="status" aria-label="Loading history">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-48 sm:h-44 rounded-control" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : entriesError ? (
          <Card>
            <ErrorState title="Could not load history" onRetry={() => refetchEntries()}>
              Check your connection and try again.
            </ErrorState>
          </Card>
        ) : entries.length === 0 ? (
          // Empty state: the upload trigger is pinned in the thumb zone at the
          // dock, so the card only carries copy and reserves that footprint.
          <div style={{ paddingBottom: "calc(var(--floating-chrome-bottom) + 60px)" }}>
            <Card>
              <EmptyState icon={Camera} title="No shots yet" progress={{ value: 0, max: 2 }}>
                Upload a shot and it gets an estimated body fat. The trend chart draws once two sessions exist.
              </EmptyState>
            </Card>
          </div>
        ) : (
          // Populated: pad the bottom by --fab-clearance so the last card and the
          // Show-all control clear the pinned chrome.
          <div style={{ paddingBottom: "var(--fab-clearance)" }}>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              {/* One control row above the grid. In compare mode the same row
                  hosts the pick-state hint and the exit. */}
              <div className="mb-3">
                <div className="flex items-center justify-between gap-2">
                  {compareMode ? (
                    <>
                      <span className="text-caption text-ink-muted">
                        {compareIds.length === 0 ? "Pick 2 photos" : compareIds.length === 1 ? "Pick 1 more" : "Ready"}
                      </span>
                      <div className="flex items-center gap-2">
                        {compareIds.length === 2 && (
                          <Button variant="secondary" size="sm" onClick={() => setShowCompare(true)}>
                            Compare
                          </Button>
                        )}
                        <button
                          onClick={exitCompare}
                          aria-label="Exit compare"
                          className="min-h-tap min-w-tap flex items-center justify-center text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-control"
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setFilterOpen((o) => !o)}
                        aria-expanded={filterOpen}
                      >
                        <ArrowLeftRight className="w-4 h-4 rotate-90" aria-hidden="true" />
                        Filter: <span className="text-ink">{filterPose ? POSE_LABEL[filterPose] : "All"}</span>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setCompareMode(true)}>
                        <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
                        Compare
                      </Button>
                    </>
                  )}
                </div>
                {!compareMode && filterOpen && (
                  <PosePillRow
                    variant="chip"
                    value={filterPose}
                    onChange={(v) => { setFilterPose(v); setFilterOpen(false); }}
                    className="mt-2"
                    options={[
                      { value: null, label: "All" },
                      ...POSES.map((p) => ({ value: p.key, label: p.label })),
                    ]}
                  />
                )}
              </div>

              {/* Same-pose timeline: with a pose filter active, the shots of that
                  pose read oldest to newest as one strip, with the analyzer's
                  latest same-pose delta underneath. */}
              {filterPose && !compareMode && (() => {
                const poseTimeline = entries
                  .filter((e) => e.pose === filterPose && e.media_type === "photo" && e.url)
                  .slice()
                  .reverse();
                if (poseTimeline.length < 2) return null;
                const latestDelta = [...poseTimeline].reverse()
                  .find((e) => e.analysis?.delta?.visual_changes)?.analysis.delta;
                return (
                  <Card variant="plain" className="mb-3 border border-charcoal-borderSoft rounded-control p-3">
                    <p className="mb-2 text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">{POSE_LABEL[filterPose]} over time</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {poseTimeline.map((e) => (
                        <div key={e.id} className="shrink-0 w-20">
                          <img
                            src={e.url}
                            alt={`${POSE_LABEL[filterPose]} on ${format(parseISO(e.taken_at), "MMM d, yyyy")}`}
                            className="w-20 h-28 object-cover rounded-control bg-charcoal-surface2"
                          />
                          <div className="mt-1 text-caption text-ink-muted tabular-nums">
                            {format(parseISO(e.taken_at), "MMM d")}
                          </div>
                          {e.bodyfat_estimate != null && (
                            <div className="text-caption font-semibold text-ink tabular-nums">{e.bodyfat_estimate}%</div>
                          )}
                        </div>
                      ))}
                    </div>
                    {latestDelta?.visual_changes && (
                      <p className="mt-2 text-caption text-ink-secondary">
                        <span className="text-ink-muted">Latest read: </span>{latestDelta.visual_changes}
                      </p>
                    )}
                  </Card>
                );
              })()}

              {/* Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {visibleEntries.map((e) => {
                  const isSelected = compareIds.includes(e.id);
                  return (
                    <div
                      key={e.id}
                      className="group relative overflow-hidden rounded-control border border-charcoal-borderSoft bg-charcoal-surface2"
                    >
                      {e.url && e.media_type === "photo"
                        ? <img src={e.url} alt={format(parseISO(e.taken_at), 'MMM d, yyyy')} className="w-full h-48 sm:h-44 object-cover" />
                        : <div className="w-full h-48 sm:h-44 flex flex-col items-center justify-center gap-2 text-caption text-ink-faint">
                            <Film className="w-5 h-5" aria-hidden="true" /> Video
                          </div>
                      }

                      {/* Compare mode tap overlay. Selected = a hairline brand ring
                          and the check badge. */}
                      {compareMode && (
                        <button
                          onClick={() => toggleCompareId(e.id)}
                          className="absolute inset-0 z-10"
                          aria-label={isSelected ? "Deselect" : "Select for comparison"}
                        >
                          <div className={cn("absolute inset-0 transition-colors duration-base", isSelected ? "bg-track ring-1 ring-inset ring-brand" : "hover:bg-charcoal-surface2")} />
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-pill bg-brand flex items-center justify-center">
                              <Check className="w-3 h-3 text-[var(--color-action-dark)]" aria-hidden="true" />
                            </div>
                          )}
                        </button>
                      )}

                      {/* Edit pencil: an elevated chip so it reads over any photo. */}
                      {!compareMode && (
                        <button
                          onClick={() => setEditingPose(e.id)}
                          className="absolute top-1 right-1 z-10 min-h-tap min-w-tap flex items-center justify-center text-ink-secondary hover:text-ink transition-colors duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-pill"
                          aria-label="Fix pose"
                        >
                          <span className="h-8 w-8 rounded-pill border border-charcoal-border bg-charcoal-elevated flex items-center justify-center">
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          </span>
                        </button>
                      )}

                      <div className="px-2 py-2 text-caption text-ink-muted">
                        {e.pose && <div className="truncate">{POSE_LABEL[e.pose] || e.pose}</div>}
                        <div className="flex items-baseline justify-between gap-1 tabular-nums">
                          <span>{format(parseISO(e.taken_at), 'MMM d, yyyy')}</span>
                          {e.bodyfat_estimate != null && <span className="text-emph font-semibold text-ink">{e.bodyfat_estimate}%</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!showAllHistory && filteredEntries.length > HISTORY_CAP && (
                <Button variant="outline" size="sm" className="mt-3 w-full min-h-tap" onClick={() => setShowAllHistory(true)}>
                  Show all {filteredEntries.length}
                </Button>
              )}
            </CardContent>
          </Card>
          </div>
        )}
      </div>

      {/* Empty-state thumb-zone upload: the one primary action on a first-run
          screen, pinned at the dock on the shared --floating-chrome-bottom
          offset. Never co-exists with the on-card button (gated on no entries). */}
      {showEmptyCta && (
        <div
          className="fixed inset-x-4 z-40 max-w-3xl mx-auto"
          style={{ bottom: "var(--floating-chrome-bottom)" }}
        >
          <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {busy ? <Loader2 className="w-4 h-4 spin-loop" aria-hidden="true" /> : <Camera className="w-4 h-4" aria-hidden="true" />}
            {captureLabel}
          </Button>
        </div>
      )}

      {/* Side-by-side comparison */}
      <Sheet
        open={showCompare && compareEntries.length === 2}
        onOpenChange={setShowCompare}
        title="Side by side"
        className="md:max-w-2xl"
      >
        {(() => {
          // Only meaningful with exactly two resolved entries; a partial
          // selection must never reach the .pose / .taken_at access below.
          if (compareEntries.length !== 2) return null;
          const [a, b] = compareEntries;
          const hasDelta = a?.bodyfat_estimate != null && b?.bodyfat_estimate != null;
          const newer = parseISO(a?.taken_at) > parseISO(b?.taken_at) ? a : b;
          const older = newer === a ? b : a;
          const change = hasDelta ? newer.bodyfat_estimate - older.bodyfat_estimate : null;
          // A delta across two different poses isn't a like-for-like BF change,
          // so suppress the number and say why.
          const crossPose = newer?.pose && older?.pose && newer.pose !== older.pose;
          return (
            <>
              {hasDelta && (
                crossPose ? (
                  <p className="mb-3 text-caption text-ink-muted">
                    Cross-pose comparison, BF change hidden. Match poses to read a trend.
                  </p>
                ) : (
                  <Stat
                    className="mb-3"
                    label="Body fat change"
                    size="md"
                    value={signed(change)}
                    unit="%"
                    reason="Newer shot minus older shot, same pose"
                  />
                )
              )}
              <div className="grid grid-cols-2 gap-3">
                {compareEntries.map((e) => (
                  <div key={e.id}>
                    {e.url && e.media_type === "photo"
                      ? <img src={e.url} alt={`Physique photo from ${format(parseISO(e.taken_at), 'MMM d, yyyy')}`} className="w-full rounded-control object-contain" style={{ maxHeight: "42vh" }} />
                      : <div className="w-full h-40 flex flex-col items-center justify-center gap-2 rounded-control border border-charcoal-borderSoft text-caption text-ink-muted">
                          <Film className="w-5 h-5" aria-hidden="true" /> Video
                        </div>
                    }
                    <div className="mt-2 flex flex-col gap-1">
                      <p className="text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">{POSE_LABEL[e.pose] || e.pose || "--"}</p>
                      <p className="text-caption text-ink-faint tabular-nums">{format(parseISO(e.taken_at), 'MMM d, yyyy')}</p>
                      {e.bodyfat_estimate != null && (
                        <p className="text-emph font-semibold text-ink tabular-nums">{e.bodyfat_estimate}% <span className="text-caption font-normal text-ink-muted">est. BF</span></p>
                      )}
                      {e.analysis?.assessment && (
                        <p className="pt-1 text-caption text-ink-secondary line-clamp-2">{e.analysis.assessment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </Sheet>

      {/* Fix pose */}
      <Sheet
        open={!!editingEntry}
        onOpenChange={(o) => { if (!o) setEditingPose(null); }}
        title="Fix pose"
      >
        <div className="-mx-4">
          {POSES.map((p) => {
            const current = editingEntry?.pose === p.key;
            return (
              <ListRow
                key={p.key}
                title={p.label}
                selected={current}
                chevron={false}
                disabled={updatePoseMutation.isPending}
                onClick={() => updatePoseMutation.mutate({ id: editingEntry.id, pose: p.key })}
                trailing={current ? <Check className="w-4 h-4 text-ink" aria-hidden="true" /> : null}
              />
            );
          })}
        </div>
      </Sheet>

      {/* Upload review: confirm before anything uploads. File-select only stages
          the media; Analyze commits, Retake re-opens the picker. */}
      <Sheet
        open={!!pending}
        onOpenChange={(o) => { if (!o && !busy) closeReview(); }}
        title={batchTotal > 1 ? `Review shot ${batchTotal - uploadQueue.length} of ${batchTotal}` : "Review shot"}
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={confirmUpload}>
              {busy ? <Loader2 className="w-4 h-4 spin-loop" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
              {busy ? (status || "Working") : "Analyze"}
            </Button>
            <Button variant="plain" size="sm" className="self-center" disabled={busy} onClick={retakePending}>
              <Camera className="w-4 h-4" aria-hidden="true" /> Retake
            </Button>
          </div>
        }
      >
        {pending && (
          <>
            <div className="rounded-control overflow-hidden border border-charcoal-borderSoft flex items-center justify-center">
              {pending.isVideo
                ? <div className="w-full h-56 flex flex-col items-center justify-center gap-2 text-body text-ink-muted">
                    <Film className="w-6 h-6" aria-hidden="true" /> Video selected
                  </div>
                : <img src={pending.previewUrl} alt="Selected shot to review" className="w-full object-contain" style={{ maxHeight: "48vh" }} />
              }
            </div>
            {/* Pose is editable in place: a wrong pose set on the picker is
                correctable here before analysis commits. */}
            <div className="mt-3">
              <p className="mb-2 text-micro font-semibold uppercase tracking-[0.08em] text-ink-muted">Pose</p>
              <PosePillRow
                variant="solid"
                value={pose}
                onChange={setPose}
                disabled={busy}
                options={POSES.map((p) => ({ value: p.key, label: p.label }))}
              />
            </div>
            {error && (
              <div role="alert" className="mt-3 flex items-start gap-2 text-caption text-bad">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" /> {error}
              </div>
            )}

            {/* Processing overlay: covers the sheet during upload and analysis
                so the staged shot can't be re-tapped while busy. */}
            {busy && (
              <div className="absolute inset-0 z-10 bg-[var(--sheet-bg)] flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 spin-loop text-ink" aria-hidden="true" />
                <span className="text-caption text-ink-secondary">{status || "Working"}</span>
              </div>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
