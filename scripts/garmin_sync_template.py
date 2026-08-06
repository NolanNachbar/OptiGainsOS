import os
import sys
import json
import requests
from datetime import date, timedelta
from garminconnect import Garmin

# --- CONFIGURATION ---
# It's recommended to set these in your local environment variables
GARMIN_EMAIL = os.getenv("GARMIN_EMAIL")
GARMIN_PASSWORD = os.getenv("GARMIN_PASSWORD")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def sync_garmin():
    if not all([GARMIN_EMAIL, GARMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY]):
        print("Error: Missing environment variables.")
        sys.exit(1)

    try:
        # 1. Initialize Garmin Client
        print(f"Connecting to Garmin Connect as {GARMIN_EMAIL}...")
        client = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        client.login()

        today = date.today().isoformat()
        
        # 2. Pull Daily Stats
        print(f"Pulling data for {today}...")
        stats = client.get_stats(today)
        rhr = client.get_rhr(today)
        hrv = client.get_hrv_data(today)
        sleep = client.get_sleep_data(today)
        
        # Extract specific metrics
        body_battery = None
        stress_score = None
        steps = stats.get('totalSteps')
        active_calories = stats.get('activeCalories')

        # Garmin's JSON structure can be nested; extract safely
        # Note: This is a template, specific keys might vary based on lib version
        if 'bodyBatteryMostRecentValue' in stats:
            body_battery = stats['bodyBatteryMostRecentValue']
        
        # 3. Assemble Payload for Supabase
        payload = {
            "date": today,
            "hrv": hrv.get('lastNightAvg') if hrv else None,
            "resting_hr": rhr,
            "sleep_score": sleep.get('dailySleepDTO', {}).get('sleepScore') if sleep else None,
            "sleep_duration_min": sleep.get('dailySleepDTO', {}).get('sleepTimeSeconds', 0) // 60 if sleep else 0,
            "body_battery": body_battery,
            "steps": steps,
            "active_calories": active_calories,
            "source": "garmin"
        }

        print("Payload assembled:", json.dumps(payload, indent=2))

        # 4. Push to Supabase
        # We use the Service Role key to bypass RLS for the sync agent
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates" # Upsert behavior
        }
        
        # Resolve the UID (Personal OS model). Prefer the pinned USER_ID; only fall
        # back to the DB when exactly one profile exists. Two live here (the real
        # athlete and a seeded dev/test account) and the service-role key bypasses
        # RLS, so the old unordered `limit=1` could file Garmin recovery data under
        # the test fixture.
        user_id = os.getenv("USER_ID")
        if not user_id:
            user_res = requests.get(f"{SUPABASE_URL}/rest/v1/user_profiles?select=created_by", headers=headers)
            ids = sorted({r['created_by'] for r in user_res.json() if r.get('created_by')})
            if len(ids) != 1:
                print(f"Error: {len(ids)} user_profiles rows; set USER_ID explicitly.")
                sys.exit(1)
            user_id = ids[0]


        payload["created_by"] = user_id
        
        print(f"Pushing to Supabase for user {user_id}...")
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/recovery_metrics",
            headers=headers,
            json=payload
        )
        
        if res.status_code in [200, 201]:
            print("✅ Successfully synced Garmin data to OptiGainsOS.")
        else:
            print(f"❌ Failed to sync: {res.text}")

    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    sync_garmin()
