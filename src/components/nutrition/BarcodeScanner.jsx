import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { lookupBarcode } from "@/api/openFoodFacts";
import { Button } from "@/components/ui/button";
import { X, ScanLine, Loader2, AlertTriangle, PackageSearch } from "lucide-react";

// BarcodeScanner renders its own fixed overlay (not inside Dialog) so it can
// sit above the Add Food dialog without z-index wrestling.
export default function BarcodeScanner({ open, onClose, onFoodFound, onNotFound }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [scanState, setScanState] = useState("idle"); // idle | requesting | scanning | looking_up | not_found | error
  const [errorMessage, setErrorMessage] = useState("");
  const [foundBarcode, setFoundBarcode] = useState("");

  useEffect(() => {
    if (!open) {
      stopCamera();
      setScanState("idle");
      return;
    }
    startScanning();
    return stopCamera;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = () => {
    try { controlsRef.current?.stop(); } catch {}
    controlsRef.current = null;
  };

  const startScanning = async () => {
    setScanState("requesting");
    setErrorMessage("");

    // navigator.mediaDevices is only available in secure contexts (HTTPS)
    if (!window.isSecureContext) {
      setErrorMessage("Camera requires a secure connection. Make sure you're visiting the https:// version of this page.");
      setScanState("error");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Camera not supported in this browser. Make sure iOS is up to date (14.3+) and try again.");
      setScanState("error");
      return;
    }

    // Request back camera explicitly so the OS prompts for the right one on iOS
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMessage("Camera access denied. Allow camera access in your browser settings and try again.");
      } else if (err.name === "NotFoundError") {
        setErrorMessage("No camera found on this device.");
      } else {
        setErrorMessage("Could not start camera: " + err.message);
      }
      setScanState("error");
      return;
    }

    // Attach stream to video element before ZXing starts decoding
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    setScanState("scanning");

    const reader = new BrowserMultiFormatReader();
    try {
      const controls = await reader.decodeFromVideoElement(
        videoRef.current,
        async (result, error) => {
          if (!result) return; // NotFoundException fires continuously — just ignore
          const barcode = result.getText();
          setFoundBarcode(barcode);
          setScanState("looking_up");
          controls.stop();

          // Stop tracks so the camera light turns off immediately
          stream.getTracks().forEach((t) => t.stop());

          const food = await lookupBarcode(barcode);
          if (food) {
            onFoodFound(food);
          } else {
            setScanState("not_found");
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      setErrorMessage("Scanner failed to start: " + err.message);
      setScanState("error");
      stream.getTracks().forEach((t) => t.stop());
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex flex-col bg-charcoal sheet-rise">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-charcoal/80 backdrop-blur border-b border-charcoal-border">
        <span className="text-ink font-semibold text-base">Scan Barcode</span>
        <button
          onClick={onClose}
          className="flex items-center justify-center min-h-11 min-w-11 -mr-2 text-ink/70 hover:text-ink transition-colors"
          aria-label="Close scanner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Camera feed */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          playsInline
          muted
        />

        {/* Scanning frame overlay */}
        {scanState === "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-64 h-40">
              {/* Corner brackets */}
              {[
                "top-0 left-0 border-t-4 border-l-4 rounded-tl-lg",
                "top-0 right-0 border-t-4 border-r-4 rounded-tr-lg",
                "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg",
                "bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg",
              ].map((cls, i) => (
                <div key={i} className={`absolute w-8 h-8 border-ink/80 ${cls}`} />
              ))}
              {/* Scan line — info hue reads "system active"; coral stays
                  reserved for the action buttons. Bespoke vertical sweep on the
                  single system easing instead of off-system animate-pulse. */}
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-info/70 scan-sweep" />
            </div>
          </div>
        )}

        {/* Status overlay */}
        <div className="absolute bottom-0 inset-x-0 pb-8 flex flex-col items-center gap-3">
          {scanState === "requesting" && (
            <div className="flex items-center gap-2 bg-charcoal/70 backdrop-blur border border-charcoal-border text-ink text-sm px-4 py-2 rounded-full">
              <Loader2 className="w-4 h-4 animate-spin" /> Requesting camera…
            </div>
          )}
          {scanState === "scanning" && (
            <div className="bg-charcoal/70 backdrop-blur border border-charcoal-border text-ink/80 text-xs px-4 py-2 rounded-full">
              Point camera at a barcode
            </div>
          )}
          {scanState === "looking_up" && (
            <div className="flex items-center gap-2 bg-charcoal/70 backdrop-blur border border-charcoal-border text-ink text-sm px-4 py-2 rounded-full">
              <Loader2 className="w-4 h-4 animate-spin" /> Looking up {foundBarcode}…
            </div>
          )}
          {/* Thumb-zone Cancel — reachable while the camera is live (mobile law:
              primary escape in the lower third). */}
          {(scanState === "requesting" || scanState === "scanning" || scanState === "looking_up") && (
            <Button
              variant="ghost"
              size="lg"
              onClick={onClose}
              className="min-h-[44px] px-8 backdrop-blur"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Not found state */}
      {scanState === "not_found" && (
        <div className="bg-charcoal-surface border-t border-charcoal-border p-6 flex flex-col items-center gap-3 text-center">
          <PackageSearch className="w-10 h-10 text-ink-muted" />
          <div>
            <p className="font-semibold text-ink">Product not found</p>
            <p className="text-sm text-ink-muted mt-1">Barcode: {foundBarcode}</p>
          </div>
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={() => startScanning()}>
              Try again
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => onNotFound(foundBarcode)}>
              Enter manually
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {scanState === "error" && (
        <div className="bg-charcoal-surface border-t border-charcoal-border p-6 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-10 h-10 text-bad" />
          <div>
            <p className="font-semibold text-ink">Camera unavailable</p>
            <p className="text-sm text-ink-muted mt-1">{errorMessage}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
