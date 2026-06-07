import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, TrendingDown, AlertTriangle } from "lucide-react";

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
    if (error) { setError(error.message); return; }
    // Sign thumbnails for the private bucket.
    const withUrls = await Promise.all((data ?? []).map(async (e) => {
      const { data: s } = await supabase.storage.from("physique").createSignedUrl(e.photo_path, 600);
      return { ...e, url: s?.signedUrl };
    }));
    setEntries(withUrls);
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
  const prev   = entries.filter((e) => e.bodyfat_estimate != null)[1];
  const delta  = latest && prev ? (latest.bodyfat_estimate - prev.bodyfat_estimate) : null;

  return (
    <div className={`px-4 py-6 md:px-8 bg-charcoal min-h-screen ${hideHeader ? "pt-0 px-0 md:px-0 min-h-0" : ""}`}>
      <div className="max-w-3xl mx-auto">
        {!hideHeader && (
          <h1 className="text-xl font-semibold text-white mb-1">Physique</h1>
        )}
        <p className="text-xs text-slate-500 mb-4">
          Photo-based bodyfat is approximate — track the trend, not the exact number.
          Shoot the same poses each time, same lighting and distance.
        </p>

        {/* Pose picker — tag the shot so progress compares pose vs same pose */}
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Pose for this shot</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {POSES.map((p) => (
            <button
              key={p.key}
              onClick={() => setPose(p.key)}
              disabled={busy}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                pose === p.key
                  ? "bg-brand text-charcoal border-brand font-medium"
                  : "bg-charcoal-surface text-slate-300 border-charcoal-border hover:border-slate-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mb-4">
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
          <div className="mt-3 flex items-start gap-1.5 text-xs text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {/* Latest analysis */}
        {latest?.analysis && (
          <div className="mt-5 rounded-xl bg-charcoal-surface border border-charcoal-border p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-2xl font-technical text-white">
                  {latest.bodyfat_estimate}% <span className="text-sm text-slate-400">est. bodyfat</span>
                </div>
                <div className="text-xs text-slate-500">
                  {latest.analysis.bodyfat_range} · confidence {latest.confidence ?? "—"} · {latest.taken_at}
                </div>
              </div>
              {delta != null && (
                <div className={`flex items-center gap-1 text-sm ${delta <= 0 ? "text-[#4ade80]" : "text-yellow-400"}`}>
                  <TrendingDown className="w-4 h-4" /> {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                </div>
              )}
            </div>
            {latest.analysis.assessment && (
              <p className="mt-2 text-sm text-slate-300">{latest.analysis.assessment}</p>
            )}
            {Array.isArray(latest.analysis.focus_areas) && latest.analysis.focus_areas.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                <span className="text-slate-500">Focus: </span>{latest.analysis.focus_areas.join(", ")}
              </p>
            )}
            {latest.analysis.vs_lean_goal && (
              <p className="mt-1 text-xs text-slate-400">
                <span className="text-slate-500">At a leaner BF: </span>{latest.analysis.vs_lean_goal}
              </p>
            )}
          </div>
        )}

        {/* History grid — filter to one pose to compare like with like */}
        {entries.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">History</div>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setFilterPose(null)}
                className={`px-2 py-0.5 rounded-full text-[11px] border ${
                  filterPose === null ? "bg-slate-700 text-white border-slate-600" : "bg-charcoal-surface text-slate-400 border-charcoal-border"
                }`}
              >All</button>
              {POSES.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setFilterPose(p.key)}
                  className={`px-2 py-0.5 rounded-full text-[11px] border ${
                    filterPose === p.key ? "bg-slate-700 text-white border-slate-600" : "bg-charcoal-surface text-slate-400 border-charcoal-border"
                  }`}
                >{p.label}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {entries.filter((e) => !filterPose || e.pose === filterPose).map((e) => (
                <div key={e.id} className="rounded-lg overflow-hidden bg-charcoal-surface border border-charcoal-border">
                  {e.url && e.media_type === "photo"
                    ? <img src={e.url} alt={e.taken_at} className="w-full h-28 object-cover" />
                    : <div className="w-full h-28 flex items-center justify-center text-slate-600 text-xs">video</div>}
                  <div className="px-2 py-1 text-[10px] text-slate-400">
                    {e.pose && <div className="truncate text-slate-500">{POSE_LABEL[e.pose] || e.pose}</div>}
                    <div className="flex justify-between">
                      <span>{e.taken_at}</span>
                      {e.bodyfat_estimate != null && <span className="font-technical">{e.bodyfat_estimate}%</span>}
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
