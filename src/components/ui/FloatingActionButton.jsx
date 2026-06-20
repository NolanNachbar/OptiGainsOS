import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Dumbbell, Apple, Scale, PenLine, Calculator, Brain } from "lucide-react";

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
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            style={{ top: "var(--layout-header-height, 56px)" }}
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Fan-out actions — positioned above the FAB */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed right-[18px] md:bottom-[88px] md:right-6 z-50 flex flex-col items-end gap-3" style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom) + 4rem)' }}>
            {actions.map((action, index) => (
              <div
                key={action.label}
                data-tutorial={action.label === 'Log Food' ? 'fab-log-food' : undefined}
              >
                <motion.button
                  initial={{ opacity: 0, scale: 0.3, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.3, y: 20 }}
                  transition={{
                    duration: 0.2,
                    delay: index * 0.05,
                    type: "spring",
                    stiffness: 300,
                    damping: 24,
                  }}
                  onClick={() => handleAction(action)}
                  className="flex items-center gap-3"
                >
                  <span className="glass-elevated text-ink text-[13px] font-medium px-3 py-1.5 rounded-lg whitespace-nowrap">
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
        className="fixed right-[18px] md:bottom-6 md:right-6 z-50 w-[52px] h-[52px] text-[var(--color-action-dark)] rounded-full shadow-energy flex items-center justify-center transition-colors bg-gradient-to-br from-[var(--brand-bright)] to-[var(--color-brand)] [box-shadow:0_8px_22px_rgba(var(--color-brand-rgb)/0.28),inset_0_1px_0_rgba(255,255,255,0.4)]"
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
        whileTap={{ scale: 0.9 }}
        data-tutorial="fab-button"
      >
        <motion.div
          animate={{ rotate: isOpen ? 135 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </motion.div>
      </motion.button>
    </>
  );
}
