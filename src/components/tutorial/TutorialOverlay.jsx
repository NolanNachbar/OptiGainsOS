import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTutorial } from "@/hooks/useTutorial";
import TutorialTooltip from "./TutorialTooltip";
import TutorialSpotlight from "./TutorialSpotlight";

export default function TutorialOverlay() {
  const {
    isActive,
    currentStep,
    currentStepData,
    totalSteps,
    nextStep,
    previousStep,
    skipTutorial,
  } = useTutorial();

  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const overlayRef = useRef(null);
  const tooltipRef = useRef(null);
  const targetRectRef = useRef(null);
  const hasConstrainedRef = useRef(false);

  // Constrain position to viewport bounds and avoid covering target
  const constrainToViewport = useCallback(() => {
    if (!tooltipRef.current) return;

    // Prevent infinite loops - only constrain once per step
    if (hasConstrainedRef.current) return;

    const padding = 16;
    const modalRect = tooltipRef.current.getBoundingClientRect();

    // Start with current position
    let newLeft = modalRect.left;
    let newTop = modalRect.top;

    // STEP 1: Ensure modal is fully within viewport (top-left and bottom-right corners on screen)
    // Check left edge
    if (newLeft < padding) {
      newLeft = padding;
    }
    // Check right edge
    if (newLeft + modalRect.width > window.innerWidth - padding) {
      newLeft = window.innerWidth - padding - modalRect.width;
    }
    // Check top edge
    if (newTop < padding) {
      newTop = padding;
    }
    // Check bottom edge
    if (newTop + modalRect.height > window.innerHeight - padding) {
      newTop = window.innerHeight - padding - modalRect.height;
    }

    // STEP 2: Check if modal overlaps target, and if so, move it away
    const targetRect = targetRectRef.current;
    if (targetRect) {
      const overlap = {
        horizontal: newLeft < targetRect.left + targetRect.width &&
                   newLeft + modalRect.width > targetRect.left,
        vertical: newTop < targetRect.top + targetRect.height &&
                 newTop + modalRect.height > targetRect.top,
      };

      if (overlap.horizontal && overlap.vertical) {
        // Calculate possible positions to avoid target
        const positions = [
          // Below target
          { left: newLeft, top: targetRect.top + targetRect.height + padding },
          // Above target
          { left: newLeft, top: targetRect.top - modalRect.height - padding },
          // Right of target
          { left: targetRect.left + targetRect.width + padding, top: newTop },
          // Left of target
          { left: targetRect.left - modalRect.width - padding, top: newTop },
        ];

        // Find first position that fits in viewport
        for (const pos of positions) {
          if (pos.left >= padding &&
              pos.left + modalRect.width <= window.innerWidth - padding &&
              pos.top >= padding &&
              pos.top + modalRect.height <= window.innerHeight - padding) {
            newLeft = pos.left;
            newTop = pos.top;
            break;
          }
        }
      }
    }

    // Apply new position
    const adjustX = newLeft - modalRect.left;
    const adjustY = newTop - modalRect.top;

    if (adjustX !== 0 || adjustY !== 0) {
      const newPos = {
        top: `${newTop}px`,
        left: `${newLeft}px`,
        transform: 'none',
        bottom: 'auto',
        right: 'auto',
      };

      hasConstrainedRef.current = true;
      setTooltipPosition(newPos);
    } else {
      hasConstrainedRef.current = true;
    }
  }, []);

  // Find target element and calculate positions
  const updatePositions = useCallback(() => {

    if (!currentStepData?.targetSelector) {
      // Center placement for modal-only steps
      targetRectRef.current = null;

      // On mobile, position near top with safe margins
      if (window.innerWidth < 768) {
        const safeTop = Math.max(20, window.innerHeight * 0.1);
        setTooltipPosition({
          top: `${safeTop}px`,
          left: '50%',
          transform: 'translateX(-50%)',
        });
      } else {
        setTooltipPosition({
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        });
      }
      return;
    }

    // Find all matching elements and filter to only visible ones
    const allMatches = document.querySelectorAll(currentStepData.targetSelector);
    let targetElement = null;

    // Find the first visible element (not hidden by CSS)
    for (const el of allMatches) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      // Check if element is visible:
      // 1. Not display:none or visibility:hidden
      // 2. Has dimensions (width and height > 0)
      // 3. Either has offsetParent OR is fixed position (fixed elements have null offsetParent but are still visible)
      const isVisible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0 &&
        (el.offsetParent !== null || style.position === 'fixed');

      if (isVisible) {
        targetElement = el;
        break;
      }
    }

    if (!targetElement) {
      // Fallback to center if element not found
      targetRectRef.current = null;
      setTooltipPosition({
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    targetRectRef.current = {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    };

    // Position tooltip based on placement
    const padding = 20;
    const placement = currentStepData.placement || 'bottom';

    let top, left;

    switch (placement) {
      case 'top':
        // Add extra spacing to ensure modal doesn't block the element
        // The modal needs to be much higher since transform moves it up by its own height
        const extraTopSpacing = 250;
        top = rect.top + window.scrollY - padding - extraTopSpacing;
        left = rect.left + window.scrollX + rect.width / 2;
        setTooltipPosition({
          top: `${top}px`,
          left: `${left}px`,
          transform: 'translate(-50%, -100%)',
        });
        break;

      case 'bottom':
        top = rect.bottom + window.scrollY + padding;
        left = rect.left + window.scrollX + rect.width / 2;

        // On mobile/small screens, ensure tooltip doesn't block the element
        if (window.innerWidth < 768) {
          // Position tooltip below with extra spacing
          const extraSpacing = 20;
          setTooltipPosition({
            top: `${top + extraSpacing}px`,
            left: `${left}px`,
            transform: 'translate(-50%, 0)',
          });
        } else {
          setTooltipPosition({
            top: `${top}px`,
            left: `${left}px`,
            transform: 'translate(-50%, 0)',
          });
        }
        break;

      case 'left':
        // Add extra spacing to move modal up and further left
        const upwardOffset = 350;
        const leftOffset = 475;
        top = rect.top + window.scrollY + rect.height / 2 - upwardOffset;
        left = rect.left + window.scrollX - padding - leftOffset;
        setTooltipPosition({
          top: `${top}px`,
          left: `${left}px`,
          transform: 'translate(-100%, -50%)',
        });
        break;

      case 'right':
        top = rect.top + window.scrollY + rect.height / 2;
        left = rect.right + window.scrollX + padding;
        setTooltipPosition({
          top: `${top}px`,
          left: `${left}px`,
          transform: 'translate(0, -50%)',
        });
        break;

      case 'top-left':
        // Position modal to the left, ensuring it doesn't cover the target
        top = window.innerHeight - rect.bottom + padding;
        left = window.innerWidth - rect.left + rect.width + padding * 3;
        setTooltipPosition({
          bottom: `${top}px`,
          right: `${left}px`,
          top: 'auto',
          left: 'auto',
          transform: 'none',
        });
        break;

      case 'bottom-left':
        // Position modal below and to the left of the target
        const downwardSpacing = 20;
        top = rect.bottom + window.scrollY + padding + downwardSpacing;
        left = rect.left + window.scrollX;
        setTooltipPosition({
          top: `${top}px`,
          left: `${left}px`,
          transform: 'none',
        });
        break;

      case 'screen-left':
        // Position modal on the left side of the screen, aligned with top of target
        top = rect.top + window.scrollY;
        setTooltipPosition({
          top: `${top}px`,
          left: '20px',
          transform: 'none',
        });
        break;

      case 'center':
      default:
        // On mobile, position near top with safe margins
        if (window.innerWidth < 768) {
          // Calculate safe top position (avoid notch/safe area)
          const safeTop = Math.max(20, window.innerHeight * 0.1);
          setTooltipPosition({
            top: `${safeTop}px`,
            left: '50%',
            transform: 'translateX(-50%)',
          });
        } else {
          setTooltipPosition({
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          });
        }
        break;
    }
  }, [currentStepData]);

  // Update positions when step changes or window resizes
  useEffect(() => {
    if (isActive) {
      // Reset constraint flag for new step
      hasConstrainedRef.current = false;

      // Initial position update
      updatePositions();

      // Retry positioning after a short delay to handle dynamic content
      const retryTimer = setTimeout(() => {
        updatePositions();
        // Reset flag after initial positioning so constraint can run
        hasConstrainedRef.current = false;
      }, 100);

      // Constrain to viewport after tooltip renders
      // Use multiple attempts to ensure proper positioning after animations
      const constrainTimer1 = setTimeout(() => {
        hasConstrainedRef.current = false;
        constrainToViewport();
      }, 200);
      const constrainTimer2 = setTimeout(() => {
        hasConstrainedRef.current = false;
        constrainToViewport();
      }, 400);

      window.addEventListener('resize', updatePositions);

      return () => {
        clearTimeout(retryTimer);
        clearTimeout(constrainTimer1);
        clearTimeout(constrainTimer2);
        window.removeEventListener('resize', updatePositions);
      };
    }
  }, [isActive, currentStep, updatePositions, constrainToViewport]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'Escape':
          skipTutorial();
          break;
        case 'ArrowRight':
        case 'Enter':
          e.preventDefault();
          nextStep();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (currentStep > 0) {
            previousStep();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, currentStep, nextStep, previousStep, skipTutorial]);

  // Lock scroll when tutorial is active
  useEffect(() => {
    if (isActive) {
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      // Prevent scrollbar jump by adding padding for scrollbar width
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  }, [isActive]);

  // Focus trap
  useEffect(() => {
    if (isActive && overlayRef.current) {
      const focusableElements = overlayRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  }, [isActive, currentStep]);

  if (!isActive || !currentStepData) return null;

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0" style={{ zIndex: 100000, pointerEvents: 'none' }}>
      {/* Backdrop overlay with cutout for highlighted element */}
      <AnimatePresence>
        {targetRectRef.current ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute"
            style={{
              pointerEvents: 'none',
              top: targetRectRef.current.top - (currentStepData.highlightPadding || 12),
              left: targetRectRef.current.left - (currentStepData.highlightPadding || 12),
              width: targetRectRef.current.width + (currentStepData.highlightPadding || 12) * 2,
              height: targetRectRef.current.height + (currentStepData.highlightPadding || 12) * 2,
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
              borderRadius: '12px',
            }}
            aria-hidden="true"
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-black/30"
            style={{ pointerEvents: 'none' }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Spotlight around target element */}
      <AnimatePresence mode="wait">
        <TutorialSpotlight
          key={currentStep}
          targetRect={targetRectRef.current}
          padding={currentStepData.highlightPadding || 12}
        />
      </AnimatePresence>

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <TutorialTooltip
          ref={tooltipRef}
          key={currentStep}
          step={currentStepData}
          currentStep={currentStep}
          totalSteps={totalSteps}
          position={tooltipPosition}
          onNext={nextStep}
          onPrevious={previousStep}
          onSkip={skipTutorial}
          celebration={currentStepData.celebration}
        />
      </AnimatePresence>
    </div>,
    document.body
  );
}
