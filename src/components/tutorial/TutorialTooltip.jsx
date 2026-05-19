import { forwardRef } from "react";
import { motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProgressDots from "./ProgressDots";
import ExerciseCardPreview from "./ExerciseCardPreview";

const TutorialTooltip = forwardRef(function TutorialTooltip({
  step,
  currentStep,
  totalSteps,
  position,
  onNext,
  onPrevious,
  onSkip,
  celebration,
}, ref) {
  const { title, content, illustration } = step;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        ...position,
        zIndex: 100001,
        pointerEvents: 'auto',
        width: window.innerWidth < 768 ? 'calc(100vw - 32px)' : 'auto',
        maxWidth: '28rem',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-[#1a1a1a]  rounded-xl shadow-2xl border-2 border-brand/50/50 flex flex-col"
        style={{
          maxHeight: window.innerWidth < 768 ? 'calc(100vh - 40px)' : 'none',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-content"
        aria-live="polite"
      >
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a2a]  flex items-center justify-between shrink-0">
        <ProgressDots current={currentStep} total={totalSteps} />
        <button
          onClick={onSkip}
          className="text-[#555555] hover:text-[#a0a0a0] transition-colors p-1"
          aria-label="Skip tutorial"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 overflow-y-auto flex-1">
        <h2
          id="tutorial-title"
          className="text-xl font-bold text-white mb-3 flex items-center gap-2"
        >
          {celebration && <Sparkles className="w-5 h-5 text-brand" />}
          {title}
        </h2>
        <p
          id="tutorial-content"
          className="text-[#a0a0a0]  leading-relaxed"
        >
          {content}
        </p>

        {/* Illustration for weight autofill step */}
        {illustration === 'ExerciseCardPreview' && (
          <div className="mt-4">
            <ExerciseCardPreview />
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#2a2a2a]  flex items-center justify-between gap-3 shrink-0">
        <Button
          variant="ghost"
          onClick={onSkip}
          className="text-[#a0a0a0] "
        >
          Skip Tour
        </Button>
        <div className="flex items-center gap-2">
          {!isFirstStep && (
            <Button
              variant="outline"
              onClick={onPrevious}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
          )}
          <Button
            onClick={onNext}
            className="bg-brand hover:bg-brand text-black font-bold flex items-center gap-1"
          >
            {isLastStep ? "Start Training!" : "Next"}
            {!isLastStep && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      </motion.div>
    </div>
  );
});

export default TutorialTooltip;
