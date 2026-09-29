import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Dumbbell, Apple, Scale, PenLine, Calculator, Brain } from "lucide-react";

const EASE = [0.2, 0.7, 0.3, 1];

// Three tiers (IA.md): a prominent primary pair, a normal-weight middle tier
// (Weigh In — a daily ritual, not demoted), and a visually quieter demoted
// trio for the less-frequent utilities. `tier` drives rendering only; the
// path/action handling below is unchanged.
const actions = [
  { label: "Quick Workout", icon: Dumbbell, path: "/quick-workout", primary: true, tier: "primary" },
  { label: "Log Food", icon: Apple, path: "/food-tracker?addFood=true", primary: true, tier: "primary" },
  { label: "Weigh In", icon: Scale, action: "weighIn", tier: "mid" },
  { label: "Create Workout", icon: PenLine, path: "/create-workout", tier: "demoted" },
  { label: "Calculators", icon: Calculator, action: "calculators", tier: "demoted" },
  { label: "Stream Note", icon: Brain, action: "streamNote", tier: "demoted" },
];

export default function FloatingActionButton({ onWeighIn, onCalculators, onStreamNote }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const handleAction = (action) => {
    setIsOpen(false);
    if (action.path) {
      navigate(action.path);
    } else if (action.action === "weighIn") {
      onWeighIn?.();
    } else if (action.action === "calculators") {
      onCalculators?.();
    } else if (action.action === "streamNote") {
      onStreamNote?.();
    }
  };

  return (
    <>
      {/* ── Sub-md: one contained bottom sheet (SYS-07) ─────────────────────
          Portaled to body so its fixed scrim/sheet resolve to the viewport with
          no ancestor transform. Six actions are unified >=44px icon+label rows
          on glass-elevated, flush to the bottom inside --floating-chrome-bottom.
          The detached label-pill + separate icon circle of the old fan are
          dropped here; the md+ fan below keeps that layout. */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="md:hidden fixed inset-0 z-[10000]">
              {/* Backdrop — deep + blurred so text behind reads unreadable. */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="fixed inset-0 bg-black/85 backdrop-brightness-50"
                onClick={() => setIsOpen(false)}
              />
              {/* Contained sheet pinned flush to the bottom edge inside the
                  shared floating-chrome clearance. Rises 8px on var(--ease). */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.24, ease: EASE }}
                className="fixed left-3 right-3 z-50 glass-elevated rounded-2xl p-1.5 overflow-hidden"
                style={{ bottom: 'calc(var(--floating-chrome-bottom) + 48px + 12px)' }}
                role="menu"
              >
                {actions.map((action, index) => {
                  // A hairline rule ahead of the demoted tier's first row reads
                  // as "everything below is secondary" without needing a label.
                  const startsDemotedTier = action.tier === "demoted" && actions[index - 1]?.tier !== "demoted";
                  const demoted = action.tier === "demoted";
                  return (
                  <button
                    key={action.label}
                    type="button"
                    role="menuitem"
                    data-tutorial={action.label === "Log Food" ? "fab-log-food" : undefined}
                    onClick={() => handleAction(action)}
                    className={`flex w-full items-center gap-3 min-h-[44px] px-2.5 text-left transition-colors duration-200 [transition-timing-function:var(--ease)] active:bg-[var(--glass-edge)] rounded-xl ${
                      startsDemotedTier ? "mt-1 pt-2 border-t border-[var(--color-border)]" : ""
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded-full flex items-center justify-center ${
                        action.primary
                          ? "w-10 h-10 bg-brand text-[var(--color-action-dark)]"
                          : demoted
                            ? "w-8 h-8 bg-[var(--glass-inset-bg)] text-muted-2"
                            : "w-9 h-9 bg-[var(--glass-inset-bg)] text-ink"
                      }`}
                    >
                      <action.icon className={demoted ? "w-4 h-4" : "w-[18px] h-[18px]"} strokeWidth={2} />
                    </span>
                    <span className={
                      action.primary
                        ? "text-[15px] font-bold text-ink"
                        : demoted
                          ? "text-[13px] font-medium text-muted-2"
                          : "text-sm font-semibold text-ink"
                    }>
                      {action.label}
                    </span>
                  </button>
                  );
                })}
              </motion.div>
              {/* The sheet is raised clear of the FAB's own rect (R1-02), but the
                  scrim (z-[10000]) still sits above the FAB's own z-50, so the
                  original +/X reads as a dark silhouette a tap can't reach. Give
                  the sheet a real close control at the FAB's exact geometry,
                  above the scrim inside this same portal, so the +->X rotation
                  stays reachable while it's open. The original button is hidden
                  (not removed) via max-md:invisible below so there isn't a
                  second control sharing the same accessible name. */}
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                onClick={() => setIsOpen(false)}
                aria-label="Close quick-add menu"
                // var(--floating-chrome-bottom): was a bare `calc(5rem + safe-
                // area)` flush against the dock's ASSUMED height with zero
                // margin. SF Pro's slightly taller default line-height grew
                // the dock's actual painted height by a couple px, which was
                // enough to clip this button's bottom corner under it (a
                // probe-caught occlusion regression). The shared token adds
                // its already-designed-in 12px breathing gap, so it no longer
                // depends on the dock rendering at exactly its nominal height.
                className="fixed right-3 z-50 w-12 h-12 text-[var(--color-action-dark)] rounded-full flex items-center justify-center bg-[var(--color-brand)] [box-shadow:0_2px_8px_rgba(0,0,0,0.35)]"
                style={{ bottom: 'var(--floating-chrome-bottom)' }}
              >
                <X className="w-6 h-6" />
              </motion.button>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── md+: backdrop + fan-out (unchanged language) ─────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="hidden md:block fixed inset-0 bg-black/40 z-40"
            style={{ top: "var(--layout-header-height, 56px)" }}
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <div className="hidden md:flex fixed md:bottom-[88px] md:right-6 z-50 flex-col items-end gap-3">
            {actions.map((action, index) => {
              const demoted = action.tier === "demoted";
              return (
              <div
                key={action.label}
                data-tutorial={action.label === "Log Food" ? "fab-log-food" : undefined}
              >
                <motion.button
                  initial={{ opacity: 0, scale: 0.3, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.3, y: 8 }}
                  transition={{
                    duration: 0.2,
                    delay: index * 0.05,
                    ease: EASE,
                  }}
                  onClick={() => handleAction(action)}
                  className="flex items-center gap-3"
                >
                  <span className={`glass-elevated rounded-lg whitespace-nowrap ${
                    demoted ? "text-muted-2 text-[13px] font-medium px-2.5 py-1" : "text-ink text-sm font-medium px-3 py-1.5"
                  }`}>
                    {action.label}
                  </span>
                  <div
                    className={`rounded-full flex items-center justify-center border ${
                      action.primary
                        ? "w-11 h-11 bg-brand text-[var(--color-action-dark)] border-transparent"
                        : demoted
                          ? "w-9 h-9 glass-elevated text-muted-2 border-charcoal-border"
                          : "w-11 h-11 glass-elevated text-ink border-charcoal-border"
                    }`}
                  >
                    <action.icon className={demoted ? "w-4 h-4" : "w-[18px] h-[18px]"} strokeWidth={2} />
                  </div>
                </motion.button>
              </div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* Main FAB button — always fixed */}
      <motion.button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        // Flat-depth (Clean): a tighter directional NEUTRAL drop shadow, not a
        // brand-tinted bloom radiating on all sides. Flat solid brand fill, no
        // gradient and no inset specular. (Mirrors button.jsx's volt/coral fix.)
        //
        // Position: the page content column sits at the px-4 (16px) gutter, so a
        // FAB at the old right-[18px] with a 52px body sat directly over each
        // card's right edge during scroll. Tuck it into the gutter (right-3 =
        // 12px, hugging the viewport edge) and shrink the body to 48px so it
        // intrudes less of the content column, and tuck it lower toward the dock
        // (5rem above the dock baseline vs 6rem) so its overlap zone is minimal
        // and sits below most card content. 48px is still ≥44px tap minimum.
        className={`fixed right-3 md:bottom-6 md:right-6 z-50 w-12 h-12 text-[var(--color-action-dark)] rounded-full flex items-center justify-center transition-colors duration-200 [transition-timing-function:var(--ease)] bg-[var(--color-brand)] [box-shadow:0_2px_8px_rgba(0,0,0,0.35)] ${isOpen ? "max-md:invisible" : ""}`}
        style={{ bottom: 'var(--floating-chrome-bottom)' }}
        whileTap={{ scale: 0.9 }}
        data-tutorial="fab-button"
        aria-label={isOpen ? "Close quick-add menu" : "Quick add"}
        aria-expanded={isOpen}
        title="Quick add"
      >
        <motion.div
          animate={{ rotate: isOpen ? 135 : 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </motion.div>
      </motion.button>
    </>
  );
}
