// Coach office hours — upload a clip of a lift, get an AI form critique.
// Critiques persist in form_reviews (RLS-scoped to the owner) so past reviews
// survive a reload. New reviews refetch the history list.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle, Check, Film, History, Loader2, Upload, X,
} from "lucide-react";

const RATING_COLOR = (r) =>
  r >= 8 ? "text-good" : r >= 5 ? "text-warn" : "text-bad";

// Gemini inline_data caps the whole request near 20MB and base64 inflates the
// payload ~33%, so reject clips over ~14MB before uploading rather than letting
// the edge function fail opaquely on the inline-request cap.
// FUTURE: long clips should go through the Gemini Files API (resumable upload +
// file reference) instead of inlining, which lifts this cap.
const MAX_BYTES = 14 * 1024 * 1024;

export default function Coach() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [pending, setPending] = useState(null); // { file, previewUrl }
  const [exercise, setExercise] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [critique, setCritique] = useState(null);

  // A past review re-opened from history, with a fresh signed clip URL.
  const [openReview, setOpenReview] = useState(null); // { review, url }

  const { data: reviews = [], isLoading: loadingReviews } = useQuery({
    queryKey: ["form-reviews", user?.id],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("form_reviews")
        .select("*")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (qErr) throw qErr;
      return data ?? [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const pickFile = (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("Pick a video clip."); return; }
    if (file.size > MAX_BYTES) {
      setError("That clip is too big. Trim to a few reps, or keep clips under 14MB.");
      return;
    }
    setError(""); setCritique(null);
    setPending((p) => {
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  };

  const reset = () => {
    setPending((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl); return null; });
    setCritique(null); setError(""); setStatus("");
  };

  const analyze = async () => {
    if (!pending || !user?.id) return;
    setError(""); setBusy(true); setCritique(null);
    try {
      const ext = (pending.file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${user.id}/form/${Date.now()}.${ext}`;

      setStatus("Uploading clip…");
      const { error: upErr } = await supabase.storage
        .from("physique").upload(path, pending.file, { contentType: pending.file.type, upsert: false });
      if (upErr) throw upErr;

      setStatus("Coach is reviewing…");
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-form", {
        body: { path, exercise, notes },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      setCritique(data.critique);
      setStatus("");
      await queryClient.invalidateQueries({ queryKey: ["form-reviews", user?.id] });
    } catch (e) {
      setError(e.message || String(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  // Re-open a past review: sign the stored clip path fresh, then show it.
  const reopenReview = async (review) => {
    setOpenReview({ review, url: null });
    const { data: s } = await supabase.storage
      .from("physique").createSignedUrl(review.clip_path, 3600);
    setOpenReview({ review, url: s?.signedUrl ?? null });
  };

  return (
    <div className="px-4 py-6 md:px-8 bg-charcoal min-h-screen">
      <div className="max-w-3xl mx-auto">
        <h1 className="hidden lg:block type-display text-[22px] mb-1 rise-in">Coach office hours</h1>
        <p className="text-xs text-muted-2 mb-4">
          Upload a few reps and get a form critique. Best on a side view of squat,
          deadlift, or bench. A single angle can't see depth or load, so treat it as a second set of eyes.
        </p>

        <input ref={fileInputRef} type="file" accept="video/*"
               className="hidden" onChange={pickFile} disabled={busy} />

        {/* Setup panel */}
        <div className="glass px-4 pt-4 pb-4 rise-in">
          <div className="section-label mb-2">The lift</div>
          <input
            type="text" value={exercise} onChange={(e) => setExercise(e.target.value)}
            placeholder="e.g. Back squat, conventional deadlift"
            disabled={busy}
            className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-white/25"
          />
          <div className="section-label mb-2">What to look at (optional)</div>
          <input
            type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Knees cave on the way up?"
            disabled={busy}
            className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-white/25"
          />

          {!pending ? (
            <Button onClick={() => fileInputRef.current?.click()} disabled={busy} className="w-full">
              <Upload className="w-4 h-4 mr-2" /> Choose clip
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-black/40">
                <video src={pending.previewUrl} controls playsInline className="w-full max-h-72 object-contain" />
                <button onClick={reset} disabled={busy}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-2">
                <Film className="w-3.5 h-3.5" /> {pending.file.name}
              </div>
              <Button onClick={analyze} disabled={busy} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {busy ? (status || "Working…") : "Get critique"}
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-1.5 text-xs text-bad">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {critique && <Critique c={critique} />}

        {/* Past reviews */}
        {!loadingReviews && reviews.length > 0 && (
          <div className="mt-6">
            <div className="section-label mb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Past reviews
            </div>
            <div className="space-y-2">
              {reviews.map((r) => (
                <button
                  key={r.id}
                  onClick={() => reopenReview(r)}
                  className="w-full text-left glass-inset rounded-lg px-3 min-h-[44px] py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--glass-bg)] transition-colors active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {r.exercise || r.result?.exercise || "Form review"}
                    </div>
                    <div className="text-[11px] font-semibold text-muted-2">
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                    </div>
                  </div>
                  {typeof r.result?.rating === "number" && (
                    <div className={`type-display text-lg shrink-0 ${RATING_COLOR(r.result.rating)}`}>
                      {r.result.rating}<span className="text-xs text-muted-2">/10</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Re-opened past review — bottom sheet on mobile */}
      <Dialog open={!!openReview} onOpenChange={(o) => { if (!o) setOpenReview(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {openReview?.review.exercise || openReview?.review.result?.exercise || "Form review"}
            </DialogTitle>
          </DialogHeader>
          {openReview && (
            <div className="space-y-4">
              {openReview.url
                ? <video src={openReview.url} controls playsInline className="w-full rounded-lg bg-black/40 object-contain" style={{ maxHeight: "42vh" }} />
                : <div className="w-full h-40 flex items-center justify-center glass-inset rounded-lg text-muted-2 text-sm font-semibold gap-1.5">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading clip…
                  </div>
              }
              {openReview.review.result && <Critique c={openReview.review.result} embedded />}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Critique({ c, embedded = false }) {
  return (
    <div className={embedded ? "space-y-4" : "glass px-4 py-4 mt-4 rise-in space-y-4"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-label mb-1">{c.exercise || "Form review"}</div>
          <p className="text-sm text-secondary">{c.overall}</p>
        </div>
        {typeof c.rating === "number" && (
          <div className="text-right shrink-0">
            <div className={`type-display text-2xl ${RATING_COLOR(c.rating)}`}>{c.rating}<span className="text-sm text-muted-2">/10</span></div>
            {c.confidence && <div className="text-[10px] uppercase tracking-wide text-muted-2">{c.confidence} confidence</div>}
          </div>
        )}
      </div>

      {Array.isArray(c.safety_flags) && c.safety_flags.length > 0 && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 space-y-1">
          {c.safety_flags.map((f, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-bad">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {f}
            </div>
          ))}
        </div>
      )}

      {Array.isArray(c.fixes) && c.fixes.length > 0 && (
        <div>
          <div className="section-label mb-2">Fixes, in order</div>
          <div className="space-y-2.5">
            {c.fixes.map((f, i) => (
              <div key={i} className="rounded-lg bg-white/[0.03] px-3 py-2">
                <div className="text-sm font-semibold">{f.issue}</div>
                {f.why && <div className="text-xs text-muted-2 mt-0.5">{f.why}</div>}
                {f.cue && <div className="text-xs text-coral mt-1">Cue: {f.cue}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(c.good) && c.good.length > 0 && (
        <div>
          <div className="section-label mb-2">Working well</div>
          <div className="space-y-1">
            {c.good.map((g, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-secondary">
                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-good" /> {g}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
