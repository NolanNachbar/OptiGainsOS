import { motion } from "framer-motion";

export default function TutorialSpotlight({ targetRect, padding = 12 }) {
  if (!targetRect) return null;

  const { top, left, width, height } = targetRect;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="absolute pointer-events-none"
      style={{
        top: top - padding,
        left: left - padding,
        width: width + padding * 2,
        height: height + padding * 2,
        border: '4px solid rgba(99, 102, 241, 0.8)',
        borderRadius: '12px',
        zIndex: 100002,
        boxShadow: '0 0 0 4px rgba(99, 102, 241, 0.3)',
      }}
      aria-hidden="true"
    />
  );
}
