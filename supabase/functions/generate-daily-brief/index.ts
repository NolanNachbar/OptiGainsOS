import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const USER_ID = Deno.env.get("USER_ID")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = "llama-3.3-70b-versatile";

const CARDIO_PROGRAM = `
Phase 1 — Secondary Cardio (Ironman base, runs alongside lifting)

Day        Type        Workout                   Target
Monday     —           Lifting only              No cardio
Tuesday    Intervals   4-6 × 400m track sprints  Fast but repeatable, 90s rest between. Scale reps with body battery: <60→4, >75→6.
Wednesday  —           Lifting only              No cardio (or 15 min easy walk if restless)
Thursday   Easy Run    2-3 miles                 Zone 2. Conversational pace. Focus: technique/form.
Friday     —           Lifting only              No cardio
Saturday   Endurance   45-60 min ruck or run     Zone 2. 20lb pack if rucking. This is the Ironman anchor — priority session.
Sunday     Active Rec  Mobility / yoga           Hip flexors + ankles. Not a training day.

Saturday is the most important cardio day. As capacity grows, stretch it toward 2-3 hours over months.
Bike or hill sprints are valid swaps for Tuesday if shins/knees are beat up.
`.trim();

// ── helpers ───────────────────────────────────────────────────────────────────

function safe(obj: unknown, ...keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur ?? null;
}

function sb(table: string) {
  return supabase.from(table).select("*").eq("created_by", USER_ID);
}

function daysBefore(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatWorkout(w: Record<string, unknown>): string {
  const exercises = Array.isArray(w.exercises) ? w.exercises as Array<Record<string, unknown>> : [];
  const lines = [`  ${w.log_date} — ${w.notes || "Workout"}`];
  for (const ex of exercises.slice(0, 8)) {
    const sets = Array.isArray(ex.sets) ? ex.sets as Array<Record<string, unknown>> : [];
    const setStr = sets.map(s =>
      s.weight ? `${s.reps}×${s.weight}lbs` : `${s.reps} reps`
    ).join(", ");
    lines.push(`    ${ex.name}: ${setStr}`);
  }
  return lines.join("\n");
}

function formatMacros(entries: Array<Record<string, unknown>>): string {
  const t = entries.reduce((acc, e) => ({
    cal: acc.cal + Number(e.calories || 0),
    p: acc.p + Number(e.protein_grams || 0),
    c: acc.c + Number(e.carbs_grams || 0),
    f: acc.f + Number(e.fats_grams || 0),
  }), { cal: 0, p: 0, c: 0, f: 0 });
  return `${Math.round(t.cal)} kcal · ${Math.round(t.p)}g protein · ${Math.round(t.c)}g carbs · ${Math.round(t.f)}g fat`;
}

// ── HRV trend ─────────────────────────────────────────────────────────────────

function analyzeHRVTrend(rows: Array<Record<string, unknown>>): string {
  const points = rows
    .filter(r => r.hrv)
    .map(r => ({ date: r.date as string, hrv: Number(r.hrv) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return "Insufficient HRV data.";

  let consecutiveDrops = 0;
  for (let i = points.length - 1; i > 0; i--) {
    if (points[i].hrv < points[i - 1].hrv) consecutiveDrops++;
    else break;
  }

  const avg = points.reduce((s, p) => s + p.hrv, 0) / points.length;
  const latest = points[points.length - 1].hrv;
  const delta = latest - points[0].hrv;

  if (consecutiveDrops >= 3)
    return `HRV trending DOWN ${consecutiveDrops} consecutive days (latest ${latest}, 7-day avg ${avg.toFixed(0)}). Genuine recovery concern.`;
  if (delta < -5 && consecutiveDrops >= 2)
    return `HRV drifting lower this week (latest ${latest}, avg ${avg.toFixed(0)}). Watch but do not cut sessions yet.`;
  if (delta > 3)
    return `HRV improving this week (latest ${latest}, avg ${avg.toFixed(0)}). Training load well tolerated.`;
  return `HRV stable (latest ${latest}, 7-day avg ${avg.toFixed(0)}). No recovery concern.`;
}

// ── prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(data: {
  profile: Record<string, unknown>;
  recovery: Array<Record<string, unknown>>;
  workouts: Array<Record<string, unknown>>;
  food: Array<Record<string, unknown>>;
  weights: Array<Record<string, unknown>>;
  checkin: Record<string, unknown> | null;
  jobs: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
  today: string;
  dayOfWeek: string;
}): string {
  const p = data.profile;
  const hrv = analyzeHRVTrend(data.recovery);
  const r = data.recovery[0] || {};

  const staleSkills = data.skills.filter(s =>
    s.last_practiced_at &&
    (new Date(data.today).getTime() - new Date(s.last_practiced_at as string).getTime()) / 86400000 > 14
  ).map(s => s.name).slice(0, 5);

  const foodByDate: Record<string, Array<Record<string, unknown>>> = {};
  for (const e of data.food) {
    const d = e.date as string;
    if (!foodByDate[d]) foodByDate[d] = [];
    foodByDate[d].push(e);
  }

  const openJobs = data.jobs.filter(j => !["rejected", "offer_accepted"].includes(j.status as string));

  const lines: string[] = [
    `You are the AI coaching team for Nolan Nachbar's personal performance OS (OptiGainsOS).`,
    `Generate today's daily brief as a strict JSON object. No markdown fences, no text outside the JSON.`,
    ``,
    `=== ABOUT NOLAN ===`,
    `Age: ${p.age} | Height: ${p.height_cm}cm | Weight: ${p.current_weight}lbs`,
    `Goal: ${p.primary_goal} | Training: ${p.days_per_week}x/week | Phase: ${p.training_phase}`,
    `Calorie goal: ${p.daily_calorie_goal} kcal | Protein: ${p.daily_protein_goal}g`,
    `Race: ${p.race_name} (${p.race_type}) on ${p.race_date}`,
    ``,
    `=== TRAINING STRUCTURE ===`,
    `Nolan runs TWO separate sessions most days:`,
    `  1. GYM/STRENGTH — always priority. Covered by "performance" field.`,
    `  2. CARDIO/ENDURANCE — second session on top of lifting. Covered by "endurance" field.`,
    `These are additive, not alternatives.`,
    ``,
    `=== CARDIO PROGRAM (Phase 1) ===`,
    CARDIO_PROGRAM,
    ``,
    `=== CARDIO CUT RULES (strict) ===`,
    `Only reduce/skip cardio if ALL THREE are true:`,
    `  1. HRV trending down 3+ consecutive days`,
    `  2. Body battery <40 OR sleep score <50`,
    `  3. Subjective energy ≤3/10`,
    `If fewer than 3: note the signal but keep the session.`,
    ``,
    `=== OUTPUT FORMAT (strict JSON) ===`,
    `{`,
    `  "performance": "1-2 sentences: today's gym/lifting recommendation based on recent logs and recovery.",`,
    `  "endurance":   "1-2 sentences: today's cardio from the Phase 1 plan. Specific: type, duration, zone, adjustments.",`,
    `  "nutrition":   "1 sentence: specific nutrition focus based on recent trend.",`,
    `  "body_comp":   "1 sentence: body composition note based on weight trend.",`,
    `  "learning":    "1 sentence: what to study or read based on skill gaps.",`,
    `  "career":      "1 sentence: one specific career action based on pipeline.",`,
    `  "insight":     "1 sentence: one pattern across all data Nolan may not have noticed.",`,
    `  "today_actions": ["action 1", "action 2", "action 3"]`,
    `}`,
    `Rules: Be direct. No filler. today_actions: 3-5 concrete items, always include one gym + one cardio action.`,
    ``,
    `=== TODAY'S DATA ===`,
    `Date: ${data.today} (${data.dayOfWeek})`,
    `HRV trend: ${hrv}`,
  ];

  if (r.sleep_score || r.body_battery || r.hrv) {
    lines.push(`\nRecovery (last night):`);
    if (r.sleep_score) lines.push(`  Sleep score: ${r.sleep_score} | Duration: ${r.sleep_duration_min}min`);
    if (r.body_battery) lines.push(`  Body battery: ${r.body_battery}`);
    if (r.resting_hr) lines.push(`  Resting HR: ${r.resting_hr}bpm | HRV: ${r.hrv}`);
  }

  if (data.checkin) {
    const c = data.checkin;
    lines.push(`\nMorning check-in: Energy ${c.energy}/10 | Mood ${c.mood}/10 | Soreness ${c.soreness}/5`);
    if (c.notes) lines.push(`  Notes: ${c.notes}`);
  }

  if (data.workouts.length > 0) {
    lines.push(`\nRecent workouts (last 7 days):`);
    for (const w of data.workouts.slice(0, 5)) lines.push(formatWorkout(w));
  } else {
    lines.push(`\nNo workouts logged in last 7 days.`);
  }

  const recentDates = Object.keys(foodByDate).sort().reverse().slice(0, 3);
  if (recentDates.length > 0) {
    lines.push(`\nNutrition (last 3 days):`);
    for (const d of recentDates) {
      lines.push(`  ${d}: ${formatMacros(foodByDate[d])}`);
    }
  }

  if (data.weights.length > 0) {
    const pts = data.weights.slice(0, 5).map(w => `${w.recorded_date}: ${w.weight}lbs`);
    lines.push(`\nWeight trend: ${pts.join(" → ")}`);
  }

  if (openJobs.length > 0) {
    lines.push(`\nJob pipeline: ${openJobs.length} open applications`);
    for (const j of openJobs.slice(0, 3)) {
      lines.push(`  ${j.company} — ${j.role} (${j.status})`);
    }
  }

  if (staleSkills.length > 0) {
    lines.push(`\nSkills not practiced in 14+ days: ${staleSkills.join(", ")}`);
  }

  return lines.join("\n");
}

// ── Groq call ─────────────────────────────────────────────────────────────────

async function callGroq(prompt: string): Promise<string> {
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!resp.ok) throw new Error(`Groq error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content.trim();
}

function extractJSON(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw); } catch { /* */ }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* */ }
  }
  return null;
}

// ── handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const force = new URL(req.url).searchParams.has("force");
  const today = new Date().toISOString().slice(0, 10);
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Check if brief already exists
  if (!force) {
    const { data: existing } = await supabase
      .from("daily_briefs")
      .select("id")
      .eq("created_by", USER_ID)
      .eq("date", today)
      .limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "Brief already exists. Use ?force to regenerate." }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Fetch all data in parallel
  const since7 = daysBefore(7);
  const since3 = daysBefore(3);

  const [profile, recovery, workouts, food, weights, checkin, jobs, skills] = await Promise.all([
    sb("user_profiles").limit(1).single(),
    sb("recovery_metrics").gte("date", since7).order("date", { ascending: false }),
    sb("workout_logs").gte("log_date", since7).order("log_date", { ascending: false }),
    sb("food_entries").gte("date", since3).order("date", { ascending: false }),
    sb("body_weight_entries").order("recorded_date", { ascending: false }).limit(7),
    sb("daily_readiness").eq("date", today).limit(1).maybeSingle(),
    sb("job_applications").order("created_at", { ascending: false }).limit(10),
    sb("skills").order("name"),
  ]);

  const prompt = buildPrompt({
    profile: (profile.data as Record<string, unknown>) || {},
    recovery: (recovery.data as Array<Record<string, unknown>>) || [],
    workouts: (workouts.data as Array<Record<string, unknown>>) || [],
    food: (food.data as Array<Record<string, unknown>>) || [],
    weights: (weights.data as Array<Record<string, unknown>>) || [],
    checkin: checkin.data as Record<string, unknown> | null,
    jobs: (jobs.data as Array<Record<string, unknown>>) || [],
    skills: (skills.data as Array<Record<string, unknown>>) || [],
    today,
    dayOfWeek,
  });

  console.log("Calling Groq...");
  const raw = await callGroq(prompt);
  const brief = extractJSON(raw);

  if (!brief) {
    console.error("Failed to parse JSON from Groq:", raw.slice(0, 500));
    return new Response(JSON.stringify({ error: "Failed to parse brief JSON", raw }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.from("daily_briefs").upsert({
    created_by: USER_ID,
    date: today,
    brief_json: brief,
    generated_at: new Date().toISOString(),
    model_used: GROQ_MODEL,
  }, { onConflict: "date" });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("Brief written to daily_briefs for", today);
  return new Response(JSON.stringify({ success: true, date: today, insight: brief.insight }), {
    headers: { "Content-Type": "application/json" },
  });
});
