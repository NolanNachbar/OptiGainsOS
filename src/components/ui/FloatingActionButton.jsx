import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Dumbbell, Apple, Scale, PenLine, Calculator, Brain } from "lucide-react";

const EASE = [0.2, 0.7, 0.3, 1];

const actions = [
  { label: "Quick Workout", icon: Dumbbell, path: "/quick-workout", primary: true },
  { label: "Log Food", icon: Apple, path: "/food-tracker?addFood=true" },
  { label: "Weigh In", icon: Scale, action: "weighIn" },
  { label: "Stream Note", icon: Brain, action: "streamNote" },
  { label: "Create Workout", icon: PenLine, path: "/create-workout" },
  { label: "Calculators", icon: Calculator, action: "calculators" },
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
                style={{ bottom: "var(--floating-chrome-bottom)" }}
                role="menu"
              >
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    role="menuitem"
                    data-tutorial={action.label === "Log Food" ? "fab-log-food" : undefined}
                    onClick={() => handleAction(action)}
                    className="flex w-full items-center gap-3 min-h-[44px] px-2.5 rounded-xl text-left transition-colors duration-200 [transition-timing-function:var(--ease)] active:bg-[var(--glass-edge)]"
                  >
                    <span
                      className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                        action.primary
                          ? "bg-brand text-[var(--color-action-dark)]"
                          : "bg-[var(--glass-inset-bg)] text-ink"
                      }`}
                    >
                      <action.icon className="w-[18px] h-[18px]" strokeWidth={2} />
                    </span>
                    <span className="text-sm font-semibold text-ink">{action.label}</span>
                  </button>
                ))}
              </motion.div>
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
            {actions.map((action, index) => (
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
                  <span className="glass-elevated text-ink text-sm font-medium px-3 py-1.5 rounded-lg whitespace-nowrap">
                    {action.label}
                  </span>
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center border ${
                      action.primary
                        ? "bg-brand text-[var(--color-action-dark)] border-transparent"
                        : "glass-elevated text-brand border-charcoal-border"
                    }`}
                  >
                    <action.icon className="w-[18px] h-[18px]" strokeWidth={2} />
                  </div>
                </motion.button>
              </div>
            ))}
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
        className="fixed right-3 md:bottom-6 md:right-6 z-50 w-12 h-12 text-[var(--color-action-dark)] rounded-full flex items-center justify-center transition-colors duration-200 [transition-timing-function:var(--ease)] bg-[var(--color-brand)] [box-shadow:0_2px_8px_rgba(0,0,0,0.35)]"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
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
