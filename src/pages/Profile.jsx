import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile, useAllFoodEntries, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen, LoadingSpinner } from "@/components/ui/loading-spinner";
import { invalidateProfile, invalidateBodyWeight } from "@/lib/queryKeys";
import { DEFAULT_GOALS, WEIGHT_UNITS, ACTIVITY_LEVELS, SEX_OPTIONS, DAYS_OF_WEEK } from "@/lib/constants";
import { getBestTDEE, calculateMacroSplit } from "@/utils/coachingUtils";
import { MacroGoalsEditor } from "@/components/nutrition/MacroGoalsEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Save, Trash2, AlertTriangle, Flame, User, LogOut, HelpCircle, Bell, Database, ChevronRight, ChevronLeft, Calculator } from "lucide-react";
import { ProfileStatsCard } from "@/components/ui/system";
import { deriveInitials } from "@/lib/initials";
import DataExport from "@/components/DataExport";
import NotificationSettings from "@/components/NotificationSettings";
import { toast } from "sonner";
import { format } from "date-fns";

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 rounded-lg bg-charcoal-elevated">
        <Icon className="w-4 h-4 text-ink-muted" />
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-charcoal-border my-6" />;
}

// IANA timezone list, computed once at module load (hundreds of values — never
// recompute per render). Fed to the searchable Combobox in the Preferences tab.
const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone];
  }
})();

// Compact volume formatter: >=1e6 rolls to one-decimal M (1.3M), >=1000 to k, else raw.
function formatVol(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return `${v}`;
}

// Coerce the dirty-comparison-relevant numeric fields so string/number drift never reads as dirty.
function normalizeFormData(f) {
  const numOrEmpty = (x) => (x === '' || x === null || x === undefined ? '' : Number(x));
  return {
    ...f,
    age: numOrEmpty(f.age),
    height_cm: numOrEmpty(f.height_cm),
    current_weight: numOrEmpty(f.current_weight),
    daily_calorie_goal: numOrEmpty(f.daily_calorie_goal),
    daily_protein_goal: numOrEmpty(f.daily_protein_goal),
    daily_carbs_goal: numOrEmpty(f.daily_carbs_goal),
    daily_fats_goal: numOrEmpty(f.daily_fats_goal),
    tdee_override: numOrEmpty(f.tdee_override),
    checkin_day: numOrEmpty(f.checkin_day),
  };
}

export default function Profile({ hideHeader }) {
  const navigate = useNavigate();
  const { user, deleteAccount, signOut } = useAuth();
  // Push notifications are managed inside <NotificationSettings/>; the hook is
  // retained here only for any account-scoped initialization side effects.
  usePushNotifications(user?.id);
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeSection, setActiveSection] = useState(hideHeader ? 'body' : null);

  const { profile, isLoading } = useProfile();

  const { data: profileStats } = useQuery({
    queryKey: ['profile-stats', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('log_date, exercises')
        .eq('created_by', user.id)
        .order('log_date', { ascending: false });
      if (error) throw error;
      const totalWorkouts = data.length;
      let totalVolumeLbs = 0;
      for (const log of data) {
        for (const ex of (log.exercises || [])) {
          for (const set of (ex.sets || [])) {
            totalVolumeLbs += (Number(set.weight) || 0) * (Number(set.reps) || 0);
          }
        }
      }
      let streak = 0;
      const uniqueDays = [...new Set(data.map(l => l.log_date))].sort().reverse();
      const today = format(new Date(), 'yyyy-MM-dd');
      const yesterdayDt = new Date();
      yesterdayDt.setDate(yesterdayDt.getDate() - 1);
      const yesterday = format(yesterdayDt, 'yyyy-MM-dd');
      let expected = uniqueDays[0] === yesterday ? yesterday : today;
      for (const d of uniqueDays) {
        if (d === expected) {
          streak++;
          const dt = new Date(`${expected}T12:00:00`);
          dt.setDate(dt.getDate() - 1);
          expected = format(dt, 'yyyy-MM-dd');
        } else {
          break;
        }
      }
      return { totalWorkouts, totalVolumeLbs: Math.round(totalVolumeLbs), streak };
    },
  });

  const [formData, setFormData] = useState({
    daily_calorie_goal: DEFAULT_GOALS.calories,
    daily_protein_goal: DEFAULT_GOALS.protein,
    daily_carbs_goal: DEFAULT_GOALS.carbs,
    daily_fats_goal: DEFAULT_GOALS.fats,
    weight_unit: 'lbs',
    height_cm: '',
    age: '',
    sex: '',
    activity_level: '',
    height_unit: 'in',
    tdee_override: '',
    current_weight: '',
    checkin_day: 0,
    display_name: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [proteinPerLb, setProteinPerLb] = useState(0.8);

  const savedFormDataRef = useRef(null);

  const { weightEntries } = useBodyWeightEntries();
  const { allFoodEntries } = useAllFoodEntries();

  const latestWeight = weightEntries.length > 0
    ? [...weightEntries].sort((a, b) => new Date(b.recorded_date) - new Date(a.recorded_date))[0].weight
    : null;

  // Initialize form data ONCE after the profile query settles (profile may be null for new users).
  const initializedRef = useRef(false);
  useEffect(() => {
    if (isLoading || initializedRef.current) return;
    initializedRef.current = true;
    const p = profile || {};
    const initial = {
      daily_calorie_goal: p.daily_calorie_goal || DEFAULT_GOALS.calories,
      daily_protein_goal: p.daily_protein_goal || DEFAULT_GOALS.protein,
      daily_carbs_goal:   p.daily_carbs_goal   || DEFAULT_GOALS.carbs,
      daily_fats_goal:    p.daily_fats_goal    || DEFAULT_GOALS.fats,
      weight_unit:        p.weight_unit        || 'lbs',
      height_cm:          p.height_cm          || '',
      age:                p.age                || '',
      sex:                p.sex                || '',
      activity_level:     p.activity_level     || '',
      height_unit:        p.height_unit        || 'in',
      tdee_override:      p.tdee_override      || '',
      current_weight:     p.current_weight     || '',
      checkin_day:  p.checkin_day  ?? 0,
      display_name: p.display_name || '',
      timezone:     p.timezone     || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    setFormData(initial);
    savedFormDataRef.current = structuredClone(normalizeFormData(initial));
    if (p.height_unit === 'in' && p.height_cm) {
      const totalInches = p.height_cm;
      setHeightFeet(Math.floor(totalInches / 12).toString());
      setHeightInches((totalInches % 12).toString());
    }
  }, [profile, isLoading]);

  // Re-baseline the dirty snapshot to the committed formData once after init, so
  // a fresh load is never falsely "unsaved" due to any normalize/shape/timing
  // drift between the constructed `initial` and the live formData. Runs once.
  const baselineSyncedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current || baselineSyncedRef.current) return;
    baselineSyncedRef.current = true;
    savedFormDataRef.current = structuredClone(normalizeFormData(formData));
  }, [formData]);

  const isDirty = useMemo(() => {
    if (!savedFormDataRef.current || !baselineSyncedRef.current) return false;
    return JSON.stringify(normalizeFormData(formData)) !== JSON.stringify(normalizeFormData(savedFormDataRef.current));
  }, [formData]);

  // Single source of section visibility. On the mobile hub (no section chosen,
  // standalone page) nothing is "resolved" — the hub list renders instead. On
  // desktop a null selection defaults to Identity. Embedded (hideHeader) always
  // resolves to the body fields. Each section block reads this one value via
  // `sectionClass(id)` rather than its own bespoke ternary.
  const onMobileHub = activeSection === null && !hideHeader;
  const resolvedSection = hideHeader ? 'body' : (activeSection ?? 'identity');
  // A given section block is shown when it matches resolvedSection AND we're not
  // on the mobile hub. On desktop the hub never appears (md:block reveals the
  // default section), so `md:block` is layered on for the null-selection case.
  const sectionClass = (id) => {
    if (onMobileHub) return id === resolvedSection ? 'hidden md:block' : 'hidden';
    return id === resolvedSection ? '' : 'hidden';
  };

  // The save bar must never appear on the mobile hub list or the Settings
  // section (neither mounts an editable field). It is only meaningful when an
  // editable section ('identity' / 'body') is actually open, or when embedded
  // via hideHeader where the body fields are always mounted. The explicit
  // `!onMobileHub` guard keeps the coral bar off a fresh hub load even before
  // the dirty baseline settles.
  const editableSectionOpen =
    !onMobileHub && ((resolvedSection === 'identity' || resolvedSection === 'body') || hideHeader);
  // Render only after the dirty baseline has been synced (baselineSyncedRef is
  // gated inside `isDirty`, which returns false until then) AND a real field
  // change has flipped isDirty — never on the initial settle.
  const showSaveBar = isDirty && editableSectionOpen;

  const updateProfileMutation = useMutation({
    mutationFn: async ({ profileData, weightToLog }) => {
      if (profile) {
        await db.entities.UserProfile.update(profile.id, profileData);
      } else {
        await db.entities.UserProfile.create({ ...profileData, created_by: user.id });
      }
      if (weightToLog) {
        await db.entities.BodyWeightEntry.create({
          weight: parseFloat(weightToLog),
          recorded_date: format(new Date(), "yyyy-MM-dd"),
          notes: null,
          created_by: user.id,
        });
      }
    },
    onSuccess: (_, { formSnapshot, weightToLog }) => {
      savedFormDataRef.current = structuredClone(normalizeFormData(formSnapshot));
      invalidateProfile(queryClient);
      queryClient.invalidateQueries({ queryKey: ['athlete-state-nutrition'] });
      if (weightToLog) invalidateBodyWeight(queryClient);
      toast.success("Profile saved!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update profile");
    },
  });

  const handleCancel = () => {
    if (savedFormDataRef.current) {
      setFormData(savedFormDataRef.current);
      // Also reset the feet/inches display fields
      if (savedFormDataRef.current.height_unit === 'in' && savedFormDataRef.current.height_cm) {
        const totalInches = savedFormDataRef.current.height_cm;
        setHeightFeet(Math.floor(totalInches / 12).toString());
        setHeightInches((totalInches % 12).toString());
      } else {
        setHeightFeet('');
        setHeightInches('');
      }
    }
  };

  const doSubmit = (cleaned) => {
    const previousWeight = savedFormDataRef.current?.current_weight;
    const weightToLog = cleaned.current_weight && parseFloat(cleaned.current_weight) !== parseFloat(previousWeight)
      ? cleaned.current_weight
      : null;
    updateProfileMutation.mutate({ profileData: cleaned, weightToLog, formSnapshot: { ...formData } });
  };

  const handleSubmit = (e) => {
    if (e?.preventDefault) e.preventDefault();
    const cleaned = { ...formData };
    if (cleaned.tdee_override === '' || cleaned.tdee_override === null) delete cleaned.tdee_override;
    if (cleaned.height_cm === '') delete cleaned.height_cm;
    if (cleaned.age === '') delete cleaned.age;
    if (cleaned.sex === '') delete cleaned.sex;
    if (cleaned.activity_level === '') delete cleaned.activity_level;
    if (cleaned.current_weight === '') delete cleaned.current_weight;

    doSubmit(cleaned);
  };

  if (!user || isLoading) {
    return <LoadingScreen />;
  }

  const tdee = getBestTDEE(formData, latestWeight, weightEntries, allFoodEntries, []);
  const displayName = formData.display_name || profile?.display_name || user.user_metadata?.full_name || user.email;
  // Shared deriveInitials helper — same word-leading letter/digit logic the chrome
  // UserAvatar now uses, so one user shows one consistent avatar everywhere.
  const initials = deriveInitials(displayName);

  const NAV = [
    { id: 'identity', label: 'Identity',        icon: User },
    { id: 'body',     label: 'Body & Nutrition', icon: Flame },
    { id: 'settings', label: 'Settings',         icon: Database },
  ];

  return (
    <div className={`p-4 md:p-6 bg-charcoal min-h-screen transition-colors duration-300 ${hideHeader ? 'pt-0 px-0 md:px-0 min-h-0' : ''}`}>
      <div className="max-w-6xl mx-auto">

        {/* ── Two-column layout (desktop) / single column (mobile) ── */}
        <div className={`md:grid md:grid-cols-[220px_1fr] md:gap-8 md:items-start ${hideHeader ? 'md:grid-cols-1 md:block' : ''}`}>

          {/* LEFT SIDEBAR — desktop only */}
          {!hideHeader && (
            <aside className="hidden md:block">
            <div
              className="flex flex-col gap-3"
              style={{
                position: 'sticky',
                top: 'calc(var(--layout-header-height, 64px) + 1.5rem)',
              }}
            >
              {/* Avatar card */}
              <ProfileStatsCard
                initials={initials}
                name={formData.display_name || user.email}
                stats={profileStats ? [
                  { value: profileStats.totalWorkouts, label: "Workouts" },
                  { value: formatVol(profileStats.totalVolumeLbs), label: `Vol (${formData.weight_unit || 'lbs'})` },
                  { value: profileStats.streak, label: "Streak" },
                ] : null}
              />

              {/* Section nav */}
              <nav className="glass-inset p-2 flex flex-col gap-0.5">
                {NAV.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSection(id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                      activeSection === id
                        ? 'bg-brand/[8%] text-brand'
                        : 'text-ink-muted hover:text-ink hover:bg-charcoal-elevated'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </nav>

              {/* Sidebar footer — Sign Out (moved out of the Danger Zone; it is a
                  neutral session action, not a destructive one). */}
              <button
                type="button"
                onClick={async () => {
                  try { await signOut(); toast.success('Signed out successfully'); }
                  catch { toast.error('Failed to sign out'); }
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-left text-ink-muted hover:text-ink hover:bg-charcoal-elevated transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Sign Out
              </button>
            </div>
          </aside>
          )}

          {/* RIGHT CONTENT */}
          <div>
            {/* Mobile: hub view (profile card + nav list). Content flows
                naturally from the top (stats card → nav list → Sign Out) so the
                hierarchy stays tight instead of stranding Sign Out at the
                viewport bottom with a dead void above it. */}
            <div
              className={`${activeSection !== null || hideHeader ? 'hidden' : 'md:hidden flex flex-col'}`}
            >
              {/* No in-page "Profile" h1 here: the Layout chrome header already shows
                  the page title on mobile, so a second one would stack redundantly. */}
              <ProfileStatsCard
                padding="p-5"
                className="mb-3"
                initials={initials}
                name={formData.display_name || user.email}
                stats={profileStats ? [
                  { value: profileStats.totalWorkouts, label: "Workouts" },
                  { value: formatVol(profileStats.totalVolumeLbs), label: `Vol (${formData.weight_unit || 'lbs'})` },
                  { value: profileStats.streak, label: "Streak" },
                ] : null}
              />
              <div className="glass-inset overflow-hidden">
                {NAV.map(({ id, label, icon: Icon }, idx) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSection(id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-left transition-colors active:bg-charcoal-elevated hover:bg-charcoal-elevated ${idx < NAV.length - 1 ? 'border-b border-charcoal-border' : ''}`}
                  >
                    <div className="p-1.5 rounded-md bg-charcoal-elevated">
                      <Icon className="w-3.5 h-3.5 text-ink-muted" />
                    </div>
                    <span className="text-ink flex-1">{label}</span>
                    <ChevronRight className="w-4 h-4 text-ink-muted" />
                  </button>
                ))}
              </div>

              {/* Quick action — Sign Out follows the nav list directly so the hub
                  reads as one tight stack. */}
              <button
                type="button"
                onClick={async () => {
                  try { await signOut(); toast.success('Signed out successfully'); }
                  catch { toast.error('Failed to sign out'); }
                }}
                className="mt-3 w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl glass-inset text-bad font-semibold text-sm active:bg-charcoal-elevated hover:bg-charcoal-elevated transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>

            {/* Mobile: back navigation when inside a section */}
            {activeSection !== null && !hideHeader && (
              <div className="md:hidden mb-5">
                <button
                  type="button"
                  onClick={() => setActiveSection(null)}
                  className="flex items-center gap-1 text-brand text-sm font-medium mb-3 -ml-0.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Profile
                </button>
                <h1 className="type-display text-2xl text-ink">
                  {NAV.find(n => n.id === activeSection)?.label}
                </h1>
              </div>
            )}

            {/* Desktop section heading */}
            {!hideHeader && (
              <div className="hidden md:block mb-6">
                <h1 className="type-display text-2xl text-ink">
                  {NAV.find(n => n.id === resolvedSection)?.label}
                </h1>
                <p className="text-[13px] text-ink-muted mt-0.5">
                  {resolvedSection === 'identity' ? 'Your account details' :
                  resolvedSection === 'body'     ? 'Body stats, nutrition goals, and app preferences' :
                                                    'Notifications, integrations, and account actions'}
                </p>
              </div>
            )}

        <form onSubmit={handleSubmit}>

          {/* ── IDENTITY SECTION ── */}
          <div className={sectionClass('identity')}>
              <Card className="mb-6">
                <CardContent className="pt-6">

                  {/* Section A: Account */}
                  <SectionHeader icon={User} title="Account" />
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="display-name">Display Name</Label>
                      <Input
                        id="display-name"
                        value={formData.display_name}
                        onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                        placeholder="Your name"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" value={user.email} disabled className="mt-1" />
                      <p className="text-xs text-ink-muted mt-1">This is your login email and cannot be changed</p>
                    </div>
                  </div>

                </CardContent>
              </Card>
          </div>

          {/* ── BODY & NUTRITION SECTION ── */}
          <div className={sectionClass('body')}>
              <Card className="mb-6">
                <CardContent className="pt-6">

                  {/* Section C: Body Stats */}
                  <SectionHeader icon={Flame} title="Body Stats" />
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="sex">Sex</Label>
                        <Select
                          value={formData.sex}
                          onValueChange={(value) => setFormData({ ...formData, sex: value })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select sex">
                              {SEX_OPTIONS.find(o => o.value === formData.sex)?.label || "Select sex"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {SEX_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="profile-age">Age</Label>
                        <Input
                          id="profile-age"
                          type="number"
                          value={formData.age}
                          onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) || '' })}
                          min="13"
                          max="120"
                          className="mt-1"
                          placeholder="25"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>Height</Label>
                        {/* Unit selection is passive metadata, not an action, so the
                            selected pill stays NEUTRAL (glass-inset + ink) — coral is
                            reserved for the single action color. The shared Tabs
                            `segment` variant only paints a brand-tinted active pill, so
                            this neutral segmented control is built inline from the same
                            visual tokens (a genuine gap: Tabs has no neutral segment). */}
                        <div className="flex gap-1 glass-inset p-0.5" role="group" aria-label="Height unit">
                          {[
                            { id: 'in', label: 'ft/in' },
                            { id: 'cm', label: 'cm' },
                          ].map(({ id, label }) => (
                            <button
                              key={id}
                              type="button"
                              aria-pressed={formData.height_unit === id}
                              onClick={() => {
                                if (id === 'in' && formData.height_unit === 'cm' && formData.height_cm) {
                                  const totalInches = Math.round(formData.height_cm / 2.54);
                                  setHeightFeet(Math.floor(totalInches / 12).toString());
                                  setHeightInches((totalInches % 12).toString());
                                  setFormData({ ...formData, height_unit: 'in', height_cm: totalInches });
                                } else if (id === 'cm' && formData.height_unit === 'in' && formData.height_cm) {
                                  const cm = Math.round(formData.height_cm * 2.54);
                                  setFormData({ ...formData, height_unit: 'cm', height_cm: cm });
                                } else {
                                  setFormData({ ...formData, height_unit: id });
                                }
                              }}
                              className={`min-h-[44px] px-3.5 rounded-md text-sm transition-[color,background-color] duration-200 ease-[var(--ease)] ${
                                formData.height_unit === id
                                  ? 'bg-[var(--glass-bg)] text-ink font-semibold shadow-[inset_0_1px_0_var(--glass-specular)]'
                                  : 'text-ink-muted hover:text-ink'
                              }`}
                            >{label}</button>
                          ))}
                        </div>
                      </div>
                      {formData.height_unit === 'in' ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-sm">Feet</Label>
                            <Input
                              type="number"
                              placeholder="5"
                              value={heightFeet}
                              onChange={(e) => {
                                const ft = parseInt(e.target.value) || 0;
                                setHeightFeet(e.target.value);
                                setFormData({ ...formData, height_cm: ft * 12 + (parseInt(heightInches) || 0) });
                              }}
                              className="mt-1"
                              min="3"
                              max="8"
                            />
                          </div>
                          <div>
                            <Label className="text-sm">Inches</Label>
                            <Input
                              type="number"
                              placeholder="10"
                              value={heightInches}
                              onChange={(e) => {
                                const inch = parseInt(e.target.value) || 0;
                                setHeightInches(e.target.value);
                                setFormData({ ...formData, height_cm: (parseInt(heightFeet) || 0) * 12 + inch });
                              }}
                              className="mt-1"
                              min="0"
                              max="11"
                            />
                          </div>
                        </div>
                      ) : (
                        <Input
                          type="number"
                          placeholder="178"
                          value={formData.height_cm}
                          onChange={(e) => setFormData({ ...formData, height_cm: parseFloat(e.target.value) || '' })}
                          min="100"
                          max="250"
                        />
                      )}
                    </div>

                    <div>
                      <Label htmlFor="activity-level">Activity Level</Label>
                      <Select
                        value={formData.activity_level}
                        onValueChange={(value) => setFormData({ ...formData, activity_level: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select activity level">
                            {ACTIVITY_LEVELS.find(o => o.value === formData.activity_level)?.label || "Select activity level"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ACTIVITY_LEVELS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label} — {opt.desc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="current-weight">Current Weight ({formData.weight_unit || 'lbs'})</Label>
                      <Input
                        id="current-weight"
                        type="number"
                        step="0.1"
                        value={formData.current_weight}
                        onChange={(e) => setFormData({ ...formData, current_weight: e.target.value })}
                        min="0"
                        className="mt-1"
                        placeholder="e.g. 175"
                      />
                      <p className="text-xs text-ink-muted mt-1">Saving a new weight also adds an entry to your weight log.</p>
                    </div>

                    {tdee.tdee && (
                      <div className="glass-inset p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-ink-muted">Estimated TDEE</div>
                            <div className="text-2xl font-bold text-gold font-technical">{tdee.tdee} cal/day</div>
                          </div>
                          {/* Metadata tag, not data: keep BOTH states neutral
                              (glass-inset + muted ink) so no leaf/biometric hue is
                              spent on a source label. The gold lives on the TDEE
                              number, which is the datum that owns the hue. */}
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium glass-inset text-ink-muted">
                            {tdee.method === 'adaptive' ? 'Adaptive' : 'Formula'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <SectionDivider />

                  {/* Section: Nutrition Goals */}
                  <SectionHeader icon={Calculator} title="Nutrition Goals" />
                  <div className="space-y-4">
                    {tdee.tdee && latestWeight && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="number"
                            step="0.05"
                            min="0.5"
                            max="2.5"
                            value={proteinPerLb}
                            onChange={(e) => setProteinPerLb(e.target.value)}
                            className="w-24"
                          />
                          <span className="text-sm text-ink-muted whitespace-nowrap">
                            g protein / lb = {Math.round(proteinPerLb * (formData.weight_unit === 'kg' ? (latestWeight * 2.205) : latestWeight))}g/day
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => {
                            const weightLbs = formData.weight_unit === 'kg' ? latestWeight * 2.205 : latestWeight;
                            const protein = Math.round(weightLbs * (parseFloat(proteinPerLb) || 0.8));
                            const macros = calculateMacroSplit(tdee.tdee, protein);
                            setFormData(prev => ({
                              ...prev,
                              daily_calorie_goal: macros.calories,
                              daily_protein_goal: macros.protein,
                              daily_carbs_goal: macros.carbs,
                              daily_fats_goal: macros.fats,
                            }));
                          }}
                        >
                          <Calculator className="w-4 h-4 mr-2" />
                          Auto-calculate from TDEE ({tdee.tdee} cal)
                        </Button>
                      </div>
                    )}
                    {!tdee.tdee && (
                      <p className="text-sm text-ink-muted">Fill in your body stats above to enable auto-calculation.</p>
                    )}
                    <MacroGoalsEditor
                      values={formData}
                      onChange={(v) => setFormData(prev => ({ ...prev, ...v }))}
                    />
                  </div>

                  <SectionDivider />

                  {/* Section D: Preferences */}
                  <SectionHeader icon={Flame} title="Preferences" />
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="weight_unit">Weight Unit</Label>
                      <Select
                        value={formData.weight_unit}
                        onValueChange={(value) => setFormData({ ...formData, weight_unit: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select weight unit">
                            {WEIGHT_UNITS.find(o => o.value === formData.weight_unit)?.label || "Select weight unit"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {WEIGHT_UNITS.map((unit) => (
                            <SelectItem key={unit.value} value={unit.value}>
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-ink-muted mt-1">Used when logging workout weights</p>
                    </div>

                    <div>
                      <Label htmlFor="checkin_day">Weekly Check-in Day</Label>
                      <Select
                        value={String(formData.checkin_day)}
                        onValueChange={(value) => setFormData({ ...formData, checkin_day: parseInt(value) })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select check-in day">
                            {DAYS_OF_WEEK.find(d => d.value === formData.checkin_day)?.label || "Sunday"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS_OF_WEEK.map((day) => (
                            <SelectItem key={day.value} value={String(day.value)}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-ink-muted mt-1">Nutrition coach suggests adjustments on this day</p>
                    </div>

                    <div>
                      <Label htmlFor="timezone">Timezone</Label>
                      {/* Hundreds of IANA zones — a flat <Select> is unusable on a
                          phone. The shared Combobox (items mode) gives typeahead
                          filtering so users type "den" → America/Denver. */}
                      <div className="mt-1">
                        <Combobox
                          items={TIMEZONES}
                          value={formData.timezone}
                          onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                          placeholder="Search timezone…"
                        />
                      </div>
                      <p className="text-xs text-ink-muted mt-1">Used to determine today's date for your schedule</p>
                    </div>
                  </div>

                </CardContent>
              </Card>
          </div>{/* end body section */}

          {/* Spacer for sticky bar */}
          {showSaveBar && <div className="h-28 md:h-20" />}
        </form>

        {/* ── SETTINGS SECTION (outside form — all actions are immediate) ── */}
        <div className={sectionClass('settings')}>
          <Card className="mb-4">
            <CardContent className="pt-6">
              <SectionHeader icon={Bell} title="Notifications" />
              <NotificationSettings />

              <SectionDivider />

              <SectionHeader icon={Database} title="Data & Privacy" />
              <DataExport weightEntries={weightEntries} foodEntries={allFoodEntries} />

              <SectionDivider />

              <SectionHeader icon={HelpCircle} title="Feedback" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink">Report a Bug</p>
                  <p className="text-sm text-ink-muted">Found something broken? Let us know.</p>
                </div>
                <Button variant="outline" asChild>
                  <a
                    href="https://docs.google.com/forms/d/e/1FAIpQLSdJPHWYaP6caujXTLhBAEjxWAZlLiGNxqnph3lMm96eMlVArg/viewform?usp=publish-editor"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <HelpCircle className="w-4 h-4" />
                    Report
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-bad/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-bad" />
                <h3 className="text-sm font-semibold text-bad">Danger Zone</h3>
              </div>

              {/* Sign Out is NOT a danger action — it lives in the mobile thumb-zone
                  hub and the desktop sidebar footer. The Danger Zone holds only the
                  irreversible Delete Account control. */}
              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink">Delete Account</p>
                    <p className="text-sm text-ink-muted">Permanently delete your account and all data</p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-bad/20 text-bad hover:bg-bad/10 hover:text-bad"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </Button>
                </div>
              ) : (
                <div className="bg-bad/10 border border-bad/20 rounded-lg p-4">
                  <p className="font-medium text-bad mb-2">Are you sure?</p>
                  <p className="text-sm text-bad mb-4">
                    This will permanently delete your profile, food entries, and workout schedules. This action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading}>
                      Cancel
                    </Button>
                    <Button
                      className="bg-bad hover:bg-bad/80 text-ink"
                      disabled={deleteLoading}
                      onClick={async () => {
                        setDeleteLoading(true);
                        try {
                          await deleteAccount();
                          toast.success('Account deleted successfully');
                          navigate('/login');
                        } catch (error) {
                          toast.error(error.message || 'Failed to delete account');
                          setDeleteLoading(false);
                        }
                      }}
                    >
                      {deleteLoading ? (
                        <><LoadingSpinner size="small" className="mr-2" />Deleting…</>
                      ) : (
                        <><Trash2 className="w-4 h-4 mr-2" />Yes, Delete My Account</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>{/* end settings section */}

          </div>{/* end right content */}
        </div>{/* end two-column grid */}

      </div>{/* end max-w-6xl */}

      {/* Sticky Save Bar — on mobile it docks flush directly above the floating
          liquid-glass dock (dock = ~52px tall, 12px from the bottom inset) and
          shares the dock's glass-elevated chrome so the two read as one unit; no
          detached gap. On desktop it pins to the bottom edge. */}
      <div
        className={`fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 z-[10000] glass-elevated md:bg-charcoal-surface rounded-none border-x-0 border-b-0 transition-transform duration-300 ease-out ${
          showSaveBar ? 'translate-y-0' : 'translate-y-[calc(100%+72px+env(safe-area-inset-bottom,0px))] md:translate-y-full'
        }`}
        style={{ transitionTimingFunction: 'var(--ease)' }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Compact status label — muted ink. Hidden on mobile (<sm) where the
              two thumb-zone buttons need the full bar width; on desktop it shows
              and pushes the actions to the right edge. */}
          <p className="hidden sm:block text-sm text-ink-muted whitespace-nowrap">Unsaved changes</p>
          {/* Cancel / Save span the bar width on mobile (flex-1) so both land in
              the thumb zone; on desktop they shrink to their content. */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Button type="button" size="lg" variant="dim" className="flex-1 sm:flex-none" disabled={updateProfileMutation.isPending} onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" size="lg" variant="primary" className="flex-1 sm:flex-none" disabled={updateProfileMutation.isPending} onClick={handleSubmit}>
              {updateProfileMutation.isPending ? (
                <><LoadingSpinner size="small" className="mr-2" />Saving…</>
              ) : (
                <><Save className="w-4 h-4 mr-2" />Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
