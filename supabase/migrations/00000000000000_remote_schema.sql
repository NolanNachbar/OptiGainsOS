


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."delete_user_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  uid text := (select auth.uid())::text;
BEGIN
  DELETE FROM workout_logs WHERE created_by = uid;
  DELETE FROM workout_sessions WHERE created_by = uid;
  DELETE FROM workout_schedules WHERE created_by = uid;
  DELETE FROM workouts WHERE created_by = uid;
  DELETE FROM program_enrollments WHERE created_by = uid;
  DELETE FROM program_workouts WHERE created_by = uid;
  DELETE FROM programs WHERE created_by = uid;
  DELETE FROM food_entries WHERE created_by = uid;
  DELETE FROM custom_foods WHERE created_by = uid;
  DELETE FROM body_weight_entries WHERE created_by = uid;
  DELETE FROM diet_phases WHERE created_by = uid;
  DELETE FROM daily_readiness WHERE created_by = uid;
  DELETE FROM cardio_sessions WHERE created_by = uid;
  DELETE FROM recipes WHERE created_by = uid;
  DELETE FROM meal_templates WHERE created_by = uid;
  DELETE FROM push_subscriptions WHERE created_by = uid;
  DELETE FROM weekly_checkins WHERE created_by = uid;
  DELETE FROM user_profiles WHERE created_by = uid;
END;
$$;


ALTER FUNCTION "public"."delete_user_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."materialize_daily_tasks"("p_user" "uuid", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  inserted int;
BEGIN
  INSERT INTO daily_tasks (created_by, date, template_id, title, domain, target, sort_order)
  SELECT t.created_by, p_date, t.id, t.title, t.domain, t.target, t.sort_order
  FROM task_templates t
  WHERE t.created_by = p_user
    AND t.active
    AND (
      t.recurrence = 'daily'
      OR (t.recurrence = 'weekdays' AND extract(dow FROM p_date) BETWEEN 1 AND 5)
      OR (t.recurrence IN ('weekly','custom') AND extract(dow FROM p_date) = ANY(t.days_of_week))
    )
  ON CONFLICT (created_by, date, template_id) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;


ALTER FUNCTION "public"."materialize_daily_tasks"("p_user" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."athlete_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "source_key" "text" NOT NULL,
    "domain" "text",
    "goal" "text" NOT NULL,
    "target" "text",
    "status" "text" DEFAULT 'active'::"text",
    "priority" integer DEFAULT 0,
    "notes" "text",
    "active" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."athlete_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_landmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "muscle" "text" NOT NULL,
    "mev" numeric NOT NULL,
    "mav" numeric NOT NULL,
    "mrv" numeric NOT NULL,
    "mrv_mean" numeric NOT NULL,
    "mrv_var" numeric NOT NULL,
    "n_obs" integer DEFAULT 0,
    "mature" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."athlete_landmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_params" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "param_key" "text" NOT NULL,
    "mean" numeric NOT NULL,
    "variance" numeric NOT NULL,
    "n_obs" integer DEFAULT 0,
    "mature" boolean DEFAULT false,
    "meta" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."athlete_params" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "date" "date" NOT NULL,
    "strength" "jsonb" DEFAULT '{}'::"jsonb",
    "hypertrophy" "jsonb" DEFAULT '{}'::"jsonb",
    "fatigue" "jsonb" DEFAULT '{}'::"jsonb",
    "recovery" "jsonb" DEFAULT '{}'::"jsonb",
    "endurance" "jsonb" DEFAULT '{}'::"jsonb",
    "nutrition" "jsonb" DEFAULT '{}'::"jsonb",
    "goal_weights" "jsonb" DEFAULT '{"physique": 0.20, "strength": 0.40, "buds_readiness": 0.35, "fatigue_minimization": 0.05}'::"jsonb",
    "computed_at" timestamp with time zone DEFAULT "now"(),
    "banister" "jsonb",
    "cellular" "jsonb",
    "vdot_zones" "jsonb",
    "nutrition_modulation" "jsonb",
    "overreach_signal" "jsonb"
);


ALTER TABLE "public"."athlete_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."body_weight_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "weight" numeric NOT NULL,
    "recorded_date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."body_weight_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."capture_inbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "domain" "text",
    "processed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "capture_inbox_domain_check" CHECK (("domain" = ANY (ARRAY['mind'::"text", 'career'::"text", 'training'::"text", 'nutrition'::"text", 'general'::"text"])))
);


ALTER TABLE "public"."capture_inbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cardio_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "cardio_date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cardio_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cardio_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "activity_type" "text",
    "workout_name" "text",
    "start_date" timestamp with time zone,
    "duration_seconds" integer,
    "distance_meters" numeric,
    "calories" integer,
    "avg_heart_rate" integer,
    "strava_id" bigint,
    "map_summary_polyline" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cardio_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."controlled_tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "test_type" "text",
    "target_key" "text",
    "status" "text" DEFAULT 'scheduled'::"text",
    "scheduled_date" "date",
    "started_at" "date",
    "baseline" "jsonb",
    "result" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "controlled_tests_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'active'::"text", 'complete'::"text", 'aborted'::"text"]))),
    CONSTRAINT "controlled_tests_test_type_check" CHECK (("test_type" = ANY (ARRAY['recovery_stress'::"text", 'volume_tolerance'::"text", 'running_tolerance'::"text", 'pst_diagnostic'::"text"])))
);


ALTER TABLE "public"."controlled_tests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "food_name" "text" NOT NULL,
    "calories" numeric DEFAULT 0,
    "protein_grams" numeric DEFAULT 0,
    "carbs_grams" numeric DEFAULT 0,
    "fats_grams" numeric DEFAULT 0,
    "serving_size" numeric DEFAULT 1,
    "serving_unit" "text" DEFAULT 'serving'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."custom_foods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_briefs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "brief_json" "jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "model_used" "text",
    "input_tokens" integer,
    "output_tokens" integer,
    "cache_read_tokens" integer
);


ALTER TABLE "public"."daily_briefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_readiness" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "date" "date" NOT NULL,
    "energy" integer,
    "mood" integer,
    "soreness" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sleep_score" integer,
    "soreness_score" integer,
    "stress_score" integer,
    "checkin_date" "date",
    "soreness_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "daily_readiness_energy_check" CHECK ((("energy" >= 1) AND ("energy" <= 10))),
    CONSTRAINT "daily_readiness_mood_check" CHECK ((("mood" >= 1) AND ("mood" <= 10))),
    CONSTRAINT "daily_readiness_soreness_check" CHECK ((("soreness" >= 1) AND ("soreness" <= 5)))
);


ALTER TABLE "public"."daily_readiness" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "template_id" "uuid",
    "title" "text" NOT NULL,
    "domain" "text",
    "target" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "completed_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "daily_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."daily_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diet_phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "phase_type" "text" NOT NULL,
    "calorie_adjustment" integer DEFAULT 0,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "weekly_rate" numeric,
    "target_weight" numeric,
    "starting_weight" numeric,
    "starting_calories" numeric,
    CONSTRAINT "diet_phases_phase_type_check" CHECK (("phase_type" = ANY (ARRAY['bulk'::"text", 'cut'::"text", 'maintain'::"text", 'reverse'::"text"])))
);


ALTER TABLE "public"."diet_phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."engine_params" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "kalman_state" "jsonb",
    "rls_params" "jsonb",
    "cellular_state" "jsonb",
    "vdot_state" "jsonb",
    "guardrail_state" "jsonb",
    "computed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."engine_params" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "exercise_name" "text" NOT NULL,
    "reaction" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "date" "date" NOT NULL,
    "meal_type" "text" DEFAULT 'snack'::"text" NOT NULL,
    "food_name" "text" NOT NULL,
    "calories" numeric DEFAULT 0,
    "protein_grams" numeric DEFAULT 0,
    "carbs_grams" numeric DEFAULT 0,
    "fats_grams" numeric DEFAULT 0,
    "serving_size" numeric DEFAULT 1,
    "serving_unit" "text" DEFAULT 'serving'::"text",
    "brand_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "planned" boolean DEFAULT false NOT NULL,
    "tag" "text"
);


ALTER TABLE "public"."food_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garmin_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "activity_id" bigint NOT NULL,
    "activity_date" "date" NOT NULL,
    "activity_type" "text" NOT NULL,
    "name" "text",
    "duration_seconds" integer,
    "distance_meters" numeric,
    "avg_hr" integer,
    "max_hr" integer,
    "calories" integer,
    "avg_pace_sec_per_km" numeric,
    "avg_speed_mps" numeric,
    "training_load" numeric,
    "aerobic_effect" numeric,
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."garmin_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."garmin_tokens" (
    "created_by" "uuid" NOT NULL,
    "oauth_token" "text" NOT NULL,
    "oauth_token_secret" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "oauth2_token" "text",
    "oauth2_expires_at" timestamp with time zone
);


ALTER TABLE "public"."garmin_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "company" "text" NOT NULL,
    "role" "text" NOT NULL,
    "date_applied" "date",
    "status" "text" DEFAULT 'applied'::"text",
    "notes" "text",
    "next_action" "text",
    "next_action_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "job_applications_status_check" CHECK (("status" = ANY (ARRAY['applied'::"text", 'screening'::"text", 'interview'::"text", 'offer'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."job_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "name" "text" NOT NULL,
    "foods" "jsonb" DEFAULT '[]'::"jsonb",
    "total_calories" numeric DEFAULT 0,
    "total_protein" numeric DEFAULT 0,
    "total_carbs" numeric DEFAULT 0,
    "total_fats" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_favorite" boolean DEFAULT false NOT NULL,
    "template_type" "text" DEFAULT 'meal'::"text" NOT NULL,
    "meal_type" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."meal_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."measurements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "chest_cm" numeric,
    "waist_cm" numeric,
    "hips_cm" numeric,
    "left_arm_cm" numeric,
    "right_arm_cm" numeric,
    "left_quad_cm" numeric,
    "right_quad_cm" numeric,
    "neck_cm" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."measurements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "month" "date" NOT NULL,
    "what_worked" "text",
    "what_didnt" "text",
    "next_month_goals" "text",
    "ai_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."monthly_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."networking_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "person_name" "text" NOT NULL,
    "company" "text",
    "interaction_type" "text",
    "date" "date" NOT NULL,
    "notes" "text",
    "follow_up_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."networking_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "action" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nutrition_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."physique_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "photo_path" "text" NOT NULL,
    "media_type" "text" DEFAULT 'photo'::"text",
    "taken_at" "date" DEFAULT CURRENT_DATE,
    "weight_lb" numeric,
    "bodyfat_estimate" numeric,
    "confidence" "text",
    "analysis" "jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pose" "text",
    CONSTRAINT "physique_entries_media_type_check" CHECK (("media_type" = ANY (ARRAY['photo'::"text", 'video'::"text"])))
);


ALTER TABLE "public"."physique_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "current_week" integer DEFAULT 1,
    "current_day" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text",
    "progression_state" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_workouts" "jsonb" DEFAULT '[]'::"jsonb",
    "current_day_index" integer DEFAULT 1,
    "current_cycle" integer DEFAULT 1,
    CONSTRAINT "program_enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."program_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "created_by" "text" NOT NULL,
    "title" "text" NOT NULL,
    "focus" "text",
    "day_of_week" integer,
    "week_number" integer DEFAULT 1,
    "day_index" integer DEFAULT 0,
    "exercises" "jsonb" DEFAULT '[]'::"jsonb",
    "duration_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "scheduled_date" "date",
    "cardio_sessions" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."program_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "focus" "text",
    "duration_weeks" integer,
    "days_per_week" integer,
    "difficulty" "text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "schema_version" integer DEFAULT 1,
    "num_cycles" integer DEFAULT 1,
    "tags" "text"[]
);


ALTER TABLE "public"."programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progress_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "storage_path" "text" NOT NULL,
    "angle" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "progress_photos_angle_check" CHECK (("angle" = ANY (ARRAY['front'::"text", 'side'::"text", 'back'::"text"])))
);


ALTER TABLE "public"."progress_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pst_tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "test_date" "date" NOT NULL,
    "swim_seconds" integer,
    "pushups" integer,
    "situps" integer,
    "pullups" integer,
    "run_seconds" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "run_4mile_seconds" integer
);


ALTER TABLE "public"."pst_tests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text",
    "auth" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reading_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "author" "text",
    "category" "text",
    "status" "text" DEFAULT 'want-to-read'::"text",
    "rating" integer,
    "started_at" "date",
    "finished_at" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reading_log_category_check" CHECK (("category" = ANY (ARRAY['technical'::"text", 'business'::"text", 'philosophy'::"text", 'other'::"text"]))),
    CONSTRAINT "reading_log_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reading_log_status_check" CHECK (("status" = ANY (ARRAY['reading'::"text", 'finished'::"text", 'paused'::"text", 'want-to-read'::"text"])))
);


ALTER TABLE "public"."reading_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "name" "text" NOT NULL,
    "ingredients" "jsonb" DEFAULT '[]'::"jsonb",
    "instructions" "text",
    "calories" numeric DEFAULT 0,
    "protein_grams" numeric DEFAULT 0,
    "carbs_grams" numeric DEFAULT 0,
    "fats_grams" numeric DEFAULT 0,
    "servings" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recovery_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "hrv" numeric,
    "sleep_score" integer,
    "sleep_duration_min" integer,
    "body_battery" integer,
    "resting_hr" integer,
    "vo2max_run" numeric,
    "vo2max_cycling" numeric,
    "training_load_acute" numeric,
    "training_load_chronic" numeric,
    "stress_score" integer,
    "steps" integer,
    "active_calories" integer,
    "tss_run" numeric,
    "tss_cycling" numeric,
    "tss_swim" numeric,
    "ah_hrv" numeric,
    "ah_sleep_min" integer,
    "ah_resting_hr" integer,
    "ah_weight" numeric,
    "ah_active_energy_kcal" numeric,
    "ah_steps" integer,
    "source" "text",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "recovery_metrics_source_check" CHECK (("source" = ANY (ARRAY['garmin'::"text", 'apple_health'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."recovery_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "level" integer DEFAULT 1,
    "last_practiced_at" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "skills_level_check" CHECK ((("level" >= 1) AND ("level" <= 5)))
);


ALTER TABLE "public"."skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."soreness_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "date" "date" NOT NULL,
    "muscle_group" "text" NOT NULL,
    "level" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "soreness_logs_level_check" CHECK ((("level" >= 0) AND ("level" <= 3)))
);


ALTER TABLE "public"."soreness_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "topic" "text" NOT NULL,
    "duration_min" integer NOT NULL,
    "medium" "text",
    "notes" "text",
    "logged_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "study_log_medium_check" CHECK (("medium" = ANY (ARRAY['video'::"text", 'book'::"text", 'project'::"text", 'course'::"text", 'article'::"text"])))
);


ALTER TABLE "public"."study_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplement_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "supplement_type_id" "uuid",
    "supplement_name" "text" NOT NULL,
    "dose" numeric,
    "unit" "text",
    "taken_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."supplement_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplement_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "default_dose" numeric,
    "unit" "text",
    "timing_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supplement_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "source_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "domain" "text",
    "goal" "text",
    "recurrence" "text" DEFAULT 'daily'::"text" NOT NULL,
    "days_of_week" integer[],
    "target" "text",
    "sort_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "task_templates_domain_check" CHECK (("domain" = ANY (ARRAY['mind'::"text", 'career'::"text", 'training'::"text", 'nutrition'::"text", 'general'::"text"]))),
    CONSTRAINT "task_templates_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['daily'::"text", 'weekdays'::"text", 'weekly'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."task_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "text" "text" NOT NULL,
    "domain" "text",
    "source" "text",
    "completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "todos_domain_check" CHECK (("domain" = ANY (ARRAY['training'::"text", 'nutrition'::"text", 'career'::"text", 'mind'::"text", 'recovery'::"text", 'admin'::"text"]))),
    CONSTRAINT "todos_source_check" CHECK (("source" = ANY (ARRAY['ai_generated'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."todos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_prescription" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "session_type" "text",
    "mpc_action" "text",
    "mpc_intensity" numeric(4,2),
    "mpc_action_scores" "jsonb",
    "w_pst" numeric(4,3),
    "w_str" numeric(4,3),
    "prescription" "jsonb",
    "rationale" "text",
    "banister_state" "jsonb",
    "interference" "jsonb",
    "overreach" "jsonb",
    "acwr" numeric(5,3),
    "interference_warning" "text",
    "computed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."training_prescription" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usda_request_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."usda_request_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "display_name" "text",
    "username" "text",
    "bio" "text",
    "privacy_level" "text" DEFAULT 'private'::"text",
    "weight_unit" "text" DEFAULT 'lbs'::"text",
    "height_cm" numeric,
    "height_unit" "text" DEFAULT 'in'::"text",
    "age" integer,
    "sex" "text",
    "activity_level" "text",
    "daily_calorie_goal" integer DEFAULT 2000,
    "daily_protein_goal" integer DEFAULT 150,
    "daily_carbs_goal" integer DEFAULT 200,
    "daily_fats_goal" integer DEFAULT 65,
    "tdee_override" numeric,
    "current_weight" numeric,
    "checkin_day" integer DEFAULT 0,
    "fitness_level" "text",
    "primary_goal" "jsonb" DEFAULT '[]'::"jsonb",
    "available_equipment" "jsonb" DEFAULT '[]'::"jsonb",
    "days_per_week" integer DEFAULT 3,
    "workout_duration_preference" "text",
    "injuries_limitations" "text",
    "exercises_per_day" integer,
    "include_cardio" boolean DEFAULT false,
    "skip_deload" boolean DEFAULT false,
    "show_rir" boolean DEFAULT true,
    "adaptive_training" boolean DEFAULT false,
    "timezone" "text" DEFAULT 'America/New_York'::"text",
    "strava_access_token" "text",
    "strava_refresh_token" "text",
    "strava_expires_at" bigint,
    "strava_athlete_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "race_date" "date",
    "race_name" "text",
    "race_type" "text",
    "training_phase" "text",
    "ironman_target_hours" numeric DEFAULT 10.0,
    "primary_sport_focus" "text" DEFAULT 'concurrent'::"text",
    "maintenance_kcal" numeric(7,1) DEFAULT 3200.0,
    "goal_priorities" "jsonb",
    "diet_phase" "text",
    CONSTRAINT "user_profiles_diet_phase_check" CHECK (("diet_phase" = ANY (ARRAY['cut'::"text", 'maintain'::"text", 'bulk'::"text"]))),
    CONSTRAINT "user_profiles_primary_sport_focus_check" CHECK (("primary_sport_focus" = ANY (ARRAY['strength'::"text", 'endurance'::"text", 'concurrent'::"text"]))),
    CONSTRAINT "user_profiles_race_type_check" CHECK (("race_type" = ANY (ARRAY['ironman'::"text", '70.3'::"text", 'olympic'::"text", 'sprint'::"text", 'marathon'::"text", 'half_marathon'::"text", 'other'::"text", 'military_fitness'::"text"]))),
    CONSTRAINT "user_profiles_training_phase_check" CHECK (("training_phase" = ANY (ARRAY['base'::"text", 'build'::"text", 'peak'::"text", 'taper'::"text", 'off_season'::"text", 'maintenance'::"text", 'buds_prep'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."water_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "amount_ml" integer NOT NULL,
    "logged_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."water_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "week_start" "date" NOT NULL,
    "weight" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "set_targets" "jsonb" NOT NULL,
    "frequency_targets" "jsonb" NOT NULL,
    "run_plan" "jsonb" NOT NULL,
    "two_a_day_days" integer[],
    "rationale" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "workout_id" "uuid",
    "workout_schedule_id" "uuid",
    "program_id" "uuid",
    "enrollment_id" "uuid",
    "log_date" "date" NOT NULL,
    "exercises" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "duration_seconds" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pre_note" "text",
    "post_note" "text"
);


ALTER TABLE "public"."workout_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "workout_id" "uuid",
    "program_id" "uuid",
    "program_workout_id" "uuid",
    "enrollment_id" "uuid",
    "scheduled_date" "date" NOT NULL,
    "time_of_day" "text" DEFAULT 'anytime'::"text",
    "completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."workout_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "workout_id" "uuid",
    "program_workout_id" "uuid",
    "enrollment_id" "uuid",
    "exercises" "jsonb" DEFAULT '[]'::"jsonb",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'in_progress'::"text" NOT NULL,
    "start_time" timestamp with time zone,
    "notes" "text"
);


ALTER TABLE "public"."workout_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "focus" "text",
    "duration_minutes" integer,
    "exercises" "jsonb" DEFAULT '[]'::"jsonb",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "folder" "text"
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."athlete_goals"
    ADD CONSTRAINT "athlete_goals_created_by_source_key_key" UNIQUE ("created_by", "source_key");



ALTER TABLE ONLY "public"."athlete_goals"
    ADD CONSTRAINT "athlete_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_landmarks"
    ADD CONSTRAINT "athlete_landmarks_created_by_muscle_key" UNIQUE ("created_by", "muscle");



ALTER TABLE ONLY "public"."athlete_landmarks"
    ADD CONSTRAINT "athlete_landmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_params"
    ADD CONSTRAINT "athlete_params_created_by_param_key_key" UNIQUE ("created_by", "param_key");



ALTER TABLE ONLY "public"."athlete_params"
    ADD CONSTRAINT "athlete_params_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_state"
    ADD CONSTRAINT "athlete_state_created_by_date_key" UNIQUE ("created_by", "date");



ALTER TABLE ONLY "public"."athlete_state"
    ADD CONSTRAINT "athlete_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."body_weight_entries"
    ADD CONSTRAINT "body_weight_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."capture_inbox"
    ADD CONSTRAINT "capture_inbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cardio_completions"
    ADD CONSTRAINT "cardio_completions_created_by_cardio_date_name_key" UNIQUE ("created_by", "cardio_date", "name");



ALTER TABLE ONLY "public"."cardio_completions"
    ADD CONSTRAINT "cardio_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cardio_sessions"
    ADD CONSTRAINT "cardio_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cardio_sessions"
    ADD CONSTRAINT "cardio_sessions_strava_id_key" UNIQUE ("strava_id");



ALTER TABLE ONLY "public"."controlled_tests"
    ADD CONSTRAINT "controlled_tests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_foods"
    ADD CONSTRAINT "custom_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_briefs"
    ADD CONSTRAINT "daily_briefs_date_key" UNIQUE ("date");



ALTER TABLE ONLY "public"."daily_briefs"
    ADD CONSTRAINT "daily_briefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_readiness"
    ADD CONSTRAINT "daily_readiness_created_by_date_key" UNIQUE ("created_by", "date");



ALTER TABLE ONLY "public"."daily_readiness"
    ADD CONSTRAINT "daily_readiness_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_tasks"
    ADD CONSTRAINT "daily_tasks_created_by_date_template_id_key" UNIQUE ("created_by", "date", "template_id");



ALTER TABLE ONLY "public"."daily_tasks"
    ADD CONSTRAINT "daily_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."diet_phases"
    ADD CONSTRAINT "diet_phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."engine_params"
    ADD CONSTRAINT "engine_params_created_by_date_key" UNIQUE ("created_by", "date");



ALTER TABLE ONLY "public"."engine_params"
    ADD CONSTRAINT "engine_params_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_reactions"
    ADD CONSTRAINT "exercise_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_entries"
    ADD CONSTRAINT "food_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."garmin_activities"
    ADD CONSTRAINT "garmin_activities_created_by_activity_id_key" UNIQUE ("created_by", "activity_id");



ALTER TABLE ONLY "public"."garmin_activities"
    ADD CONSTRAINT "garmin_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."garmin_tokens"
    ADD CONSTRAINT "garmin_tokens_pkey" PRIMARY KEY ("created_by");



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_templates"
    ADD CONSTRAINT "meal_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."measurements"
    ADD CONSTRAINT "measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_reviews"
    ADD CONSTRAINT "monthly_reviews_month_key" UNIQUE ("month");



ALTER TABLE ONLY "public"."monthly_reviews"
    ADD CONSTRAINT "monthly_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."networking_log"
    ADD CONSTRAINT "networking_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_overrides"
    ADD CONSTRAINT "nutrition_overrides_created_by_date_key" UNIQUE ("created_by", "date");



ALTER TABLE ONLY "public"."nutrition_overrides"
    ADD CONSTRAINT "nutrition_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."physique_entries"
    ADD CONSTRAINT "physique_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_enrollments"
    ADD CONSTRAINT "program_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_workouts"
    ADD CONSTRAINT "program_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_workouts"
    ADD CONSTRAINT "program_workouts_program_scheduled_date_key" UNIQUE ("program_id", "scheduled_date");



ALTER TABLE ONLY "public"."programs"
    ADD CONSTRAINT "programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pst_tests"
    ADD CONSTRAINT "pst_tests_created_by_test_date_key" UNIQUE ("created_by", "test_date");



ALTER TABLE ONLY "public"."pst_tests"
    ADD CONSTRAINT "pst_tests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_created_by_endpoint_key" UNIQUE ("created_by", "endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reading_log"
    ADD CONSTRAINT "reading_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recovery_metrics"
    ADD CONSTRAINT "recovery_metrics_created_by_date_source_key" UNIQUE ("created_by", "date", "source");



ALTER TABLE ONLY "public"."recovery_metrics"
    ADD CONSTRAINT "recovery_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."skills"
    ADD CONSTRAINT "skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."soreness_logs"
    ADD CONSTRAINT "soreness_logs_created_by_date_muscle_group_key" UNIQUE ("created_by", "date", "muscle_group");



ALTER TABLE ONLY "public"."soreness_logs"
    ADD CONSTRAINT "soreness_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_log"
    ADD CONSTRAINT "study_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplement_logs"
    ADD CONSTRAINT "supplement_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplement_types"
    ADD CONSTRAINT "supplement_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_created_by_source_key_key" UNIQUE ("created_by", "source_key");



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_prescription"
    ADD CONSTRAINT "training_prescription_created_by_date_key" UNIQUE ("created_by", "date");



ALTER TABLE ONLY "public"."training_prescription"
    ADD CONSTRAINT "training_prescription_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usda_request_log"
    ADD CONSTRAINT "usda_request_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_created_by_key" UNIQUE ("created_by");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."water_logs"
    ADD CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_created_by_week_start_key" UNIQUE ("created_by", "week_start");



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_plans"
    ADD CONSTRAINT "weekly_plans_created_by_week_start_key" UNIQUE ("created_by", "week_start");



ALTER TABLE ONLY "public"."weekly_plans"
    ADD CONSTRAINT "weekly_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_schedules"
    ADD CONSTRAINT "workout_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "cardio_completions_user_date_idx" ON "public"."cardio_completions" USING "btree" ("created_by", "cardio_date");



CREATE INDEX "engine_params_by_date" ON "public"."engine_params" USING "btree" ("created_by", "date" DESC);



CREATE INDEX "idx_body_weight_user_date" ON "public"."body_weight_entries" USING "btree" ("created_by", "recorded_date" DESC);



CREATE INDEX "idx_cardio_user_date" ON "public"."cardio_sessions" USING "btree" ("created_by", "start_date" DESC);



CREATE INDEX "idx_daily_tasks_today" ON "public"."daily_tasks" USING "btree" ("created_by", "date", "status");



CREATE INDEX "idx_food_entries_user_date" ON "public"."food_entries" USING "btree" ("created_by", "date" DESC);



CREATE INDEX "idx_goals_user_active" ON "public"."athlete_goals" USING "btree" ("created_by", "active");



CREATE INDEX "idx_landmarks_user" ON "public"."athlete_landmarks" USING "btree" ("created_by");



CREATE INDEX "idx_params_user" ON "public"."athlete_params" USING "btree" ("created_by");



CREATE INDEX "idx_physique_entries_user" ON "public"."physique_entries" USING "btree" ("created_by", "taken_at" DESC);



CREATE INDEX "idx_physique_pose" ON "public"."physique_entries" USING "btree" ("created_by", "pose", "taken_at" DESC);



CREATE INDEX "idx_plans_user_week" ON "public"."weekly_plans" USING "btree" ("created_by", "week_start" DESC);



CREATE INDEX "idx_program_workouts_program" ON "public"."program_workouts" USING "btree" ("program_id");



CREATE INDEX "idx_schedules_user_date" ON "public"."workout_schedules" USING "btree" ("created_by", "scheduled_date");



CREATE INDEX "idx_task_templates_active" ON "public"."task_templates" USING "btree" ("created_by", "active");



CREATE INDEX "idx_tests_user_status" ON "public"."controlled_tests" USING "btree" ("created_by", "status");



CREATE INDEX "idx_workout_logs_user" ON "public"."workout_logs" USING "btree" ("created_by", "created_at" DESC);



CREATE INDEX "idx_workout_logs_user_date" ON "public"."workout_logs" USING "btree" ("created_by", "log_date" DESC);



CREATE INDEX "idx_workouts_user" ON "public"."workouts" USING "btree" ("created_by", "created_at" DESC);



CREATE UNIQUE INDEX "soreness_logs_created_by_date_muscle_key" ON "public"."soreness_logs" USING "btree" ("created_by", "date", "muscle_group");



CREATE INDEX "training_prescription_by_date" ON "public"."training_prescription" USING "btree" ("created_by", "date" DESC);



CREATE INDEX "usda_request_log_user_id_created_at_idx" ON "public"."usda_request_log" USING "btree" ("user_id", "created_at");



CREATE OR REPLACE TRIGGER "trg_task_templates_updated" BEFORE UPDATE ON "public"."task_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."athlete_goals"
    ADD CONSTRAINT "athlete_goals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."athlete_landmarks"
    ADD CONSTRAINT "athlete_landmarks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."athlete_params"
    ADD CONSTRAINT "athlete_params_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."capture_inbox"
    ADD CONSTRAINT "capture_inbox_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cardio_completions"
    ADD CONSTRAINT "cardio_completions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."controlled_tests"
    ADD CONSTRAINT "controlled_tests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."daily_briefs"
    ADD CONSTRAINT "daily_briefs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."daily_tasks"
    ADD CONSTRAINT "daily_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."daily_tasks"
    ADD CONSTRAINT "daily_tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."engine_params"
    ADD CONSTRAINT "engine_params_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_reactions"
    ADD CONSTRAINT "exercise_reactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."garmin_tokens"
    ADD CONSTRAINT "garmin_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_applications"
    ADD CONSTRAINT "job_applications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."measurements"
    ADD CONSTRAINT "measurements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."monthly_reviews"
    ADD CONSTRAINT "monthly_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."networking_log"
    ADD CONSTRAINT "networking_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."nutrition_overrides"
    ADD CONSTRAINT "nutrition_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."physique_entries"
    ADD CONSTRAINT "physique_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."program_enrollments"
    ADD CONSTRAINT "program_enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_workouts"
    ADD CONSTRAINT "program_workouts_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."reading_log"
    ADD CONSTRAINT "reading_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."recovery_metrics"
    ADD CONSTRAINT "recovery_metrics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."skills"
    ADD CONSTRAINT "skills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."study_log"
    ADD CONSTRAINT "study_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."supplement_logs"
    ADD CONSTRAINT "supplement_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."supplement_logs"
    ADD CONSTRAINT "supplement_logs_supplement_type_id_fkey" FOREIGN KEY ("supplement_type_id") REFERENCES "public"."supplement_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplement_types"
    ADD CONSTRAINT "supplement_types_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."training_prescription"
    ADD CONSTRAINT "training_prescription_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usda_request_log"
    ADD CONSTRAINT "usda_request_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."water_logs"
    ADD CONSTRAINT "water_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."weekly_plans"
    ADD CONSTRAINT "weekly_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_workout_schedule_id_fkey" FOREIGN KEY ("workout_schedule_id") REFERENCES "public"."workout_schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_schedules"
    ADD CONSTRAINT "workout_schedules_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE SET NULL;



CREATE POLICY "Personal OS all access briefs" ON "public"."daily_briefs" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access capture" ON "public"."capture_inbox" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access job_applications" ON "public"."job_applications" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access measurements" ON "public"."measurements" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access monthly_reviews" ON "public"."monthly_reviews" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access networking_log" ON "public"."networking_log" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access progress_photos" ON "public"."progress_photos" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access reactions" ON "public"."exercise_reactions" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access reading_log" ON "public"."reading_log" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access recovery" ON "public"."recovery_metrics" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access skills" ON "public"."skills" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access study_log" ON "public"."study_log" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access supplement_logs" ON "public"."supplement_logs" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access supplement_types" ON "public"."supplement_types" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access todos" ON "public"."todos" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Personal OS all access water_logs" ON "public"."water_logs" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can insert own usda logs" ON "public"."usda_request_log" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own athlete_state" ON "public"."athlete_state" USING (("created_by" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can manage own pst_tests" ON "public"."pst_tests" USING (("created_by" = ("auth"."uid"())::"text"));



CREATE POLICY "Users can view own usda logs" ON "public"."usda_request_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see own activities" ON "public"."garmin_activities" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



ALTER TABLE "public"."athlete_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athlete_landmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athlete_params" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athlete_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."body_weight_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."capture_inbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cardio_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cardio_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."controlled_tests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_briefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_readiness" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."diet_phases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."engine_params" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "engine_params_own" ON "public"."engine_params" USING (("auth"."uid"() = "created_by"));



ALTER TABLE "public"."exercise_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."garmin_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."garmin_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "garmin_tokens_own" ON "public"."garmin_tokens" USING (("auth"."uid"() = "created_by"));



ALTER TABLE "public"."job_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."measurements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."networking_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own daily tasks" ON "public"."daily_tasks" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "own goals" ON "public"."athlete_goals" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "own landmarks" ON "public"."athlete_landmarks" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "own overrides" ON "public"."nutrition_overrides" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "own params" ON "public"."athlete_params" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "own physique entries" ON "public"."physique_entries" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "own plans" ON "public"."weekly_plans" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "own push subscriptions" ON "public"."push_subscriptions" USING ((("auth"."uid"())::"text" = "created_by")) WITH CHECK ((("auth"."uid"())::"text" = "created_by"));



CREATE POLICY "own templates" ON "public"."task_templates" USING (("auth"."uid"() = "created_by"));



CREATE POLICY "own tests" ON "public"."controlled_tests" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



ALTER TABLE "public"."physique_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_workouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."progress_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pst_tests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reading_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recovery_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."soreness_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplement_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplement_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."todos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_prescription" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_prescription_own" ON "public"."training_prescription" USING (("auth"."uid"() = "created_by"));



ALTER TABLE "public"."usda_request_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user owns cardio" ON "public"."cardio_sessions" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns cardio_completions" ON "public"."cardio_completions" TO "authenticated" USING (("auth"."uid"() = "created_by")) WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "user owns checkins" ON "public"."weekly_checkins" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns custom foods" ON "public"."custom_foods" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns diet phases" ON "public"."diet_phases" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns enrollments" ON "public"."program_enrollments" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns food entries" ON "public"."food_entries" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns meal templates" ON "public"."meal_templates" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns profile" ON "public"."user_profiles" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns program workouts" ON "public"."program_workouts" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns programs" ON "public"."programs" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns push subs" ON "public"."push_subscriptions" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns readiness" ON "public"."daily_readiness" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns recipes" ON "public"."recipes" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns schedules" ON "public"."workout_schedules" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns sessions" ON "public"."workout_sessions" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns soreness logs" ON "public"."soreness_logs" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns weight entries" ON "public"."body_weight_entries" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns workout logs" ON "public"."workout_logs" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



CREATE POLICY "user owns workouts" ON "public"."workouts" TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid"))::"text" = "created_by"));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."water_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































REVOKE ALL ON FUNCTION "public"."delete_user_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_user_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."materialize_daily_tasks"("p_user" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."materialize_daily_tasks"("p_user" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
























GRANT ALL ON TABLE "public"."athlete_goals" TO "anon";
GRANT ALL ON TABLE "public"."athlete_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_goals" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_landmarks" TO "anon";
GRANT ALL ON TABLE "public"."athlete_landmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_landmarks" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_params" TO "anon";
GRANT ALL ON TABLE "public"."athlete_params" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_params" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_state" TO "anon";
GRANT ALL ON TABLE "public"."athlete_state" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_state" TO "service_role";



GRANT ALL ON TABLE "public"."body_weight_entries" TO "anon";
GRANT ALL ON TABLE "public"."body_weight_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."body_weight_entries" TO "service_role";



GRANT ALL ON TABLE "public"."capture_inbox" TO "anon";
GRANT ALL ON TABLE "public"."capture_inbox" TO "authenticated";
GRANT ALL ON TABLE "public"."capture_inbox" TO "service_role";



GRANT ALL ON TABLE "public"."cardio_completions" TO "anon";
GRANT ALL ON TABLE "public"."cardio_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."cardio_completions" TO "service_role";



GRANT ALL ON TABLE "public"."cardio_sessions" TO "anon";
GRANT ALL ON TABLE "public"."cardio_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."cardio_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."controlled_tests" TO "anon";
GRANT ALL ON TABLE "public"."controlled_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."controlled_tests" TO "service_role";



GRANT ALL ON TABLE "public"."custom_foods" TO "anon";
GRANT ALL ON TABLE "public"."custom_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_foods" TO "service_role";



GRANT ALL ON TABLE "public"."daily_briefs" TO "anon";
GRANT ALL ON TABLE "public"."daily_briefs" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_briefs" TO "service_role";



GRANT ALL ON TABLE "public"."daily_readiness" TO "anon";
GRANT ALL ON TABLE "public"."daily_readiness" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_readiness" TO "service_role";



GRANT ALL ON TABLE "public"."daily_tasks" TO "anon";
GRANT ALL ON TABLE "public"."daily_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."diet_phases" TO "anon";
GRANT ALL ON TABLE "public"."diet_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."diet_phases" TO "service_role";



GRANT ALL ON TABLE "public"."engine_params" TO "anon";
GRANT ALL ON TABLE "public"."engine_params" TO "authenticated";
GRANT ALL ON TABLE "public"."engine_params" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_reactions" TO "anon";
GRANT ALL ON TABLE "public"."exercise_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."food_entries" TO "anon";
GRANT ALL ON TABLE "public"."food_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."food_entries" TO "service_role";



GRANT ALL ON TABLE "public"."garmin_activities" TO "anon";
GRANT ALL ON TABLE "public"."garmin_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."garmin_activities" TO "service_role";



GRANT ALL ON TABLE "public"."garmin_tokens" TO "anon";
GRANT ALL ON TABLE "public"."garmin_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."garmin_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."job_applications" TO "anon";
GRANT ALL ON TABLE "public"."job_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."job_applications" TO "service_role";



GRANT ALL ON TABLE "public"."meal_templates" TO "anon";
GRANT ALL ON TABLE "public"."meal_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_templates" TO "service_role";



GRANT ALL ON TABLE "public"."measurements" TO "anon";
GRANT ALL ON TABLE "public"."measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."measurements" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_reviews" TO "anon";
GRANT ALL ON TABLE "public"."monthly_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."networking_log" TO "anon";
GRANT ALL ON TABLE "public"."networking_log" TO "authenticated";
GRANT ALL ON TABLE "public"."networking_log" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_overrides" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."physique_entries" TO "anon";
GRANT ALL ON TABLE "public"."physique_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."physique_entries" TO "service_role";



GRANT ALL ON TABLE "public"."program_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."program_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."program_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."program_workouts" TO "anon";
GRANT ALL ON TABLE "public"."program_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."program_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."programs" TO "anon";
GRANT ALL ON TABLE "public"."programs" TO "authenticated";
GRANT ALL ON TABLE "public"."programs" TO "service_role";



GRANT ALL ON TABLE "public"."progress_photos" TO "anon";
GRANT ALL ON TABLE "public"."progress_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_photos" TO "service_role";



GRANT ALL ON TABLE "public"."pst_tests" TO "anon";
GRANT ALL ON TABLE "public"."pst_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."pst_tests" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."reading_log" TO "anon";
GRANT ALL ON TABLE "public"."reading_log" TO "authenticated";
GRANT ALL ON TABLE "public"."reading_log" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."recovery_metrics" TO "anon";
GRANT ALL ON TABLE "public"."recovery_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."recovery_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."skills" TO "anon";
GRANT ALL ON TABLE "public"."skills" TO "authenticated";
GRANT ALL ON TABLE "public"."skills" TO "service_role";



GRANT ALL ON TABLE "public"."soreness_logs" TO "anon";
GRANT ALL ON TABLE "public"."soreness_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."soreness_logs" TO "service_role";



GRANT ALL ON TABLE "public"."study_log" TO "anon";
GRANT ALL ON TABLE "public"."study_log" TO "authenticated";
GRANT ALL ON TABLE "public"."study_log" TO "service_role";



GRANT ALL ON TABLE "public"."supplement_logs" TO "anon";
GRANT ALL ON TABLE "public"."supplement_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."supplement_logs" TO "service_role";



GRANT ALL ON TABLE "public"."supplement_types" TO "anon";
GRANT ALL ON TABLE "public"."supplement_types" TO "authenticated";
GRANT ALL ON TABLE "public"."supplement_types" TO "service_role";



GRANT ALL ON TABLE "public"."task_templates" TO "anon";
GRANT ALL ON TABLE "public"."task_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."task_templates" TO "service_role";



GRANT ALL ON TABLE "public"."todos" TO "anon";
GRANT ALL ON TABLE "public"."todos" TO "authenticated";
GRANT ALL ON TABLE "public"."todos" TO "service_role";



GRANT ALL ON TABLE "public"."training_prescription" TO "anon";
GRANT ALL ON TABLE "public"."training_prescription" TO "authenticated";
GRANT ALL ON TABLE "public"."training_prescription" TO "service_role";



GRANT ALL ON TABLE "public"."usda_request_log" TO "anon";
GRANT ALL ON TABLE "public"."usda_request_log" TO "authenticated";
GRANT ALL ON TABLE "public"."usda_request_log" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."water_logs" TO "anon";
GRANT ALL ON TABLE "public"."water_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."water_logs" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_checkins" TO "anon";
GRANT ALL ON TABLE "public"."weekly_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_plans" TO "anon";
GRANT ALL ON TABLE "public"."weekly_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_plans" TO "service_role";



GRANT ALL ON TABLE "public"."workout_logs" TO "anon";
GRANT ALL ON TABLE "public"."workout_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_logs" TO "service_role";



GRANT ALL ON TABLE "public"."workout_schedules" TO "anon";
GRANT ALL ON TABLE "public"."workout_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."workout_sessions" TO "anon";
GRANT ALL ON TABLE "public"."workout_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."workouts" TO "anon";
GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































