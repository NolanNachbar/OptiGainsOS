// Centralized query keys for React Query
// Using consistent keys prevents cache misses and makes invalidation predictable

export const queryKeys = {
  // User profile
  userProfile: (userId) => ['userProfile', userId],
  hasProfile: (userId) => ['hasProfile', userId],

  // Workouts
  workouts: () => ['workouts'],
  workout: (id) => ['workout', id],

  // Workout reactions
  reactions: (userId) => ['reactions', userId],

  // Exercise reactions (like/dislike per individual exercise)
  exerciseReactions: (userId) => ['exerciseReactions', userId],

  // Workout schedule
  schedule: (userId) => ['schedule', userId],
  todaySchedule: (date, userId) => ['todaySchedule', date, userId],

  // Food entries
  allFoodEntries: (userId) => ['allFoodEntries', userId],
  foodEntries: (date, userId) => ['foodEntries', date, userId],
  todayFood: (date, userId) => ['todayFood', date, userId],

  // Workout logs
  workoutLogs: (userId) => ['workoutLogs', userId],

  // Body weight entries
  bodyWeightEntries: (userId) => ['bodyWeightEntries', userId],

  // Recipes
  recipes: (userId) => ['recipes', userId],
  recipe: (id) => ['recipe', id],

  // Meal Templates
  mealTemplates: (userId) => ['mealTemplates', userId],

  // Custom Foods
  customFoods: (userId) => ['customFoods', userId],

  // Diet Phases
  dietPhases: (userId) => ['dietPhases', userId],
  activeDietPhase: (userId) => ['activeDietPhase', userId],

  // Weekly Check-ins
  weeklyCheckins: (userId) => ['weeklyCheckins', userId],
  pendingCheckin: (userId) => ['pendingCheckin', userId],

  // Social
  friends: (userId) => ['friends', userId],
  pendingFriendRequests: (userId) => ['pendingFriendRequests', userId],
  sentFriendRequests: (userId) => ['sentFriendRequests', userId],
  newlyAcceptedFriends: (userId) => ['newlyAcceptedFriends', userId],
  userSearch: (query) => ['userSearch', query],
  publicProfile: (username) => ['publicProfile', username],
  sharedWorkouts: (userId) => ['sharedWorkouts', userId],
  feed: (userId) => ['feed', userId],
  leaderboard: (exercise, timePeriod) => ['leaderboard', exercise, timePeriod],
  notificationCount: (userId) => ['notificationCount', userId],
  userExerciseNames: (userId) => ['userExerciseNames', userId],

  // Programs
  programs: (userId) => ['programs', userId],
  program: (id) => ['program', id],
  programWorkouts: (programId) => ['programWorkouts', programId],
  enrollments: (userId) => ['enrollments', userId],
  enrollment: (userId, programId) => ['enrollment', userId, programId],

  // Comments
  comments: (sharedWorkoutId) => ['comments', sharedWorkoutId],
  programComments: (sharedProgramId) => ['programComments', sharedProgramId],
  recipeComments: (sharedRecipeId) => ['recipeComments', sharedRecipeId],

  // Reactions
  programReactions: (sharedProgramId) => ['programReactions', sharedProgramId],
  recipeReactions: (sharedRecipeId) => ['recipeReactions', sharedRecipeId],

  // Explore feed
  exploreFeed: (userId) => ['exploreFeed', userId],

  // Shared recipes
  sharedRecipes: (userId) => ['sharedRecipes', userId],

  // Shared programs
  sharedPrograms: (userId) => ['sharedPrograms', userId],

  // Misc
  weeklyWorkoutLogs: (weekStart, userId) => ['weeklyWorkoutLogs', weekStart, userId],
  lastWorkoutLog: (workoutId, userId) => ['lastWorkoutLog', workoutId, userId],
  lastAcceptedCheckin: (userId) => ['lastAcceptedCheckin', userId],
  workoutPlan: () => ['workoutPlan'],
};

// Invalidation helpers - common patterns
export const invalidateFood = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['allFoodEntries'] });
  queryClient.invalidateQueries({ queryKey: ['foodEntries'] });
  queryClient.invalidateQueries({ queryKey: ['todayFood'] });
};

export const invalidateSchedule = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['schedule'] });
  queryClient.invalidateQueries({ queryKey: ['todaySchedule'] });
};

export const invalidateWorkouts = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['workouts'] });
};

export const invalidateReactions = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['reactions'] });
};

export const invalidateExerciseReactions = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['exerciseReactions'] });
};

export const invalidateProfile = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['userProfile'] });
  queryClient.invalidateQueries({ queryKey: ['hasProfile'] });
};

export const invalidateWorkoutLogs = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['workoutLogs'] });
  queryClient.invalidateQueries({ queryKey: ['workoutLog'] });
};

export const invalidateBodyWeight = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['bodyWeightEntries'] });
};

export const invalidateCustomFoods = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['customFoods'] });
};

export const invalidateRecipes = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['recipes'] });
  queryClient.invalidateQueries({ queryKey: ['recipe'] });
};

export const invalidateMealTemplates = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['mealTemplates'] });
  queryClient.invalidateQueries({ queryKey: ['mealTemplate'] });
};

export const invalidateDietPhases = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['dietPhases'] });
  queryClient.invalidateQueries({ queryKey: ['activeDietPhase'] });
};

export const invalidateCheckins = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['weeklyCheckins'] });
  queryClient.invalidateQueries({ queryKey: ['pendingCheckin'] });
};

export const invalidateFriends = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['friends'] });
  queryClient.invalidateQueries({ queryKey: ['pendingFriendRequests'] });
  queryClient.invalidateQueries({ queryKey: ['sentFriendRequests'] });
  queryClient.invalidateQueries({ queryKey: ['newlyAcceptedFriends'] });
  queryClient.invalidateQueries({ queryKey: ['notificationCount'] });
};

export const invalidateFeed = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['feed'] });
  queryClient.invalidateQueries({ queryKey: ['feedReactions'] });
  queryClient.invalidateQueries({ queryKey: ['exploreFeed'] });
};

export const invalidateComments = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['comments'] });
};

export const invalidateSharedRecipes = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['sharedRecipes'] });
};

export const invalidateSharedPrograms = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['sharedPrograms'] });
};

export const invalidatePrograms = (queryClient) => {
  queryClient.invalidateQueries({ queryKey: ['programs'] });
  queryClient.invalidateQueries({ queryKey: ['program'] });
  queryClient.invalidateQueries({ queryKey: ['programWorkouts'] });
  queryClient.invalidateQueries({ queryKey: ['enrollments'] });
  queryClient.invalidateQueries({ queryKey: ['enrollment'] });
};
