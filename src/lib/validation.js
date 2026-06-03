/**
 * Validation schemas using Zod
 * Use these to validate user input before database operations
 */
import { z } from 'zod';

// ============================================================================
// USER & PROFILE VALIDATION
// ============================================================================

export const emailSchema = z.string().email('Invalid email address').max(255);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password is too long');

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .refine((val) => /^[a-zA-Z0-9_]+$/.test(val), {
    message: 'Username can only contain letters, numbers, and underscores'
  });

export const displayNameSchema = z
  .string()
  .min(1, 'Display name is required')
  .max(50, 'Display name is too long')
  .trim();

export const bioSchema = z
  .string()
  .max(500, 'Bio must be at most 500 characters')
  .trim()
  .optional();

export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  display_name: displayNameSchema.optional(),
  bio: bioSchema,
  privacy_level: z.enum(['public', 'friends', 'private']).optional(),
  weight_unit: z.enum(['lbs', 'kg']).optional(),
  daily_calorie_goal: z.number().int().min(0).max(10000).optional(),
  daily_protein_goal: z.number().int().min(0).max(1000).optional(),
  daily_carbs_goal: z.number().int().min(0).max(2000).optional(),
  daily_fats_goal: z.number().int().min(0).max(500).optional(),
});

// ============================================================================
// WORKOUT VALIDATION
// ============================================================================

export const workoutTitleSchema = z
  .string()
  .min(1, 'Title is required')
  .max(100, 'Title is too long')
  .trim();

export const workoutDescriptionSchema = z
  .string()
  .max(1000, 'Description is too long')
  .trim()
  .optional();

export const exerciseSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  sets: z.number().int().min(1).max(20),
  reps: z.string().max(50).optional(), // Can be "8-12", "AMRAP", etc.
  weight: z.number().min(0).max(2000).optional(),
  rest_seconds: z.number().int().min(0).max(600).optional(),
  notes: z.string().max(500).trim().optional(),
});

export const workoutCreateSchema = z.object({
  title: workoutTitleSchema,
  description: workoutDescriptionSchema,
  duration_minutes: z.number().int().min(1).max(300),
  exercises: z.array(exerciseSchema).min(1, 'At least one exercise is required'),
});

export const workoutUpdateSchema = workoutCreateSchema.partial();

// ============================================================================
// FOOD & NUTRITION VALIDATION
// ============================================================================

export const foodNameSchema = z
  .string()
  .min(1, 'Food name is required')
  .max(200, 'Food name is too long')
  .trim();

export const macroValueSchema = z.number().min(0).max(10000);

export const foodEntrySchema = z.object({
  food_name: foodNameSchema,
  calories: macroValueSchema,
  protein: macroValueSchema,
  carbs: macroValueSchema,
  fats: macroValueSchema,
  serving_size: z.number().min(0.1).max(10000),
  serving_unit: z.string().max(20).trim(),
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  date: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Invalid date format'
  }),
});

export const customFoodSchema = z.object({
  name: foodNameSchema,
  brand: z.string().max(100).trim().optional(),
  calories: macroValueSchema,
  protein: macroValueSchema,
  carbs: macroValueSchema,
  fats: macroValueSchema,
  serving_size: z.number().min(0.1).max(10000),
  serving_unit: z.string().max(20).trim(),
  barcode: z.string().max(50).trim().optional(),
});

// ============================================================================
// BODY WEIGHT VALIDATION
// ============================================================================

export const bodyWeightSchema = z.object({
  weight: z.number().min(20).max(1000, 'Weight must be realistic'),
  date: z.string().refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: 'Invalid date format'
  }),
  unit: z.enum(['lbs', 'kg']),
  notes: z.string().max(200).trim().optional(),
});

// ============================================================================
// PROGRAM VALIDATION
// ============================================================================

export const programSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(1000).trim().optional(),
  days_per_week: z.number().int().min(1).max(7),
  duration_weeks: z.number().int().min(1).max(52),
  is_public: z.boolean().optional(),
});

// ============================================================================
// COMMENT & SOCIAL VALIDATION
// ============================================================================

export const commentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment is too long')
    .trim(),
});

export const reactionTypeSchema = z.enum(['like', 'love', 'fire', 'clap']);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate data against a schema and return sanitized data
 * @throws {Error} if validation fails
 */
export function validate(schema, data) {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error.issues) {
      // Zod validation error - format nicely
      const messages = error.issues.map(err => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Validation failed: ${messages.join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate data and return { success, data, error }
 * Doesn't throw - safe for use in forms
 */
export function safeValidate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data, error: null };
  }
  const messages = result.error.issues.map(err => `${err.path.join('.')}: ${err.message}`);
  return {
    success: false,
    data: null,
    error: messages.join(', ')
  };
}

/**
 * Sanitize a string for safe display (removes excessive whitespace)
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Sanitize HTML to prevent XSS (basic - for more robust use DOMPurify)
 */
export function sanitizeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
