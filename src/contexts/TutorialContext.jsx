import { createContext, useState, useEffect, useCallback } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TUTORIAL_STEPS } from "@/config/tutorialSteps";
import { queryKeys } from "@/lib/queryKeys";

export const TutorialContext = createContext(null);

export function TutorialProvider({ children }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tutorialWorkouts, setTutorialWorkouts] = useState([]); // Store tutorial-only workouts
  const totalSteps = TUTORIAL_STEPS.length;

  // Load initial state from profile
  useEffect(() => {
    if (profile) {
      setCurrentStep(profile.tutorial_current_step || 0);
    }
  }, [profile]);

  // Update current step in database
  const updateStepMutation = useMutation({
    mutationFn: async (step) => {
      if (!profile?.id) return;
      await db.entities.UserProfile.update(profile.id, {
        tutorial_current_step: step,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.profile(user?.id));
    },
  });

  // Mark tutorial as completed
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      await db.entities.UserProfile.update(profile.id, {
        tutorial_completed: true,
        tutorial_dismissed: false,
        tutorial_current_step: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.profile(user?.id));
    },
  });

  // Mark tutorial as dismissed (skipped)
  const dismissMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      await db.entities.UserProfile.update(profile.id, {
        tutorial_dismissed: true,
        tutorial_current_step: 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.profile(user?.id));
    },
  });

  const startTutorial = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);
      updateStepMutation.mutate(newStep);
    } else {
      // Last step - complete tutorial
      completeTutorial();
    }
  }, [currentStep, totalSteps]);

  const previousStep = useCallback(() => {
    if (currentStep > 0) {
      const newStep = currentStep - 1;
      setCurrentStep(newStep);
      updateStepMutation.mutate(newStep);
    }
  }, [currentStep]);

  const skipTutorial = useCallback(() => {
    setIsActive(false);
    setTutorialWorkouts([]); // Clear tutorial workouts
    dismissMutation.mutate();
  }, []);

  const completeTutorial = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    setTutorialWorkouts([]); // Clear tutorial workouts
    completeMutation.mutate();
  }, []);

  const replayTutorial = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const value = {
    isActive,
    currentStep,
    totalSteps,
    isCompleted: profile?.tutorial_completed || false,
    isDismissed: profile?.tutorial_dismissed || false,
    currentStepData: TUTORIAL_STEPS[currentStep],
    tutorialWorkouts,
    setTutorialWorkouts,
    startTutorial,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    replayTutorial,
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}
