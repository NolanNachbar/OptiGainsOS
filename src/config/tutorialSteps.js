/**
 * Tutorial step configuration
 * Each step defines a target element to highlight and tooltip content
 */

export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Your Dashboard!',
    content: 'This is your home base. See today\'s scheduled workout, nutrition summary, and quick actions all in one place.',
    targetSelector: null, // No specific target for welcome
    targetPage: '/dashboard',
    placement: 'center',
    highlightPadding: 0,
  },
  {
    id: 'start-workout',
    title: 'Today\'s Workout',
    content: 'This card shows your scheduled workout for today. Click "Start Workout" to view the workout!',
    targetSelector: '[data-tutorial="start-workout-btn"]',
    targetPage: '/dashboard',
    placement: 'bottom',
    highlightPadding: 12,
    requiresAction: true, // User must click Start Workout
  },
  {
    id: 'start-logging',
    title: 'Begin Logging',
    content: 'Now click "Start Logging Workout" to begin tracking your sets and reps!',
    targetSelector: '[data-tutorial="start-logging-btn"]',
    targetPage: '/workout-detail',
    placement: 'bottom',
    highlightPadding: 12,
    requiresAction: true, // User must click Start Logging
  },
  {
    id: 'log-exercises',
    title: 'Log Your Sets',
    content: 'Enter the weight and reps for each set, then check the box when you complete it. The app will remember your previous weights to help you track progress!',
    targetSelector: '[data-tutorial="exercise-card"]',
    targetPage: '/workout-detail',
    placement: 'top',
    highlightPadding: 12,
    requiresAction: true, // User must check the box
  },
  {
    id: 'finish-workout',
    title: 'Complete Your Workout',
    content: 'When you\'re done, click "Finish" to save your progress. Now let\'s head back to explore more features!',
    targetSelector: '[data-tutorial="finish-workout-btn"]',
    targetPage: '/workout-detail',
    placement: 'bottom-left',
    highlightPadding: 12,
    requiresAction: true, // User must click back/finish
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    content: 'See that + button in the corner? Click it now to see your quick action options!',
    targetSelector: '[data-tutorial="fab-button"]',
    targetPage: '/dashboard',
    placement: 'top-left',
    highlightPadding: 12,
    requiresAction: true, // User must click FAB
  },
  {
    id: 'log-food-action',
    title: 'Log Food',
    content: 'Click "Log Food" to track your nutrition. Logging meals helps you stay on track with your macro targets!',
    targetSelector: '[data-tutorial="fab-log-food"]',
    targetPage: '/dashboard',
    placement: 'top-left',
    highlightPadding: 12,
    requiresAction: true, // User must click Log Food
  },
  {
    id: 'add-food',
    title: 'Add Your Food',
    content: 'Search for a food, enter the details, then click "Add Food" to log it.',
    targetSelector: '[data-tutorial="add-food-submit"]',
    targetPage: '/food-tracker',
    placement: 'center',
    highlightPadding: 12,
  },
  {
    id: 'nutrition',
    title: 'Track Your Nutrition',
    content: 'Your nutrition powers your progress! These rings show your daily macro targets.',
    targetSelector: '[data-tutorial="nutrition-rings"]',
    targetPage: '/food-tracker',
    placement: 'bottom',
    highlightPadding: 12,
  },
  {
    id: 'navigate-back',
    title: 'Back to Dashboard',
    content: 'Great! Now let\'s head back to see the AI workout generator. Click the Home tab.',
    targetSelector: '[data-tutorial="home-nav"]',
    targetPage: '/food-tracker',
    placement: 'top',
    highlightPadding: 12,
    requiresAction: true,
  },
  {
    id: 'generate-week',
    title: 'AI Workout Generator',
    content: 'Let AI create a personalized week of workouts for you! Click "Generate My Week" to see how it works.',
    targetSelector: '[data-tutorial="generate-week-btn"]',
    targetPage: '/dashboard',
    placement: 'bottom-left',
    highlightPadding: 12,
    requiresAction: true,
  },
  {
    id: 'approve-schedule',
    title: 'Review & Approve',
    content: 'Review your AI-generated workouts and click "Approve & Schedule" to add them to your calendar!',
    targetSelector: '[data-tutorial="approve-schedule-btn"]',
    targetPage: '/dashboard',
    placement: 'top',
    highlightPadding: 12,
    requiresAction: true,
  },
  {
    id: 'schedule',
    title: 'Plan Your Week',
    content: 'Stay consistent by planning ahead! The Schedule tab lets you drag workouts onto your calendar. Consistency equals results!',
    targetSelector: '[data-tutorial="schedule-nav"]',
    targetPage: '/dashboard',
    placement: 'top',
    highlightPadding: 12,
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    content: 'You\'re ready to crush your fitness goals! Plus, explore even more: build Custom Programs, track your PRs on the Social wall, and dive into Exercise Analytics to see your progress. Remember: You can replay this tour anytime from Profile > Help & Support.',
    targetSelector: null,
    targetPage: '/dashboard',
    placement: 'center',
    celebration: true,
    highlightPadding: 0,
  },
];
