import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const USER_ID    = Deno.env.get("USER_ID")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ── helpers ───────────────────────────────────────────────────────────────────

function sb(table: string) {
  return supabase.from(table).select("*").eq("created_by", USER_ID);
}

function daysBefore(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function pct(val: number): string {
  return `${Math.round(val * 100)}%`;
}

function fmtTime(seconds: number | null): string {
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// ── State formatters — each section becomes prose for the prompt ──────────────

function fmtStrength(s: Record<string, unknown> | null): string {
  if (!s || Object.keys(s).length === 0) return "No strength data yet.";
  const lines: string[] = [];
  for (const [lift, d] of Object.entries(s) as [string, Record<string, unknown>][]) {
    const rate  = Number(d.progression_rate_lbs_per_week);
    const stall = Number(d.stall_risk);
    const eta   = d.eta_days != null ? `ETA ${d.eta_days}d to ${d.target}lbs target` : "";
    const stallLabel = stall >= 0.75 ? "STALLED" : stall >= 0.4 ? "watch" : "progressing";
    lines.push(
      `  ${lift.padEnd(9)}: e1RM ${d.current_e1rm}lbs | ` +
      `${rate >= 0 ? "+" : ""}${rate}lbs/wk | stall_risk=${stall} (${stallLabel})` +
      (eta ? ` | ${eta}` : "") +
      ` | ${d.sessions} sessions tracked`
    );
  }
  return lines.join("\n");
}

function fmtHypertrophy(h: Record<string, unknown> | null): string {
  if (!h || Object.keys(h).length === 0) return "No volume data this week.";
  const lines: string[] = [];
  for (const [muscle, d] of Object.entries(h) as [string, Record<string, unknown>][]) {
    const sets    = Number(d.weekly_sets);
    const mav     = Number(d.mav);
    const mrv     = Number(d.mrv);
    const mev     = Number(d.mev);
    const fatigue = Number(d.fatigue_score);
    const status  = sets >= mrv ? "OVER MRV" : sets >= mav ? "at MAV" : sets >= mev ? "above MEV" : "BELOW MEV";
    lines.push(
      `  ${muscle.padEnd(12)}: ${sets}/${mav} sets (MRV=${mrv}) | fatigue=${pct(fatigue)} | ${status}`
    );
  }
  return lines.join("\n");
}

function fmtFatigue(f: Record<string, unknown> | null): string {
  if (!f) return "No fatigue data.";
  return [
    `  TSB=${f.tsb} (ATL=${f.atl}, CTL=${f.ctl}) → ${String(f.interpretation).replace("_", " ")}`,
    `  CNS fatigue: ${pct(Number(f.cns_fatigue))} | Global fatigue: ${pct(Number(f.global_fatigue))}`,
  ].join("\n");
}

function fmtRecovery(r: Record<string, unknown> | null): string {
  if (!r || !r.data_available) return "No recovery data (Garmin sync pending or not linked).";
  const drops = Number(r.hrv_consecutive_drops);
  return [
    `  Score: ${r.score}/100 | Push readiness: ${r.push_readiness}`,
    `  HRV: ${r.hrv ?? "—"}ms (trend: ${r.hrv_trend}, ${drops} consecutive drop${drops !== 1 ? "s" : ""})`,
    `  Sleep: ${r.sleep_score ?? "—"} | Body battery: ${r.body_battery ?? "—"} | Resting HR: ${r.resting_hr ?? "—"}bpm`,
  ].join("\n");
}

function fmtEndurance(e: Record<string, unknown> | null): string {
  if (!e) return "No endurance data.";
  const pst = e.pst_latest as Record<string, unknown> | undefined;
  const daysSinceRun  = e.days_since_run  != null ? `${e.days_since_run}d ago`  : "never";
  const daysSinceSwim = e.days_since_swim != null ? `${e.days_since_swim}d ago` : "never";
  const missed = (e.missed_sessions_7d as Array<Record<string,string>> | undefined) ?? [];
  const lines = [
    `  ${e.days_to_aug31} days to Aug 31 BUD/S PST deadline`,
    `  VO2max: ${e.vo2max ?? "—"} | Aerobic fitness: ${e.aerobic_fitness_proxy != null ? pct(Number(e.aerobic_fitness_proxy)) : "—"}`,
    `  This week: ${e.run_sessions_7d ?? 0} runs (${e.run_km_7d ?? 0} km) | ${e.swim_sessions_7d ?? 0} swims (${e.swim_m_7d ?? 0} m)`,
    `  Last run: ${daysSinceRun} | Last swim: ${daysSinceSwim}`,
  ];
  if (missed.length > 0) {
    const missedStr = missed.slice(0, 4).map(m => `${m.day} ${m.expected}`).join(", ");
    lines.push(`  ⚠ Missed conditioning sessions this week: ${missedStr}`);
  } else {
    lines.push("  ✓ All conditioning sessions completed this week");
  }
  if (pst && pst.test_date) {
    lines.push(
      `  PST (${pst.test_date}): swim ${fmtTime(Number(pst.swim_seconds))} | ` +
      `push-ups ${pst.pushups ?? "—"} | sit-ups ${pst.situps ?? "—"} | ` +
      `pull-ups ${pst.pullups ?? "—"} | 1.5mi ${fmtTime(Number(pst.run_seconds))} (target <9:00)`
    );
    if (e.pst_readiness_pct != null) {
      lines.push(`  PST readiness: ${Number(e.pst_readiness_pct).toFixed(0)}% of competitive target`);
    }
    // 4-mile is a BUDS prep standard, not a PST event
    if (pst.run_4mile_seconds) {
      lines.push(
        `  4-mile (BUDS prep): ${fmtTime(Number(pst.run_4mile_seconds))} (target <26:00) — ` +
        `readiness ${e.run_4mile_readiness_pct != null ? Number(e.run_4mile_readiness_pct).toFixed(0) + "%" : "?"}`
      );
    } else if (e.run_4mile_estimated_secs) {
      lines.push(`  4-mile (BUDS prep): ~${fmtTime(Number(e.run_4mile_estimated_secs))} estimated from recent runs — log a test effort to confirm`);
    } else {
      lines.push("  4-mile (BUDS prep): not yet tested — target <26:00");
    }
  } else {
    lines.push("  No PST test logged yet — schedule a baseline ASAP.");
  }
  return lines.join("\n");
}

function fmtNutrition(n: Record<string, unknown> | null): string {
  if (!n) return "No nutrition data.";
  const adherence = n.calorie_adherence != null ? pct(Number(n.calorie_adherence)) : "—";
  const trend     = n.weight_trend_lbs_per_week != null
    ? `${Number(n.weight_trend_lbs_per_week) > 0 ? "+" : ""}${n.weight_trend_lbs_per_week} lbs/wk`
    : "insufficient data";
  return [
    `  Phase: ${n.phase} | Calorie adherence: ${adherence} (avg ${n.avg_calories_7d} / target ${n.calorie_target} kcal)`,
    `  Protein: ${n.avg_protein_7d}g avg / ${n.protein_target}g target`,
    `  Weight trend: ${trend} | On track: ${n.on_track == null ? "unknown" : n.on_track ? "yes" : "NO"}`,
  ].join("\n");
}

function fmtTasks(tasks: Array<Record<string, unknown>>): string {
  if (!tasks || tasks.length === 0) return "No planned to-do items for today.";
  const lines: string[] = [];
  for (const t of tasks) {
    const mark   = t.status === "done" ? "[x]" : t.status === "skipped" ? "[~]" : "[ ]";
    const target = t.target ? ` (${t.target})` : "";
    const goal   = (t.template as Record<string, unknown> | null)?.goal
      ? ` — serves: ${(t.template as Record<string, unknown>).goal}`
      : "";
    lines.push(`  ${mark} ${t.title}${target}${goal}`);
  }
  return lines.join("\n");
}

// ── Prompt builder ────────────────────────────────────────────────────────────

const CARDIO_PROGRAM = `
BUD/S Prep — Conditioning Block (June 3 → August 31 2026)
Goal: pass PST at competitive levels (swim <9:00, push-ups 100+, sit-ups 100+, pull-ups 20+, 1.5mi run <9:30)

Day        Type              Workout
Monday     Calisthenics      Push-up/sit-up/pull-up pyramid — 3-4 rounds max reps. Rest 90s.
Tuesday    Run — Intervals   6-8 × 400m track sprints. Hard effort, 90s rest. Scale with body battery: <60→6, >75→8.
Wednesday  Calisthenics      Submaximal sets (60-70% max) every hour if possible. Grease the groove.
Thursday   Run — Easy        3-5 miles Zone 2, conversational pace.
Friday     Calisthenics      Push-up/sit-up/pull-up pyramid (same as Monday). Track weekly totals.
Saturday   Long Run + Ruck   45-90 min run OR 4-mile boot ruck. Alternate weekly.
Sunday     Active Rec        500m easy swim (sidestroke/breaststroke — PST stroke). Time it. Hip flexors + shoulders.

Saturday and Sunday are the most important conditioning days. PST benchmark test every 4 weeks.
`.trim();

function fmtPrescription(p: Record<string, unknown> | null): string {
  if (!p) return "No prescription computed yet for today.";
  const lines: string[] = [
    `  Action: ${p.mpc_action} | Session type: ${p.session_type} | Intensity: ${p.mpc_intensity}`,
    `  Rationale: ${p.rationale}`,
    `  ACWR: ${p.acwr} | Overreach: ${(p.overreach as Record<string,unknown>)?.overreaching ?? false}`,
  ];
  if (p.interference_warning) lines.push(`  ⚠ ${p.interference_warning}`);

  const sb = p.strength_block as Array<Record<string,unknown>> | null;
  if (sb && sb.length > 0) {
    lines.push("  Strength:");
    for (const ex of sb) {
      lines.push(`    ${ex.name}: ${ex.sets}×${ex.reps} @ ${ex.load_lbs}lbs (${Math.round(Number(ex.load_pct)*100)}% e1RM)`);
    }
  }

  const cb = p.calisthenics_block as Record<string,unknown> | null;
  if (cb) {
    const pu = cb.pullups as Record<string,unknown> | undefined;
    const ps = cb.pushups as Record<string,unknown> | undefined;
    const su = cb.situps  as Record<string,unknown> | undefined;
    if (pu) lines.push(`  Pull-ups: ${pu.sets}×${pu.reps_each} (GTG)`);
    if (ps) lines.push(`  Push-ups: ${ps.sets}×${ps.reps_each}`);
    if (su) lines.push(`  Sit-ups:  ${su.sets}×${su.reps_each}`);
  }

  const rb = p.run_block as Record<string,unknown> | null;
  if (rb) {
    lines.push(`  Run: ${rb.session_miles ?? rb.reps + "×" + rb.distance_m + "m"} @ ${rb.pace ?? ""} (${rb.zone ?? rb.type ?? ""})`);
  }

  const swim = p.swim_block as Record<string,unknown> | null;
  if (swim) lines.push(`  Swim: ${swim.meters}m ${swim.stroke}`);

  return lines.join("\n");
}

function buildPrompt(data: {
  state:        Record<string, unknown> | null;
  prescription: Record<string, unknown> | null;
  profile:      Record<string, unknown>;
  recovery7d:   Array<Record<string, unknown>>;
  checkin:      Record<string, unknown> | null;
  jobs:         Array<Record<string, unknown>>;
  skills:       Array<Record<string, unknown>>;
  tasks:        Array<Record<string, unknown>>;
  today:        string;
  dayOfWeek:    string;
}): string {
  const p       = data.profile;
  const state   = data.state;
  const hasState = !!state;

  // Stale skills
  const staleSkills = data.skills
    .filter(s => s.last_practiced_at &&
      (new Date(data.today).getTime() - new Date(s.last_practiced_at as string).getTime()) / 86400000 > 14)
    .map(s => s.name)
    .slice(0, 5);

  const openJobs = data.jobs.filter(j => !["rejected", "offer_accepted"].includes(j.status as string));

  const lines: string[] = [
    `You are the AI coaching team for Nolan Nachbar's personal performance OS.`,
    `Generate today's daily brief as a strict JSON object. No markdown fences, no text outside the JSON.`,
    ``,
    `=== ABOUT NOLAN ===`,
    `Age: ${p.age} | Height: ${p.height_cm}cm | Weight: ${p.current_weight}lbs`,
    `Goal: ${p.primary_goal} | Training: ${p.days_per_week}x/week | Phase: ${p.training_phase}`,
    `Calorie goal: ${p.daily_calorie_goal} kcal | Protein: ${p.daily_protein_goal}g`,
    `BUD/S Prep Goal: Pass PST at competitive levels by August 31 2026`,
    ``,
    `=== TRAINING STRUCTURE ===`,
    `Two sessions daily (additive, not alternatives):`,
    `  1. GYM/STRENGTH — always priority → "performance" field`,
    `  2. CARDIO/CONDITIONING — second session → "endurance" field`,
    ``,
    `=== CONDITIONING PROGRAM (BUD/S Prep) ===`,
    CARDIO_PROGRAM,
    ``,
    `=== CARDIO CUT RULES (strict — need ALL THREE) ===`,
    `Only reduce/skip cardio if: (1) HRV trending down 3+ consecutive days AND (2) body battery <40 OR sleep score <50 AND (3) subjective energy ≤3/10`,
    `If fewer than 3 signals: note it but keep the session.`,
    ``,
    `=== OUTPUT FORMAT (strict JSON) ===`,
    `{`,
    `  "performance": "1-2 sentences: today's gym/lifting recommendation. Reference specific muscles, lifts, or volume gaps from the data.",`,
    `  "endurance":   "1-2 sentences: today's conditioning from the BUD/S plan. Specific type, duration, zone, and any adjustments.",`,
    `  "nutrition":   "1 sentence: specific nutrition focus based on recent trend and phase.",`,
    `  "body_comp":   "1 sentence: body composition note based on weight trend.",`,
    `  "learning":    "1 sentence: what to study/read based on skill gaps or career goals.",`,
    `  "career":      "1 sentence: one specific career action based on pipeline.",`,
    `  "insight":     "1 sentence: one non-obvious pattern across the data that Nolan may have missed.",`,
    `  "today_actions": ["action 1", "action 2", "action 3"]`,
    `}`,
    `Rules: Be direct. No filler. Reference computed numbers, not vague language. today_actions: fold in EVERY pending [ ] item from "TODAY'S PLANNED TO-DO" below (verbatim or lightly tightened), PLUS one gym and one cardio action. 3-8 items total. Do not invent to-dos that aren't in the data.`,
    ``,
    `=== TODAY ===`,
    `Date: ${data.today} (${data.dayOfWeek})`,
  ];

  lines.push(`\n=== TODAY'S TRAINING PRESCRIPTION (engine-computed — use this, do not invent sessions) ===`);
  lines.push(fmtPrescription(data.prescription));

  if (data.checkin) {
    const c = data.checkin;
    lines.push(`\nMorning check-in: Energy ${c.energy}/10 | Mood ${c.mood}/10 | Soreness ${c.soreness}/5${c.notes ? ` | Notes: ${c.notes}` : ""}`);
  }

  lines.push(`\n=== TODAY'S PLANNED TO-DO (from your plan + the second brain) ===`);
  lines.push(fmtTasks(data.tasks));
  lines.push(`[These are Nolan's committed recurring actions toward his business, career, and training goals. Every pending [ ] item must appear in today_actions. [x]=done, [~]=skipped — do not re-list those.]`);

  if (hasState) {
    // ── Primary data source: computed athlete state ───────────────────────
    lines.push(`\n=== ATHLETE STATE (computed ${state!.computed_at ?? "today"}) ===`);
    lines.push(`\n--- Strength ---`);
    lines.push(fmtStrength(state!.strength as Record<string, unknown>));
    lines.push(`\n--- Muscle Volume (this week vs targets) ---`);
    lines.push(fmtHypertrophy(state!.hypertrophy as Record<string, unknown>));
    lines.push(`\n--- Fatigue / Training Load ---`);
    lines.push(fmtFatigue(state!.fatigue as Record<string, unknown>));
    lines.push(`\n--- Recovery ---`);
    lines.push(fmtRecovery(state!.recovery as Record<string, unknown>));
    lines.push(`\n--- Endurance / BUD/S ---`);
    lines.push(fmtEndurance(state!.endurance as Record<string, unknown>));
    lines.push(`\n--- Nutrition ---`);
    lines.push(fmtNutrition(state!.nutrition as Record<string, unknown>));
    lines.push(`\n[Numbers above are deterministic computations — reason over them, do not second-guess the math. Your job is to interpret and decide.]`);
  } else {
    // ── Fallback: raw recovery data if athlete_state not yet computed ─────
    lines.push(`\n[NOTE: athlete_state not computed yet for today. Using raw recovery data only.]`);
    const r = data.recovery7d[0] || {};
    if (r.sleep_score || r.body_battery || r.hrv) {
      lines.push(`\nRecovery (last night):`);
      if (r.sleep_score) lines.push(`  Sleep: ${r.sleep_score} | Duration: ${r.sleep_duration_min}min`);
      if (r.body_battery) lines.push(`  Body battery: ${r.body_battery}`);
      if (r.resting_hr)   lines.push(`  Resting HR: ${r.resting_hr}bpm | HRV: ${r.hrv}`);
    }
    lines.push(`\nNo strength/volume/fatigue data available without athlete_state. Generate a general recommendation.`);
  }

  if (openJobs.length > 0) {
    lines.push(`\n--- Career Pipeline ---`);
    lines.push(`  ${openJobs.length} open applications`);
    for (const j of openJobs.slice(0, 3)) {
      const next = j.next_action
        ? ` → next: ${j.next_action}${j.next_action_date ? ` by ${j.next_action_date}` : ""}`
        : "";
      lines.push(`  ${j.company} — ${j.role} (${j.status})${next}`);
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
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      messages:    [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens:  1024,
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

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const force     = new URL(req.url).searchParams.has("force");
  const today     = new Date().toISOString().slice(0, 10);
  const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Skip if brief already exists (unless ?force)
  if (!force) {
    const { data: existing } = await supabase
      .from("daily_briefs")
      .select("id")
      .eq("created_by", USER_ID)
      .eq("date", today)
      .limit(1);
    if (existing && existing.length > 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Brief already exists. Use ?force to regenerate." }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Fetch all inputs in parallel
  const [
    athleteStateRes,
    profileRes,
    recovery7dRes,
    checkinRes,
    jobsRes,
    skillsRes,
    prescriptionRes,
    tasksRes,
  ] = await Promise.all([
    supabase.from("athlete_state").select("*").eq("created_by", USER_ID).eq("date", today).limit(1).maybeSingle(),
    sb("user_profiles").limit(1).single(),
    sb("recovery_metrics").gte("date", daysBefore(7)).order("date", { ascending: false }),
    sb("daily_readiness").eq("date", today).limit(1).maybeSingle(),
    sb("job_applications").order("created_at", { ascending: false }).limit(10),
    sb("skills").order("name"),
    supabase.from("training_prescription").select("*").eq("created_by", USER_ID).eq("date", today).limit(1).maybeSingle(),
    supabase.from("daily_tasks")
      .select("title, domain, target, status, sort_order, template:task_templates(goal)")
      .eq("created_by", USER_ID).eq("date", today)
      .order("sort_order", { ascending: true }),
  ]);

  const state        = athleteStateRes.data as Record<string, unknown> | null;
  const prescription = prescriptionRes.data as Record<string, unknown> | null;

  if (!state) {
    console.warn("athlete_state not found for today — brief will use fallback raw data");
  } else {
    console.log("athlete_state loaded, computed_at:", state.computed_at);
  }
  if (prescription) {
    console.log("prescription loaded, session_type:", prescription.session_type);
  }

  const prompt = buildPrompt({
    state,
    prescription,
    profile:    (profileRes.data as Record<string, unknown>) || {},
    recovery7d: (recovery7dRes.data as Array<Record<string, unknown>>) || [],
    checkin:    checkinRes.data as Record<string, unknown> | null,
    jobs:       (jobsRes.data as Array<Record<string, unknown>>) || [],
    skills:     (skillsRes.data as Array<Record<string, unknown>>) || [],
    tasks:      (tasksRes.data as Array<Record<string, unknown>>) || [],
    today,
    dayOfWeek,
  });

  console.log("Calling Groq...");
  let raw: string;
  try {
    raw = await callGroq(prompt);
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const brief = extractJSON(raw);
  if (!brief) {
    console.error("Failed to parse JSON from Groq:", raw.slice(0, 500));
    return new Response(JSON.stringify({ error: "Failed to parse brief JSON", raw }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Store metadata about whether state was used
  brief._state_available = !!state;
  brief._state_computed_at = state?.computed_at ?? null;

  const { error } = await supabase.from("daily_briefs").upsert({
    created_by:   USER_ID,
    date:         today,
    brief_json:   brief,
    generated_at: new Date().toISOString(),
    model_used:   GROQ_MODEL,
  }, { onConflict: "date" });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("Brief written for", today, "| state_used:", !!state);
  return new Response(
    JSON.stringify({ success: true, date: today, state_used: !!state, insight: brief.insight }),
    { headers: { "Content-Type": "application/json" } },
  );
});
