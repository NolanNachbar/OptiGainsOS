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
import { Save, Trash2, AlertTriangle, Flame, Users, User, LogOut, HelpCircle, Bell, Database, ChevronRight, ChevronLeft, Calculator } from "lucide-react";
import DataExport from "@/components/DataExport";
import NotificationSettings from "@/components/NotificationSettings";
import StravaConnect from "@/components/strava/StravaConnect";
import { toast } from "sonner";
import { format } from "date-fns";

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 rounded-lg bg-[#202020]">
        <Icon className="w-4 h-4 text-[#a0a0a0]" />
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-[#2a2a2a] my-6" />;
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, deleteAccount, signOut } = useAuth();
  const { isSupported: pushSupported, isSubscribed, permission, subscribe, unsubscribe } = usePushNotifications(user?.id);
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeSection, setActiveSection] = useState(null);

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
      const today = new Date().toISOString().split('T')[0];
      let expected = today;
      for (const d of uniqueDays) {
        if (d === expected) {
          streak++;
          const dt = new Date(expected);
          dt.setDate(dt.getDate() - 1);
          expected = dt.toISOString().split('T')[0];
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
    savedFormDataRef.current = initial;
    if (p.height_unit === 'in' && p.height_cm) {
      const totalInches = p.height_cm;
      setHeightFeet(Math.floor(totalInches / 12).toString());
      setHeightInches((totalInches % 12).toString());
    }
  }, [profile, isLoading]);

  const isDirty = useMemo(() => {
    if (!savedFormDataRef.current) return false;
    return JSON.stringify(formData) !== JSON.stringify(savedFormDataRef.current);
  }, [formData]);

  const updateProfileMutation = useMutation({
    mutationFn: async ({ profileData, weightToLog }) => {
      if (profile) {
        await db.entities.UserProfile.update(profile.id, profileData);
      } else {
        await db.entities.UserProfile.create({ ...profileData, created_by: user.id });
        invalidateProfile(queryClient);
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
    onSuccess: (_, { profileData, weightToLog }) => {
      savedFormDataRef.current = { ...profileData };
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
    const weightToLog = cleaned.current_weight && cleaned.current_weight !== previousWeight
      ? cleaned.current_weight
      : null;
    updateProfileMutation.mutate({ profileData: cleaned, weightToLog });
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
  const initials = displayName.includes('@')
    ? displayName[0].toUpperCase()
    : displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const NAV = [
    { id: 'identity', label: 'Identity',        icon: User },
    { id: 'body',     label: 'Body & Nutrition', icon: Flame },
    { id: 'settings', label: 'Settings',         icon: Database },
  ];

  return (
    <div className="p-4 md:p-6 bg-[#121212] min-h-screen transition-colors duration-300">
      <div className="max-w-6xl mx-auto">

        {/* ── Two-column layout (desktop) / single column (mobile) ── */}
        <div className="md:grid md:grid-cols-[220px_1fr] md:gap-8 md:items-start">

          {/* LEFT SIDEBAR — desktop only */}
          <aside className="hidden md:block">
            <div
              className="flex flex-col gap-3"
              style={{
                position: 'sticky',
                top: 'calc(var(--layout-header-height, 64px) + 1.5rem)',
              }}
            >
              {/* Avatar card */}
              <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-4 text-center">
                <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center mx-auto">
                  <span className="text-brand text-2xl font-bold">
                    {(formData.display_name || user.email || 'N')[0].toUpperCase()}
                  </span>
                </div>
                <p className="text-white font-semibold mt-3 text-sm leading-tight">
                  {formData.display_name || user.email}
                </p>
                {profileStats && (
                  <div className="grid grid-cols-3 gap-1 mt-4 pt-4 border-t border-[#2a2a2a]">
                    <div>
                      <p className="text-white font-bold text-lg leading-tight">{profileStats.totalWorkouts}</p>
                      <p className="text-[#555555] text-[10px] uppercase tracking-wider mt-0.5">Workouts</p>
                    </div>
                    <div>
                      <p className="text-white font-bold text-lg leading-tight">
                        {profileStats.totalVolumeLbs >= 1000
                          ? `${(profileStats.totalVolumeLbs / 1000).toFixed(0)}k`
                          : profileStats.totalVolumeLbs}
                      </p>
                      <p className="text-[#555555] text-[10px] uppercase tracking-wider mt-0.5">Vol (lbs)</p>
                    </div>
                    <div>
                      <p className="text-brand font-bold text-lg leading-tight">{profileStats.streak}</p>
                      <p className="text-[#555555] text-[10px] uppercase tracking-wider mt-0.5">Streak</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Section nav */}
              <nav className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-2 flex flex-col gap-0.5">
                {NAV.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSection(id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                      activeSection === id
                        ? 'bg-brand/[8%] text-brand'
                        : 'text-[#a0a0a0] hover:text-white hover:bg-[#242424]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* RIGHT CONTENT */}
          <div>
            {/* Mobile: hub view (profile card + nav list) */}
            <div className={activeSection !== null ? 'hidden' : 'md:hidden mb-4'}>
              <h1 className="text-[22px] font-bold text-white leading-tight mb-4">Profile</h1>
              <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-5 text-center mb-3">
                <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center mx-auto">
                  <span className="text-brand text-2xl font-bold">
                    {(formData.display_name || user.email || 'N')[0].toUpperCase()}
                  </span>
                </div>
                <p className="text-white font-semibold mt-3 text-sm leading-tight">
                  {formData.display_name || user.email}
                </p>
                {profileStats && (
                  <div className="grid grid-cols-3 gap-1 mt-4 pt-4 border-t border-[#2a2a2a]">
                    <div>
                      <p className="text-white font-bold text-lg leading-tight">{profileStats.totalWorkouts}</p>
                      <p className="text-[#555555] text-[10px] uppercase tracking-wider mt-0.5">Workouts</p>
                    </div>
                    <div>
                      <p className="text-white font-bold text-lg leading-tight">
                        {profileStats.totalVolumeLbs >= 1000
                          ? `${(profileStats.totalVolumeLbs / 1000).toFixed(0)}k`
                          : profileStats.totalVolumeLbs}
                      </p>
                      <p className="text-[#555555] text-[10px] uppercase tracking-wider mt-0.5">Vol (lbs)</p>
                    </div>
                    <div>
                      <p className="text-brand font-bold text-lg leading-tight">{profileStats.streak}</p>
                      <p className="text-[#555555] text-[10px] uppercase tracking-wider mt-0.5">Streak</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden">
                {NAV.map(({ id, label, icon: Icon }, idx) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSection(id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-left transition-colors active:bg-[#242424] hover:bg-[#242424] ${idx < NAV.length - 1 ? 'border-b border-[#2a2a2a]' : ''}`}
                  >
                    <div className="p-1.5 rounded-md bg-[#242424]">
                      <Icon className="w-3.5 h-3.5 text-brand" />
                    </div>
                    <span className="text-white flex-1">{label}</span>
                    <ChevronRight className="w-4 h-4 text-[#555555]" />
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile: back navigation when inside a section */}
            {activeSection !== null && (
              <div className="md:hidden mb-5">
                <button
                  type="button"
                  onClick={() => setActiveSection(null)}
                  className="flex items-center gap-1 text-brand text-sm font-medium mb-3 -ml-0.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Profile
                </button>
                <h1 className="text-[22px] font-bold text-white leading-tight">
                  {NAV.find(n => n.id === activeSection)?.label}
                </h1>
              </div>
            )}

            {/* Desktop section heading */}
            <div className="hidden md:block mb-6">
              <h1 className="text-[22px] font-bold text-white leading-tight">
                {NAV.find(n => n.id === (activeSection ?? 'identity'))?.label}
              </h1>
              <p className="text-[13px] text-[#a0a0a0] mt-0.5">
                {(activeSection ?? 'identity') === 'identity' ? 'Your account details' :
                 (activeSection ?? 'identity') === 'body'     ? 'Body stats, nutrition goals, and app preferences' :
                 (activeSection ?? 'identity') === 'fitness'  ? 'Training preferences and fitness profile' :
                                                                'Notifications, integrations, and account actions'}
              </p>
            </div>

        <form onSubmit={handleSubmit}>

          {/* ── IDENTITY SECTION ── */}
          <div className={activeSection === 'identity' ? '' : activeSection === null ? 'hidden md:block' : 'hidden'}>
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
                      <p className="text-sm text-[#555555] mt-1">This is your login email and cannot be changed</p>
                    </div>
                  </div>

                </CardContent>
              </Card>
          </div>

          {/* ── BODY & NUTRITION SECTION ── */}
          <div className={activeSection === 'body' ? '' : 'hidden'}>
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
                        <div className="flex gap-1 bg-[#202020] rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (formData.height_unit === 'cm' && formData.height_cm) {
                                const totalInches = Math.round(formData.height_cm / 2.54);
                                setHeightFeet(Math.floor(totalInches / 12).toString());
                                setHeightInches((totalInches % 12).toString());
                                setFormData({ ...formData, height_unit: 'in', height_cm: totalInches });
                              } else {
                                setFormData({ ...formData, height_unit: 'in' });
                              }
                            }}
                            className={`px-3 py-1 rounded-md text-sm transition-all ${
                              formData.height_unit === 'in' ? 'bg-[#1a1a1a] shadow text-brand font-medium' : 'text-[#555555]'
                            }`}
                          >ft/in</button>
                          <button
                            type="button"
                            onClick={() => {
                              if (formData.height_unit === 'in' && formData.height_cm) {
                                const cm = Math.round(formData.height_cm * 2.54);
                                setFormData({ ...formData, height_unit: 'cm', height_cm: cm });
                              } else {
                                setFormData({ ...formData, height_unit: 'cm' });
                              }
                            }}
                            className={`px-3 py-1 rounded-md text-sm transition-all ${
                              formData.height_unit === 'cm' ? 'bg-[#1a1a1a] shadow text-brand font-medium' : 'text-[#555555]'
                            }`}
                          >cm</button>
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
                      <p className="text-xs text-[#555555] mt-1">Saving a new weight also adds an entry to your weight log.</p>
                    </div>

                    {tdee.tdee && (
                      <div className="bg-[rgba(249,115,22,0.08)] border border-[rgba(249,115,22,0.2)] rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-[#a0a0a0]">Estimated TDEE</div>
                            <div className="text-2xl font-bold text-white">{tdee.tdee} cal/day</div>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            tdee.method === 'adaptive' ? 'bg-[rgba(34,197,94,0.1)] text-[#4ade80]' : 'bg-[rgba(59,130,246,0.1)] text-[#60a5fa]'
                          }`}>
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
                          <span className="text-sm text-[#555555] whitespace-nowrap">
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
                      <p className="text-sm text-[#555555]">Fill in your body stats above to enable auto-calculation.</p>
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
                      <p className="text-sm text-[#555555] mt-1">Used when logging workout weights</p>
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
                      <p className="text-sm text-[#555555] mt-1">Nutrition coach suggests adjustments on this day</p>
                    </div>

                    <div>
                      <Label htmlFor="timezone">Timezone</Label>
                      <select
                        id="timezone"
                        value={formData.timezone}
                        onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                        className="mt-1 w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
                      >
                        {Intl.supportedValuesOf('timeZone').map(tz => (
                          <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                      <p className="text-sm text-[#555555] mt-1">Used to determine today's date for your schedule</p>
                    </div>
                  </div>

                </CardContent>
              </Card>
          </div>{/* end body section */}

          {/* Spacer for sticky bar */}
          {isDirty && <div className="h-28 md:h-20" />}
        </form>

        {/* ── SETTINGS SECTION (outside form — all actions are immediate) ── */}
        <div className={activeSection === 'settings' ? '' : 'hidden'}>
          <Card className="mb-4">
            <CardContent className="pt-6">
              <SectionHeader icon={Bell} title="Notifications" />
              <NotificationSettings />

              <SectionDivider />

              <SectionHeader icon={Users} title="Connected Apps" />
              <StravaConnect />

              <SectionDivider />

              <SectionHeader icon={Database} title="Data & Privacy" />
              <DataExport weightEntries={weightEntries} foodEntries={allFoodEntries} />

              <SectionDivider />

              <SectionHeader icon={HelpCircle} title="Feedback" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">Report a Bug</p>
                  <p className="text-sm text-[#a0a0a0]">Found something broken? Let us know.</p>
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

          <Card className="border-[rgba(239,68,68,0.15)]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-[#f87171]" />
                <h3 className="text-sm font-semibold text-[#f87171]">Danger Zone</h3>
              </div>

              <SectionDivider />

              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-medium text-white">Sign Out</p>
                  <p className="text-sm text-[#a0a0a0]">Sign out of your account</p>
                </div>
                <Button
                  variant="outline"
                  className="border-[rgba(239,68,68,0.15)] text-[#f87171] hover:bg-[rgba(239,68,68,0.08)] hover:text-[#f87171]"
                  onClick={async () => {
                    try { await signOut(); toast.success('Signed out successfully'); }
                    catch { toast.error('Failed to sign out'); }
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>

              <SectionDivider />

              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-white">Delete Account</p>
                    <p className="text-sm text-[#a0a0a0]">Permanently delete your account and all data</p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-[rgba(239,68,68,0.15)] text-[#f87171] hover:bg-[rgba(239,68,68,0.08)] hover:text-[#f87171]"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </Button>
                </div>
              ) : (
                <div className="bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.15)] rounded-lg p-4">
                  <p className="font-medium text-[#f87171] mb-2">Are you sure?</p>
                  <p className="text-sm text-[#f87171] mb-4">
                    This will permanently delete your profile, food entries, and workout schedules. This action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading}>
                      Cancel
                    </Button>
                    <Button
                      className="bg-[rgba(239,68,68,0.1)] hover:bg-[rgba(239,68,68,0.1)] text-white"
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
                        <><LoadingSpinner size="small" className="mr-2" />Deleting...</>
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

      {/* Sticky Save Bar */}
      <div
        className={`fixed bottom-[56px] md:bottom-0 left-0 right-0 z-[10000] bg-[#1a1a1a] border-t border-[#2a2a2a] transition-transform duration-300 ease-out ${
          isDirty ? 'translate-y-0' : 'translate-y-[200%]'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-[#a0a0a0]">You have unsaved changes</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" disabled={updateProfileMutation.isPending} onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" variant="primary" disabled={updateProfileMutation.isPending} onClick={handleSubmit}>
              {updateProfileMutation.isPending ? (
                <><LoadingSpinner size="small" className="mr-2" />Saving...</>
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
