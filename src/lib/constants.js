// Default nutrition goals
export const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
};

// Meal types
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

// Time of day options
export const TIME_OF_DAY_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'anytime', label: 'Anytime' },
];

// Workout types
export const WORKOUT_TYPES = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'flexibility', label: 'Flexibility' },
  { value: 'mixed', label: 'Mixed' },
];

// Difficulty levels — capitalized labels
export const DIFFICULTY_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

// Difficulty color mapping — rich, accessible colors
export const DIFFICULTY_COLORS = {
  beginner:     'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
  intermediate: 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
  advanced:     'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  expert:       'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
};

// Human-readable difficulty labels (always capitalized)
export const DIFFICULTY_LABELS = {
  beginner:     'Beginner',
  intermediate: 'Intermediate',
  advanced:     'Advanced',
  expert:       'Expert',
};

// Serving units
export const SERVING_UNITS = [
  { value: 'serving', label: 'serving(s)' },
  { value: 'g', label: 'grams' },
  { value: 'oz', label: 'oz' },
  { value: 'cup', label: 'cup(s)' },
  { value: 'tbsp', label: 'tbsp' },
  { value: 'tsp', label: 'tsp' },
  { value: 'ml', label: 'ml' },
  { value: 'piece', label: 'piece(s)' },
];

// Equipment options
export const EQUIPMENT_OPTIONS = [
  { value: 'none', label: 'No Equipment (Bodyweight)' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'barbells', label: 'Barbells' },
  { value: 'resistance_bands', label: 'Resistance Bands' },
  { value: 'pull_up_bar', label: 'Pull-up Bar' },
  { value: 'bench', label: 'Bench' },
  { value: 'full_gym', label: 'Full Gym Access' },
];

// Weight units
export const WEIGHT_UNITS = [
  { value: 'lbs', label: 'Pounds (lbs)' },
  { value: 'kg', label: 'Kilograms (kg)' },
];

// Activity levels with TDEE multipliers
export const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Little or no exercise', multiplier: 1.2 },
  { value: 'lightly_active', label: 'Lightly Active', desc: 'Light exercise 1-3 days/week', multiplier: 1.375 },
  { value: 'moderately_active', label: 'Moderately Active', desc: 'Moderate exercise 3-5 days/week', multiplier: 1.55 },
  { value: 'very_active', label: 'Very Active', desc: 'Hard exercise 6-7 days/week', multiplier: 1.725 },
  { value: 'extremely_active', label: 'Extremely Active', desc: 'Very hard exercise, physical job', multiplier: 1.9 },
];

// Sex options for TDEE calculation
export const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

// Height unit options
export const HEIGHT_UNITS = [
  { value: 'in', label: 'Inches (ft/in)' },
  { value: 'cm', label: 'Centimeters (cm)' },
];

// Calorie adjustment presets relative to TDEE
export const CALORIE_ADJUSTMENTS = [
  { value: -1000, label: 'Aggressive cut (-1000)' },
  { value: -500, label: 'Standard cut (-500)' },
  { value: -250, label: 'Mild cut (-250)' },
  { value: 0, label: 'Maintenance' },
  { value: 250, label: 'Lean bulk (+250)' },
  { value: 500, label: 'Standard bulk (+500)' },
];

// Diet phase types
export const PHASE_TYPES = [
  { value: 'cut', label: 'Cut', description: 'Lose body fat while preserving muscle' },
  { value: 'bulk', label: 'Bulk', description: 'Build muscle with a caloric surplus' },
  { value: 'maintain', label: 'Maintain', description: 'Hold current weight and body composition' },
  { value: 'reverse', label: 'Reverse Diet', description: 'Gradually raise calories to restore metabolism post-cut' },
];

// Weekly rate of change presets by phase type.
// cut/bulk/maintain: lbs/week. reverse: cal/week increment.
export const WEEKLY_RATE_PRESETS = {
  cut: [
    { value: -0.25, label: 'Conservative', desc: '-0.25 lb/wk' },
    { value: -0.5, label: 'Moderate', desc: '-0.5 lb/wk' },
    { value: -0.75, label: 'Standard', desc: '-0.75 lb/wk' },
    { value: -1.0, label: 'Aggressive', desc: '-1.0 lb/wk' },
    { value: -1.5, label: 'Very Aggressive', desc: '-1.5 lb/wk' },
  ],
  bulk: [
    { value: 0.25, label: 'Lean', desc: '+0.25 lb/wk' },
    { value: 0.5, label: 'Standard', desc: '+0.5 lb/wk' },
    { value: 0.75, label: 'Aggressive', desc: '+0.75 lb/wk' },
  ],
  maintain: [
    { value: 0, label: 'Maintenance', desc: '0 lb/wk' },
  ],
  reverse: [
    { value: 25,  label: 'Very Slow',    desc: '+25 cal/wk'  },
    { value: 50,  label: 'Conservative', desc: '+50 cal/wk'  },
    { value: 75,  label: 'Standard',     desc: '+75 cal/wk'  },
    { value: 100, label: 'Aggressive',   desc: '+100 cal/wk' },
  ],
};

// Days of the week for check-in day selector
export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];
