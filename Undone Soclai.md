-- Remove everything social
DROP FUNCTION IF EXISTS are_friends;
DROP FUNCTION IF EXISTS lookup_username;
DROP TABLE IF EXISTS friendships;
DROP INDEX IF EXISTS idx_user_profiles_username_lower;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS username;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS bio;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS privacy_level;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS total_workouts;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS current_streak;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS longest_streak;
