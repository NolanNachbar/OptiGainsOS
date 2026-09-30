import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Dumbbell, Apple, Scale, PenLine, Calculator, Brain } from "lucide-react";

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

// QuickAddMenu — the tiered quick-add menu (mobile bottom sheet / desktop
// fan-out), fully controlled by its caller. Ledger phase 2b: this used to be
// FloatingActionButton, an uncontrolled component that also rendered its own
// fixed +/X trigger. The trigger is gone (Layout now renders the raised '+'
// itself — the tab bar's center slot on mobile, a sidebar icon on desktop) —
// this component owns only the menu body (backdrop + sheet/fan), driven by
// `open`/`onClose` from that trigger.
export default function QuickAddMenu({ open, onClose, onWeighIn, onCalculators, onStreamNote }) {
  const navigate = useNavigate();
  const handleAction = (action) => {
    onClose?.();
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
          {open && (
            <div className="md:hidden fixed inset-0 z-[10000]">
              {/* Backdrop — deep + blurred so text behind reads unreadable. */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="fixed inset-0 bg-black/85 backdrop-brightness-50"
                onClick={onClose}
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
              {/* The scrim (z-[10000]) sits above the dock's raised '+' trigger
                  (z-[9999], part of data-mobile-dock), so that trigger reads as
                  a dark silhouette under the scrim a tap can't cleanly land on.
                  Give the sheet its own visible close control at the same
                  bottom-center spot the dock's '+' occupies, above the scrim in
                  this same portal, so there's always one reachable, visible
                  close affordance right where the eye expects it. */}
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                onClick={onClose}
                aria-label="Close quick-add menu"
                // var(--floating-chrome-bottom): the dock's full painted
                // footprint + safe-area + the shared 12px breathing gap, so
                // this sits right where the raised '+' visually is.
                className="fixed left-1/2 -translate-x-1/2 z-50 w-12 h-12 text-[var(--color-action-dark)] rounded-full flex items-center justify-center bg-[var(--color-brand)] [box-shadow:0_2px_8px_rgba(0,0,0,0.35)]"
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
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="hidden md:block fixed inset-0 bg-black/40 z-40"
            style={{ top: "var(--layout-header-height, 56px)" }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
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
    </>
  );
}
