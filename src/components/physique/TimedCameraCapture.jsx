import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X, RotateCcw, Timer, AlertTriangle, Loader2 } from "lucide-react";

const TIMER_OPTIONS = [3, 5, 10];

// In-app camera with a self-timer countdown — the native <input type=file
// capture> camera (used everywhere else in this app) has no timer on most
// mobile browsers, which makes solo full-body shots (phone propped up,
// nobody to press the shutter) impractical. This gives the guided physique
// session its own live camera + countdown, capturing a still frame to a File
// that feeds the same review/upload pipeline as a picked file.
export default function TimedCameraCapture({ open, onClose, onCapture, poseLabel, poseCue }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [facing, setFacing] = useState("environment"); // "environment" | "user"
  const [camState, setCamState] = useState("requesting"); // requesting | live | counting | error
  const [errorMessage, setErrorMessage] = useState("");
  const [seconds, setSeconds] = useState(5);
  const [countdown, setCountdown] = useState(null);
  const [flash, setFlash] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCamera = async () => {
    setCamState("requesting");
    setErrorMessage("");
    stopCamera();

    if (!window.isSecureContext) {
      setErrorMessage("Camera requires a secure connection (https://).");
      setCamState("error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Camera not supported in this browser.");
      setCamState("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamState("live");
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMessage("Camera access denied. Allow camera access in your browser settings and try again.");
      } else if (err.name === "NotFoundError") {
        setErrorMessage("No camera found on this device.");
      } else {
        setErrorMessage("Could not start camera: " + err.message);
      }
      setCamState("error");
    }
  };

  useEffect(() => {
    if (!open) { stopCamera(); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  const flipCamera = () => setFacing((f) => (f === "environment" ? "user" : "environment"));

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    // Draw the RAW frame (not the mirrored CSS preview) so left/right stays
    // consistent across sessions even when shooting front-facing — poses like
    // "side chest" depend on the same physical side every time.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopCamera();
      onCapture(file);
    }, "image/jpeg", 0.92);
  };

  const startCountdown = () => {
    setCamState("counting");
    setCountdown(seconds);
  };

  useEffect(() => {
    if (camState !== "counting" || countdown == null) return;
    if (countdown <= 0) { capture(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camState, countdown]);

  const cancelCountdown = () => { setCamState("live"); setCountdown(null); };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex flex-col bg-charcoal sheet-rise">
      <div className="flex items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-charcoal-surface border-b border-charcoal-border">
        <div>
          <span className="text-ink font-semibold text-base">{poseLabel || "Capture"}</span>
          {poseCue && <p className="text-xs text-ink-muted mt-0.5 max-w-[70vw]">{poseCue}</p>}
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center min-h-11 min-w-11 -mr-2 text-ink/70 hover:text-ink transition-colors"
          aria-label="Close camera"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {(camState === "requesting" || camState === "live" || camState === "counting") && (
        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
            autoPlay
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {flash && <div className="absolute inset-0 bg-white/90" />}

          {camState === "requesting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-charcoal text-center px-8">
              <Loader2 className="w-8 h-8 spin-loop text-ink-muted" />
              <p className="text-sm text-ink-muted">Requesting camera…</p>
            </div>
          )}

          {camState === "counting" && countdown != null && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="font-technical text-8xl font-extrabold text-white drop-shadow-lg">
                {countdown > 0 ? countdown : ""}
              </span>
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-0 inset-x-0 pb-8 pt-6 bg-gradient-to-t from-charcoal/90 to-transparent flex flex-col items-center gap-4">
            {camState === "live" && (
              <div className="flex items-center gap-1.5 bg-charcoal/70 backdrop-blur border border-charcoal-border rounded-full p-1">
                <Timer className="w-3.5 h-3.5 text-ink-muted ml-2" />
                {TIMER_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeconds(s)}
                    className={`min-h-[36px] px-3 rounded-full text-xs font-bold transition-colors ${
                      seconds === s ? "bg-brand text-[var(--color-action-dark)]" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-6">
              {camState === "live" && (
                <button
                  onClick={flipCamera}
                  className="flex items-center justify-center min-h-11 min-w-11 text-ink/80 hover:text-ink transition-colors"
                  aria-label="Flip camera"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}

              {camState === "live" ? (
                <Button variant="volt" size="lg" className="px-10" onClick={startCountdown}>
                  Start {seconds}s timer
                </Button>
              ) : (
                <Button variant="ghost" size="lg" className="px-10 backdrop-blur" onClick={cancelCountdown}>
                  Cancel
                </Button>
              )}

              {camState === "live" && <div className="min-h-11 min-w-11" />}
            </div>
          </div>
        </div>
      )}

      {camState === "error" && (
        <div className="flex-1 bg-charcoal-surface px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="w-10 h-10 text-ink-muted" />
          <div>
            <p className="font-semibold text-ink">Camera unavailable</p>
            <p className="text-sm text-ink-muted mt-1">{errorMessage}</p>
          </div>
          <Button variant="ghost" size="lg" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>,
    document.body
  );
}
