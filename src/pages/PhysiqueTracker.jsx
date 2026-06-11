import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";

// Standardized poses so progress is comparable shot-to-shot (same pose vs same
// pose). Shoot the same set each time, same lighting/distance/time of day.
export const POSES = [
  { key: "front-relaxed", label: "Front relaxed",      cue: "Face the camera, arms relaxed at your sides, stand naturally. Don't suck in." },
  { key: "front-flexed",  label: "Front double biceps", cue: "Face the camera, flex both arms up, spread your lats." },
  { key: "side-chest",    label: "Side chest",          cue: "Turn to your right side, near arm across chest, brace. Same side every time." },
  { key: "abs-thighs",    label: "Abs & thighs",        cue: "Face the camera, slight ab crunch, one leg forward to show quads." },
  { key: "back-relaxed",  label: "Back relaxed",        cue: "Face away, arms relaxed at your sides, stand naturally." },
  { key: "back-flexed",   label: "Back double biceps",  cue: "Face away, flex both arms up, spread your lats." },
];
const POSE_LABEL = Object.fromEntries(POSES.map((p) => [p.key, p.label]));

// Physique tracking: upload a photo, get an AI body-composition estimate, and
// watch the trend over time. Honest framing: photo bodyfat is approximate —
// trend and composition cues matter more than the absolute number.
export default function PhysiqueTracker({ hideHeader = false }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pose, setPose] = useState(POSES[0].key);
  const [filterPose, setFilterPose] = useState(null); // null = all

  const loadEntries = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("physique_entries")
      .select("*")
      .eq("created_by", user.id)
      .order("taken_at", { ascending: false })
      .limit(30);
    if (error) { setError(error.message); setLoadingEntries(false); return; }
    // Sign thumbnails for the private bucket.
    const withUrls = await Promise.all((data ?? []).map(async (e) => {
      const { data: s } = await supabase.storage.from("physique").createSignedUrl(e.photo_path, 3600);
      return { ...e, url: s?.signedUrl };
    }));
    setEntries(withUrls);
    setLoadingEntries(false);
  }, [user]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

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
      await loadEntries();
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

  return (
    <div className={`px-4 py-6 md:px-8 bg-charcoal min-h-screen ${hideHeader ? "pt-0 px-0 md:px-0 min-h-0" : ""}`}>
      <div className="max-w-3xl mx-auto">
        {!hideHeader && (
          <h1 className="type-display text-[22px] mb-1 rise-in">Physique</h1>
        )}
        <p className="text-xs font-semibold text-muted-2 mb-4">
          Photo-based bodyfat is approximate — track the trend, not the exact number.
          Shoot the same poses each time, same lighting and distance.
        </p>

        {/* Pose picker — tag the shot so progress compares pose vs same pose */}
        <div className="section-label mb-2">Pose for this shot</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {POSES.map((p) => (
            <button
              key={p.key}
              onClick={() => setPose(p.key)}
              disabled={busy}
              className={`px-2.5 py-1 rounded-full text-xs font-bold border-[0.5px] transition-colors ${
                pose === p.key
                  ? "bg-brand/15 text-brand border-brand/30"
                  : "bg-white/[0.04] text-secondary border-white/10 hover:bg-white/[0.07]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold text-muted-2 mb-4">
          {POSES.find((p) => p.key === pose)?.cue}
        </p>

        {/* Upload */}
        <label className="block">
          <input type="file" accept="image/*,video/*"
                 className="hidden" onChange={handleFile} disabled={busy} />
          <Button asChild variant="volt" className="w-full" disabled={busy}>
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
          <div className="mt-5 glass px-4 pt-4 pb-4 rise-in">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-technical text-2xl font-extrabold text-ink">
                  {latest.bodyfat_estimate}% <span className="text-sm font-semibold text-muted-2">est. bodyfat</span>
                </div>
                <div className="font-technical text-xs font-semibold text-muted-2">
                  {latest.analysis.bodyfat_range} · confidence {latest.confidence ?? "—"} · {latest.taken_at}
                </div>
              </div>
              {delta != null && (
                <div className={`flex items-center gap-1 font-technical text-sm font-extrabold ${delta <= 0 ? "text-teal" : "text-warn"}`}>
                  {delta > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                </div>
              )}
            </div>
            {latest.analysis.assessment && (
              <p className="mt-2 text-sm font-semibold text-secondary">{latest.analysis.assessment}</p>
            )}
            {Array.isArray(latest.analysis.focus_areas) && latest.analysis.focus_areas.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-muted-2">
                <span>Focus: </span>{latest.analysis.focus_areas.join(", ")}
              </p>
            )}
            {latest.analysis.vs_lean_goal && (
              <p className="mt-1 text-xs font-semibold text-muted-2">
                <span>At a leaner BF: </span>{latest.analysis.vs_lean_goal}
              </p>
            )}
          </div>
        )}

        {/* History grid — filter to one pose to compare like with like */}
        {loadingEntries ? (
          <div className="mt-6">
            <div className="section-label mb-2">History</div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass-inset h-28 animate-pulse" />
              ))}
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-6 py-8 text-center glass-inset">
            <p className="text-sm font-semibold text-muted-2">No shots yet.</p>
            <p className="text-xs font-semibold text-faint mt-1">Upload your first photo to start tracking.</p>
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="section-label">History</div>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setFilterPose(null)}
                className={`px-3 py-1.5 min-h-[32px] rounded-full text-[11px] font-bold border-[0.5px] transition-colors ${
                  filterPose === null ? "bg-white/[0.08] text-ink border-white/[0.13]" : "bg-white/[0.04] text-muted-2 border-white/10"
                }`}
              >All</button>
              {POSES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setFilterPose(p.key)}
                  className={`px-3 py-1.5 min-h-[32px] rounded-full text-[11px] font-bold border-[0.5px] transition-colors ${
                    filterPose === p.key ? "bg-white/[0.08] text-ink border-white/[0.13]" : "bg-white/[0.04] text-muted-2 border-white/10"
                  }`}
                >{p.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {entries.filter((e) => !filterPose || e.pose === filterPose).map((e) => (
                <div key={e.id} className="glass-inset overflow-hidden">
                  {e.url && e.media_type === "photo"
                    ? <img src={e.url} alt={e.taken_at} className="w-full h-28 object-cover" />
                    : <div className="w-full h-28 flex items-center justify-center text-faint text-xs font-semibold">video</div>}
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-2">
                    {e.pose && <div className="truncate">{POSE_LABEL[e.pose] || e.pose}</div>}
                    <div className="flex justify-between font-technical">
                      <span>{e.taken_at}</span>
                      {e.bodyfat_estimate != null && <span className="font-extrabold text-ink">{e.bodyfat_estimate}%</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
