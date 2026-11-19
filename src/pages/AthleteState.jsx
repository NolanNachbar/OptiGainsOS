import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTodayString } from "@/utils/dateUtils";
import { useEngineParams } from "@/hooks/useEngineQueries";
import { useDailyTargets } from "@/hooks/useDailyTargets";
import { useProfile } from "@/hooks/useUserQueries";
import PSTTracker from "@/components/PSTTracker";
import VdotZonesCard from "@/components/workouts/VdotZonesCard";
import { Link } from "react-router-dom";
import { useState } from "react";
import { Dumbbell, Activity, BarChart3, Heart, Waves, AlertTriangle, Utensils, Cpu, Camera, ChevronRight, ChevronDown } from "lucide-react";
import AdaptiveEnginePanel from "@/components/athlete/AdaptiveEnginePanel";
import WeeklyPlanPanel from "@/components/athlete/WeeklyPlanPanel";
import { SectionHeader } from "@/components/athlete/athleteShared";
import StrengthSection from "@/components/athlete/StrengthSection";
import HypertrophySection from "@/components/athlete/HypertrophySection";
import FatigueSection from "@/components/athlete/FatigueSection";
import EnduranceSection from "@/components/athlete/EnduranceSection";
import NutritionSection from "@/components/athlete/NutritionSection";
import { SummaryStrip, SummaryStripSkeleton } from "@/components/athlete/SummaryStrip";

export default function AthleteState({ hideHeader = false }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const today = getTodayString(profile?.timezone);
  const [engineOpen, setEngineOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // The engine's learned volume landmarks live in engine_params, not athlete_state,
  // so pull them here to overlay onto the (otherwise template) volume bars.
  const { engineParams } = useEngineParams(today);
  const dailyTargets = useDailyTargets(today);

  const { data: state, isLoading, isError, refetch } = useQuery({
    queryKey: ["athlete-state", today, user?.id],
    queryFn: async () => {
      // The engine writes one row per day, but it may not have run yet for the
      // exact current date (timezone, pre-morning-brief, missed cron). Filtering
      // strictly on today then collapsed the whole surface to an empty state even
      // though recent strength/recovery data exists. Fall back to the most recent
      // row so the page always surfaces the latest computed analysis.
      const { data, error } = await supabase
        .from("athlete_state")
        .select("*")
        .eq("created_by", user.id)
        .lte("date", today)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // When the surfaced row predates today, note it so the page can flag the data
  // as carried-forward rather than silently implying it was computed this morning.
  const isStale = !!state?.date && state.date !== today;

  return (
    <div className={`px-3 py-4 md:px-6 md:py-8 min-h-screen ${hideHeader ? 'pt-0 px-0 md:px-0 min-h-0' : ''}`}>
      <div className="max-w-4xl mx-auto">
        {!hideHeader && (
          <div className="mb-6 rise-in">
            {/* Title reconciled to the dock label ("State"). On mobile the shared
                Layout header already prints "State", so the in-page H1 is
                desktop-only to keep the title appearing exactly once; the
                computed/last-updated caption is surfaced on every viewport. */}
            <h1 className="type-display text-display hidden lg:block">State</h1>
            {/* Desktop: full provenance caption (no shared header date to dup).
                Mobile: Layout already prints today's date in the header, so the
                page caption collapses to a single faint "Updated HH:MM" line to
                avoid restating the date. */}
            <p className="hidden lg:block font-technical text-body font-semibold text-muted-2 lg:mt-0.5">
              {isStale ? `As of ${state.date}` : `Computed daily · ${today}`}
              {state?.computed_at && (
                <span className="ml-2 text-faint">
                  Last updated {new Date(state.computed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
            {(isStale || state?.computed_at) && (
              <p className="lg:hidden font-technical text-caption font-semibold text-faint">
                {isStale ? `As of ${state.date}` : `Updated ${new Date(state.computed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              </p>
            )}
          </div>
        )}

        {isLoading && (
          <>
            <SummaryStripSkeleton />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i} className="glass glass-interactive">
                  <CardContent className="px-5 py-5 space-y-2">
                    <div className="pulse-loop rounded-lg bg-track h-3.5 w-2/5" />
                    <div className="pulse-loop rounded-lg bg-track h-4 w-3/4" />
                    <div className="pulse-loop rounded-lg bg-track h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {!isLoading && isError && (
          <Card className="glass glass-interactive mb-6">
            <CardContent className="pb-8 text-center">
              <div className="pt-8">
                <AlertTriangle className="w-8 h-8 text-warn mx-auto mb-3" />
                <p className="text-sm text-ink font-bold">Couldn&apos;t load athlete state</p>
                <p className="text-xs font-semibold text-muted-2 mt-1 max-w-xs mx-auto">
                  Something went wrong fetching today&apos;s analysis.
                </p>
                <Button variant="outline" className="mt-4 h-11" onClick={() => refetch()}>Retry</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && !state && (
          <Card className="glass glass-interactive mb-6">
            <CardContent className="pb-8 text-center">
              <div className="pt-8">
                <BarChart3 className="w-8 h-8 text-faint mx-auto mb-3" />
                <p className="text-sm text-ink font-bold">No analysis yet</p>
                <p className="text-xs font-semibold text-muted-2 mt-1 max-w-xs mx-auto">
                  Your athlete state refreshes automatically each morning. Give the engine
                  something to work with and it builds your strength, recovery, and fatigue picture.
                </p>
                {/* Single coral primary action (log a workout = the main loop),
                    with secondary ghost paths so the empty state never dead-ends. */}
                <div className="mt-5 flex flex-col items-center gap-2 max-w-[260px] mx-auto">
                  <Button asChild className="w-full h-11">
                    <Link to="/train">Log a workout</Link>
                  </Button>
                  <div className="flex w-full gap-2">
                    <Button asChild variant="outline" className="flex-1 h-11">
                      <Link to="/fuel">Log weigh-in</Link>
                    </Button>
                    <Button asChild variant="outline" className="flex-1 h-11">
                      <Link to="/recovery">Recovery</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && state && (
          <SummaryStrip state={state} vdot={engineParams?.vdot_state?.vdot} />
        )}

        {/* Engine internals — inline on desktop only. On mobile this disclosure
            is moved BELOW the primary cards (it holds the most niche data and
            shouldn't occupy the prime second-fold slot). */}
        <div className="hidden lg:block">
          <AdaptiveEnginePanel date={today} />
          <WeeklyPlanPanel />
          <VdotZonesCard className="mb-4" />
        </div>

        {/* Primary cards — the core answer. Always open on every viewport so it
            lands within ~2 phone viewports. Recovery is intentionally NOT a card
            here: its score + HRV already headline the SummaryStrip up top, and
            full recovery detail lives on the dedicated RECOVERY tab (and the
            "Recovery detail" drill-down link below), so a second "RECOVERY"
            section on the STATE tab would duplicate the label and collide with
            the RECOVERY tab. */}
        {!isLoading && !isError && state && (
        <div className="grid grid-cols-1 gap-4 rise-in-2">
          {/* Strength */}
          <Card className="glass glass-interactive">
            <CardHeader className="pb-2 pt-4 px-5">
              <SectionHeader icon={Dumbbell} title="Strength Goals" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <StrengthSection data={state?.strength} />
            </CardContent>
          </Card>
        </div>
        )}

        {/* Lower analytical cards — collapsed behind a tap-to-expand accordion
            on mobile (the page is otherwise ~6.8 viewports tall); kept open on
            desktop via lg:block. Keeps the core answer within ~2 viewports. */}
        {!isLoading && !isError && state && (
        <>
          {/* Thin section-label groups the two tap-to-expand accordions
              (ChevronDown = disclose) so they read as one collapsible "Details"
              zone, distinct from the ChevronRight nav links below (= navigate
              away). Mobile-only, matching the lg:hidden accordions. */}
          <div className="lg:hidden section-label mt-5 mb-1.5">Details</div>
          <button
            type="button"
            onClick={() => setDetailOpen((v) => !v)}
            aria-expanded={detailOpen}
            className="lg:hidden w-full glass glass-interactive px-4 py-3 min-h-[44px] flex items-center gap-2.5 rise-in-2 active:scale-[0.99] transition-transform duration-200 ease-[var(--ease)]"
          >
            <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center bg-violet/[0.13] text-violet">
              <BarChart3 className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1 min-w-0 text-left">
              <span className="block section-label !text-ink">Body analytics</span>
              <span className="block text-caption font-semibold text-muted-2 truncate">Fatigue · Volume · Endurance · Nutrition</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-2 transition-transform duration-200 ease-[var(--ease)] ${detailOpen ? "rotate-180" : ""}`} />
          </button>
          {/* Height + opacity reveal via grid-rows (the system has no disclosure
              primitive); single easing, in-band duration, content rises 8px in.
              Forced open on lg via lg:!grid-rows-[1fr] / lg:!opacity-100. */}
          <div
            className={`grid lg:!grid-rows-[1fr] lg:!opacity-100 overflow-hidden transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(.2,.7,.3,1)] ${detailOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          >
           <div className="min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 lg:mt-4">
              {/* Fatigue */}
              {state?.fatigue && (
              <Card className="glass glass-interactive">
                <CardHeader className="pb-2 pt-4 px-5">
                  <SectionHeader icon={Activity} title="Fatigue / Load" color="text-violet" />
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <FatigueSection data={state?.fatigue} />
                </CardContent>
              </Card>
              )}

              {/* Muscle Volume */}
              <Card className="glass glass-interactive">
                <CardHeader className="pb-2 pt-4 px-5">
                  <SectionHeader icon={BarChart3} title="Muscle Volume" color="text-teal" />
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <HypertrophySection
                    data={state?.hypertrophy}
                    landmarks={engineParams?.guardrail_state?.mrv_state?.landmarks}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Endurance / BUD/S + PST */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {state?.endurance && (
              <Card className="glass glass-interactive">
                <CardHeader className="pb-2 pt-4 px-5">
                  <SectionHeader icon={Waves} title="Endurance / BUD/S Readiness" color="text-teal" />
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <EnduranceSection data={state?.endurance} />
                </CardContent>
              </Card>
              )}

              <PSTTracker />
            </div>

            {/* Nutrition */}
            {state?.nutrition && (
            <div className="mt-4">
              <Card className="glass glass-interactive">
                <CardHeader className="pb-2 pt-4 px-5">
                  <SectionHeader icon={Utensils} title="Nutrition" color="text-gold" />
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  <NutritionSection data={state?.nutrition} targets={dailyTargets} />
                </CardContent>
              </Card>
            </div>
            )}
           </div>
          </div>

          {/* Engine, Plan & Pace Zones — moved BELOW the primary + analytical
              cards on mobile (it holds the most niche data). Inline above on
              desktop via the hidden lg:block block earlier. */}
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setEngineOpen((v) => !v)}
              aria-expanded={engineOpen}
              className="w-full glass glass-interactive px-4 py-3 min-h-[44px] mt-4 mb-4 flex items-center gap-2.5 rise-in-3 active:scale-[0.99] transition-transform duration-200 ease-[var(--ease)]"
            >
              <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center bg-gold/[0.13] text-gold">
                <Cpu className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 min-w-0 text-left">
                <span className="block section-label !text-ink">Engine internals</span>
                <span className="block text-caption font-semibold text-muted-2 truncate">Adaptive engine · Weekly plan · Pace zones</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-2 transition-transform duration-200 ease-[var(--ease)] ${engineOpen ? "rotate-180" : ""}`} />
            </button>
            {/* Same grid-rows height + opacity reveal as the analytics accordion. */}
            <div className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-[280ms] ease-[cubic-bezier(.2,.7,.3,1)] ${engineOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="min-h-0">
                <AdaptiveEnginePanel date={today} />
                <WeeklyPlanPanel />
                <VdotZonesCard className="mb-4" />
              </div>
            </div>
          </div>
        </>
        )}

        {/* Drill-downs — physique photos + recovery trends. As the page's last
            in-flow content this carries the dock clearance so it (and the engine
            accordion above it) always clear the floating mobile dock; the wrapper
            no longer pads so clearance lives on the true last child. */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 rise-in-3 pb-[var(--dock-clearance)] lg:pb-2">
          <Link to="/physique" className="glass glass-interactive px-4 py-3.5 flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-violet/[0.13] text-violet">
              <Camera className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-extrabold text-ink">Physique photos</span>
              <span className="block text-caption font-semibold text-muted-2 truncate">upload · AI body-comp estimate · trend</span>
            </span>
            <ChevronRight className="w-4 h-4 text-faint shrink-0" />
          </Link>
          <Link to="/recovery" className="glass glass-interactive px-4 py-3.5 flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-teal/[0.13] text-teal">
              <Heart className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-extrabold text-ink">Recovery detail</span>
              <span className="block text-caption font-semibold text-muted-2 truncate">HRV · RHR · sleep · ACWR trends</span>
            </span>
            <ChevronRight className="w-4 h-4 text-faint shrink-0" />
          </Link>
        </div>
      </div>
    </div>
  );
}
