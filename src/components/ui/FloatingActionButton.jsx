import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Dumbbell, Apple, Scale, PenLine, Calculator, Brain } from "lucide-react";

const actions = [
  { label: "Quick Workout", icon: Dumbbell, path: "/quick-workout", color: "bg-brand", iconColor: "text-black" },
  { label: "Log Food", icon: Apple, path: "/food-tracker?addFood=true", color: "bg-[rgba(34,197,94,0.1)]", iconColor: "text-white" },
  { label: "Weigh In", icon: Scale, action: "weighIn", color: "bg-[rgba(245,158,11,0.1)]", iconColor: "text-white" },
  { label: "Stream Note", icon: Brain, action: "streamNote", color: "bg-[rgba(168,85,247,0.1)]", iconColor: "text-white" },
  { label: "Create Workout", icon: PenLine, path: "/create-workout", color: "bg-brand", iconColor: "text-black" },
  { label: "Calculators", icon: Calculator, action: "calculators", color: "bg-[#333333]", iconColor: "text-white" },
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
          <div className="fixed right-4 md:bottom-[88px] md:right-6 z-50 flex flex-col items-end gap-3" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom) + 4rem)' }}>
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
                  <span className="bg-[#1a1a1a] text-[#a0a0a0] text-sm font-medium px-3 py-1.5 rounded-lg whitespace-nowrap">
                    {action.label}
                  </span>
                  <div className={`w-12 h-12 ${action.color} ${action.iconColor} rounded-full flex items-center justify-center`}>
                    <action.icon className="w-5 h-5" />
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
        className="fixed right-4 md:bottom-6 md:right-6 z-50 w-14 h-14 bg-brand text-black font-bold rounded-full shadow-xl flex items-center justify-center hover:bg-brand transition-colors"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
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
