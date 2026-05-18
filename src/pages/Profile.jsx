import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useProfile, useAllFoodEntries, useBodyWeightEntries } from "@/hooks/useUserQueries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen, LoadingSpinner } from "@/components/ui/loading-spinner";
import { invalidateProfile, invalidateBodyWeight, invalidateDietPhases } from "@/lib/queryKeys";
import { useDietPhase } from "@/hooks/useDietPhase";
import { DEFAULT_GOALS, WEIGHT_UNITS, ACTIVITY_LEVELS, SEX_OPTIONS, DAYS_OF_WEEK, EQUIPMENT_OPTIONS } from "@/lib/constants";
import { calculateMacroSplit, suggestProtein, getBestTDEE } from "@/utils/coachingUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Save, Trash2, AlertTriangle, Flame, Apple as AppleIcon, Calculator, Dumbbell, Users, Clock, User, LogOut, HelpCircle, BookOpen, Bell, BellOff, Database } from "lucide-react";
import DataExport from "@/components/DataExport";
import StravaConnect from "@/components/strava/StravaConnect";
import { useTutorial } from "@/hooks/useTutorial";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { toast } from "sonner";
import { differenceInDays, addDays, format } from "date-fns";

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
  const [phaseConflict, setPhaseConflict] = useState(null); // { phase, pendingSubmit }
  const [activeSection, setActiveSection] = useState('identity');

  const { profile, isLoading } = useProfile();
  const { activePhase } = useDietPhase();
  const { replayTutorial } = useTutorial();

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
    username: '',
    bio: '',
    privacy_level: 'private',
    display_name: '',
    // Fitness questionnaire
    fitness_level: '',
    primary_goal: [],
    available_equipment: [],
    days_per_week: 3,
    workout_duration_preference: '',
    injuries_limitations: '',
    exercises_per_day: null,
    include_cardio: false,
    skip_deload: false,
    show_rir: true, // Show RIR (Reps In Reserve) in workout logging
    adaptive_training: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');

  const savedFormDataRef = useRef(null);

  const { weightEntries } = useBodyWeightEntries();
  const { allFoodEntries } = useAllFoodEntries();

  const latestWeight = weightEntries.length > 0
    ? [...weightEntries].sort((a, b) => new Date(b.recorded_date) - new Date(a.recorded_date))[0].weight
    : null;

  // Only initialize form data ONCE when the profile first loads.
  // We intentionally do NOT re-run this when profile refetches after save —
  // that was causing goals to uncheck because the refetch overwrote formData.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (profile && !initializedRef.current) {
      initializedRef.current = true;
      const initial = {
        daily_calorie_goal: profile.daily_calorie_goal || DEFAULT_GOALS.calories,
        daily_protein_goal: profile.daily_protein_goal || DEFAULT_GOALS.protein,
        daily_carbs_goal: profile.daily_carbs_goal || DEFAULT_GOALS.carbs,
        daily_fats_goal: profile.daily_fats_goal || DEFAULT_GOALS.fats,
        weight_unit: profile.weight_unit || 'lbs',
        height_cm: profile.height_cm || '',
        age: profile.age || '',
        sex: profile.sex || '',
        activity_level: profile.activity_level || '',
        height_unit: profile.height_unit || 'in',
        tdee_override: profile.tdee_override || '',
        current_weight: profile.current_weight || '',
        checkin_day: profile.checkin_day ?? 0,
        username: profile.username || '',
        bio: profile.bio || '',
        privacy_level: profile.privacy_level || 'private',
        display_name: profile.display_name || '',
        fitness_level: profile.fitness_level || '',
        // Always normalize to array — handle incorrectly serialized data
        primary_goal: (() => {
          let goal = profile.primary_goal;
          // If it's a string, try to parse it (handles double-stringified JSON)
          while (typeof goal === 'string') {
            try {
              goal = JSON.parse(goal);
            } catch {
              // Not valid JSON, treat as single value
              return [goal];
            }
          }
          // Now it should be an array or null
          return Array.isArray(goal) ? goal : (goal ? [goal] : []);
        })(),
        available_equipment: (() => {
          let equip = profile.available_equipment;
          // Same logic for equipment
          while (typeof equip === 'string') {
            try {
              equip = JSON.parse(equip);
            } catch {
              return equip ? [equip] : [];
            }
          }
          return Array.isArray(equip) ? equip : [];
        })(),
        days_per_week: profile.days_per_week || 3,
        workout_duration_preference: profile.workout_duration_preference || '',
        injuries_limitations: profile.injuries_limitations || '',
        exercises_per_day: profile.exercises_per_day ?? null,
        include_cardio: profile.include_cardio ?? false,
        skip_deload: profile.skip_deload ?? false,
        show_rir: profile.show_rir ?? true,
        adaptive_training: profile.adaptive_training ?? false,
        timezone: profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      setFormData(initial);
      savedFormDataRef.current = initial;
      if (profile.height_unit === 'in' && profile.height_cm) {
        const totalInches = profile.height_cm;
        setHeightFeet(Math.floor(totalInches / 12).toString());
        setHeightInches((totalInches % 12).toString());
      }
    }
  }, [profile]);

  const isDirty = useMemo(() => {
    if (!savedFormDataRef.current) return false;
    return JSON.stringify(formData) !== JSON.stringify(savedFormDataRef.current);
  }, [formData]);

  // Username cooldown
  const isUsernameLocked = useMemo(() => {
    if (!profile?.username_changed_at) return false;
    return differenceInDays(new Date(), new Date(profile.username_changed_at)) < 30;
  }, [profile?.username_changed_at]);

  const usernameUnlockDate = useMemo(() => {
    if (!profile?.username_changed_at) return null;
    return addDays(new Date(profile.username_changed_at), 30);
  }, [profile?.username_changed_at]);

  const updateProfileMutation = useMutation({
    mutationFn: async ({ profileData, weightToLog }) => {
      if (profile) {
        await db.entities.UserProfile.update(profile.id, profileData);
        if (weightToLog) {
          await db.entities.BodyWeightEntry.create({
            weight: parseFloat(weightToLog),
            recorded_date: format(new Date(), "yyyy-MM-dd"),
            notes: null,
            created_by: user.id,
          });
        }
      }
    },
    onSuccess: (_, { profileData, weightToLog }) => {
      // Update the saved snapshot to match what we just wrote to the DB.
      // We do NOT call invalidateProfile here because that triggers a refetch
      // which would re-run the useEffect and overwrite the user's selections.
      // The form already has the correct state — no need to reload from DB.
      savedFormDataRef.current = {
        ...profileData,
        primary_goal: Array.isArray(profileData.primary_goal)
          ? profileData.primary_goal
          : profileData.primary_goal ? [profileData.primary_goal] : [],
        available_equipment: Array.isArray(profileData.available_equipment)
          ? profileData.available_equipment
          : [],
      };
      if (weightToLog) invalidateBodyWeight(queryClient);
      toast.success("Profile saved!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update profile");
    },
  });

  const endPhaseMutation = useMutation({
    mutationFn: async (phaseId) => {
      const { error } = await supabase
        .from("diet_phases")
        .update({ end_date: format(new Date(), "yyyy-MM-dd") })
        .eq("id", phaseId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDietPhases(queryClient);
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

    // If username changed, set the cooldown timestamp
    if (profile && formData.username !== profile.username && formData.username) {
      cleaned.username_changed_at = new Date().toISOString();
    }

    // Detect goal ↔ active phase conflict before saving
    if (activePhase && (activePhase.phase_type === 'cut' || activePhase.phase_type === 'bulk')) {
      const newGoals = (cleaned.primary_goal || []).map(g => g.toLowerCase().replace(' ', '_'));
      const phaseWantsCut = activePhase.phase_type === 'cut';
      const goalConflicts = phaseWantsCut
        ? newGoals.some(g => g === 'muscle_gain')
        : newGoals.some(g => g === 'weight_loss');

      if (goalConflicts) {
        setPhaseConflict({ phase: activePhase, pendingSubmit: cleaned });
        return;
      }
    }

    doSubmit(cleaned);
  };

  if (!user || isLoading) {
    return <LoadingScreen />;
  }

  const tdee = getBestTDEE(formData, latestWeight, weightEntries, allFoodEntries);
  const displayName = formData.display_name || profile?.display_name || user.user_metadata?.full_name || user.email;
  const initials = displayName.includes('@')
    ? displayName[0].toUpperCase()
    : displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const NAV = [
    { id: 'identity', label: 'Identity',         icon: User },
    { id: 'body',     label: 'Body & Nutrition',  icon: Flame },
    { id: 'fitness',  label: 'Training',          icon: Dumbbell },
    { id: 'settings', label: 'Settings',          icon: Database },
  ];

  return (
    <div className="p-4 md:p-6 bg-[#121212] min-h-screen transition-colors duration-300">
      <div className="max-w-6xl mx-auto">

        {phaseConflict && (
          <div className="mb-6 bg-[rgba(245,158,11,0.08)] border border-amber-200 rounded-lg p-4">
            <p className="font-medium text-amber-800 mb-1">Your new goal conflicts with your active {phaseConflict.phase.phase_type === 'cut' ? 'cut' : 'bulk'} phase</p>
            <p className="text-sm text-[#fbbf24] mb-4">
              End your active {phaseConflict.phase.phase_type} phase now so your coaching recommendations match your new goal?
            </p>
            <div className="flex gap-3">
              <Button
                type="button"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={endPhaseMutation.isPending}
                onClick={async () => {
                  await endPhaseMutation.mutateAsync(phaseConflict.phase.id);
                  const pending = phaseConflict.pendingSubmit;
                  setPhaseConflict(null);
                  doSubmit(pending);
                }}
              >
                End phase & save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const pending = phaseConflict.pendingSubmit;
                  setPhaseConflict(null);
                  doSubmit(pending);
                }}
              >
                Keep phase & save anyway
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPhaseConflict(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

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
                <AvatarUpload
                  currentUrl={profile?.avatar_url}
                  username={formData.display_name || formData.username || user.email}
                  profileId={profile?.id}
                />
                <p className="text-white font-semibold mt-3 text-sm leading-tight">
                  {formData.display_name || user.user_metadata?.full_name || user.email}
                </p>
                {formData.username && (
                  <p className="text-[#555555] text-xs mt-0.5">@{formData.username}</p>
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
                        ? 'bg-[rgba(204,255,0,0.08)] text-[#ccff00]'
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
            {/* Mobile page header */}
            <div className="md:hidden mb-6">
              <h1 className="text-[22px] font-bold text-white leading-tight">Profile</h1>
              <p className="text-[13px] text-[#a0a0a0] mt-0.5">Manage your account</p>
            </div>

            {/* Desktop section heading */}
            <div className="hidden md:block mb-6">
              <h1 className="text-[22px] font-bold text-white leading-tight">
                {NAV.find(n => n.id === activeSection)?.label}
              </h1>
              <p className="text-[13px] text-[#a0a0a0] mt-0.5">
                {activeSection === 'identity'  ? 'Your account and social profile' :
                 activeSection === 'body'      ? 'Body stats, nutrition goals, and app preferences' :
                 activeSection === 'fitness'   ? 'Training preferences and fitness profile' :
                                                'Notifications, integrations, and account actions'}
              </p>
            </div>

        <form onSubmit={handleSubmit}>

          {/* ── IDENTITY SECTION ── */}
          <div className={activeSection !== 'identity' ? 'md:hidden' : ''}>
              <Card className="mb-6">
                <CardContent className="pt-6">

                  {/* Section A: Account */}
                  <SectionHeader icon={User} title="Account" />
                  {/* Avatar only shown on mobile — desktop has it in the sidebar */}
                  <div className="flex flex-col items-center mb-4 md:hidden">
                    <AvatarUpload
                      currentUrl={profile?.avatar_url}
                      username={formData.display_name || formData.username || user.email}
                      profileId={profile?.id}
                    />
                  </div>
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

                  <SectionDivider />

                  {/* Section B: Social Profile */}
                  <SectionHeader icon={Users} title="Social Profile" />
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="username">Username</Label>
                      {isUsernameLocked ? (
                        <>
                          <Input
                            id="username"
                            value={formData.username}
                            disabled
                            className="mt-1"
                          />
                          <p className="text-sm text-[#555555] mt-1 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            You can change your username again on {format(usernameUnlockDate, 'MMM d, yyyy')}
                          </p>
                        </>
                      ) : (
                        <>
                          <Input
                            id="username"
                            value={formData.username}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
                              setFormData({ ...formData, username: val });
                            }}
                            maxLength={20}
                            className="mt-1"
                            placeholder="your_username"
                          />
                          <p className="text-sm text-[#555555] mt-1">
                            3-20 characters: letters, numbers, underscores. Can be changed once every 30 days.
                          </p>
                        </>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea
                        id="bio"
                        value={formData.bio}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value.slice(0, 300) })}
                        maxLength={300}
                        rows={3}
                        className="mt-1"
                        placeholder="Tell others about yourself..."
                      />
                      <p className="text-sm text-[#555555] mt-1">{formData.bio.length}/300</p>
                    </div>

                    <div>
                      <Label htmlFor="privacy">Profile Visibility</Label>
                      <Select
                        value={formData.privacy_level}
                        onValueChange={(value) => setFormData({ ...formData, privacy_level: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select visibility">
                            {formData.privacy_level === 'public' && 'Public'}
                            {formData.privacy_level === 'friends_only' && 'Friends Only'}
                            {formData.privacy_level === 'private' && 'Private'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">Public — Searchable and visible to everyone</SelectItem>
                          <SelectItem value="friends_only">Friends Only — Add friends by exact username only</SelectItem>
                          <SelectItem value="private">Private — Your profile is completely hidden</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
          </div>

          {/* ── BODY & NUTRITION SECTION ── */}
          <div className={activeSection !== 'body' ? 'md:hidden' : ''}>
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
                              formData.height_unit === 'in' ? 'bg-[#1a1a1a] shadow text-[#ccff00] font-medium' : 'text-[#555555]'
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
                              formData.height_unit === 'cm' ? 'bg-[#1a1a1a] shadow text-[#ccff00] font-medium' : 'text-[#555555]'
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
                            <div className="text-2xl font-bold text-white text-white">{tdee.tdee} cal/day</div>
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

                  {/* Section D: Preferences */}
                  <SectionHeader icon={Dumbbell} title="Preferences" />
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
                        className="mt-1 w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[rgba(204,255,0,0.3)]"
                      >
                        {Intl.supportedValuesOf('timeZone').map(tz => (
                          <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                      <p className="text-sm text-[#555555] mt-1">Used to determine today's date for your schedule</p>
                    </div>
                  </div>

                  {/* RIR Display Toggle */}
                  <div className="mt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.show_rir}
                        onChange={(e) => setFormData({ ...formData, show_rir: e.target.checked })}
                        className="w-4 h-4 rounded border-[#2a2a2a] text-[#ccff00] focus:ring-[rgba(204,255,0,0.3)]"
                      />
                      <div>
                        <span className="font-medium">Show RIR (Reps In Reserve)</span>
                        <p className="text-sm text-[#555555]">Display RIR tracking column when logging workouts. RIR indicates how many more reps you could have done (0 = failure, 3 = 3 more reps possible).</p>
                      </div>
                    </label>
                  </div>

                  {/* Adaptive Training Toggle */}
                  <div className="mt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.adaptive_training}
                        onChange={(e) => setFormData({ ...formData, adaptive_training: e.target.checked })}
                        className="w-4 h-4 rounded border-[#2a2a2a] text-[#ccff00] focus:ring-[rgba(204,255,0,0.3)]"
                      />
                      <div>
                        <span className="font-medium">Adaptive Cardio Suggestions</span>
                        <p className="text-sm text-[#555555]">During your weekly check-in, suggest cardio session duration adjustments based on how many runs you completed via Strava. Only applies to AI-generated running programs — never modifies your strength workouts or manually built plans.</p>
                      </div>
                    </label>
                  </div>

                </CardContent>
              </Card>
          </div>{/* end body section */}

          {/* ── FITNESS SECTION ── */}
          <div className={activeSection !== 'fitness' ? 'md:hidden' : ''}>
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <SectionHeader icon={Dumbbell} title="Fitness Profile" />

                  {/* Fitness Level */}
                  <div className="mb-6">
                    <Label className="text-sm font-semibold mb-2 block">Fitness Level</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "beginner",     label: "Beginner",     desc: "New to working out" },
                        { value: "intermediate", label: "Intermediate", desc: "Some experience" },
                        { value: "advanced",     label: "Advanced",     desc: "Regular training" },
                      ].map(opt => {
                        const selected = formData.fitness_level === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, fitness_level: opt.value }))}
                            className={`p-3 rounded-xl border-2 text-center transition-all ${
                              selected
                                ? "border-[#ccff00] bg-[rgba(204,255,0,0.05)]"
                                : "border-[#2a2a2a] hover:border-[rgba(204,255,0,0.3)] border-[#2a2a2a]"
                            }`}
                          >
                            <div className={`text-sm font-semibold ${selected ? "text-[#ccff00] text-[#ccff00]" : "text-white"}`}>
                              {opt.label}
                            </div>
                            <div className="text-xs text-[#555555] mt-0.5 hidden sm:block">{opt.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <SectionDivider />

                  {/* Primary Goals */}
                  <div className="mb-6">
                    <Label className="text-sm font-semibold mb-1 block">Primary Goals</Label>
                    <p className="text-xs text-[#555555] mb-3">Select all that apply — the AI tailors sets, reps, and exercises to your goals</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {[
                        {
                          value: "weight_loss",
                          label: "Weight Loss",
                          desc: "Higher reps, shorter rest, calorie-burning circuits",
                        },
                        {
                          value: "muscle_gain",
                          label: "Muscle Gain",
                          desc: "Heavy compound lifts, 4–5 sets, longer rest periods",
                        },
                        {
                          value: "endurance",
                          label: "Build Endurance",
                          desc: "High reps, minimal rest, sustained effort sets",
                        },
                        {
                          value: "general_fitness",
                          label: "General Fitness",
                          desc: "Balanced mix of strength, cardio, and mobility",
                        },
                        {
                          value: "flexibility",
                          label: "Improve Flexibility",
                          desc: "Mobility drills, stretches, recovery work",
                        },
                      ].map(opt => {
                        const selected = (formData.primary_goal || []).includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              primary_goal: selected
                                ? prev.primary_goal.filter(g => g !== opt.value)
                                : [...(prev.primary_goal || []), opt.value],
                            }))}
                            className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                              selected
                                ? "border-[#ccff00] bg-[rgba(204,255,0,0.05)]"
                                : "border-[#2a2a2a] hover:border-[rgba(204,255,0,0.3)] border-[#2a2a2a]"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-semibold ${selected ? "text-[#ccff00] text-[#ccff00]" : "text-white"}`}>
                                {opt.label}
                              </div>
                              <div className="text-xs text-[#555555] mt-0.5 leading-snug">{opt.desc}</div>
                            </div>
                            <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center mt-0.5 ${
                              selected ? "bg-[#ccff00] border-[#ccff00]" : "border-[#2a2a2a]"
                            }`}>
                              {selected && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                                </svg>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <SectionDivider />

                  {/* Schedule */}
                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Workout Duration</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: "15 min", label: "15 min", desc: "Quick" },
                          { value: "30 min", label: "30 min", desc: "Short" },
                          { value: "45 min", label: "45 min", desc: "Standard" },
                          { value: "60+ min", label: "60+ min", desc: "Extended" },
                        ].map(opt => {
                          const selected = formData.workout_duration_preference === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, workout_duration_preference: opt.value }))}
                              className={`p-2.5 rounded-lg border-2 text-center transition-all ${
                                selected
                                  ? "border-[#ccff00] bg-[rgba(204,255,0,0.05)]"
                                  : "border-[#2a2a2a] hover:border-[rgba(204,255,0,0.3)] border-[#2a2a2a]"
                              }`}
                            >
                              <div className={`text-sm font-semibold ${selected ? "text-[#ccff00] text-[#ccff00]" : "text-[#a0a0a0] text-[#a0a0a0]"}`}>
                                {opt.label}
                              </div>
                              <div className="text-xs text-[#a0a0a0]">{opt.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold mb-2 block">
                        Training Days / Week
                        <span className="ml-2 text-[#ccff00] font-bold">{formData.days_per_week}</span>
                        {formData.days_per_week === 6 && (
                          <span className="ml-2 text-xs text-amber-500 font-normal">High frequency — recover well</span>
                        )}
                      </Label>
                      <div className="flex gap-2 mt-1">
                        {[1,2,3,4,5,6].map(n => {
                          const sel = formData.days_per_week === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, days_per_week: n }))}
                              className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${
                                sel
                                  ? "border-[rgba(204,255,0,0.5)] bg-[#ccff00] text-black font-bold"
                                  : "border-[#2a2a2a] text-[#a0a0a0] hover:border-[rgba(204,255,0,0.3)]  text-[#a0a0a0]"
                              }`}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-[#a0a0a0] mt-1.5">days per week</p>
                    </div>
                  </div>

                  <SectionDivider />

                  {/* Equipment */}
                  <div className="mb-6">
                    <Label className="text-sm font-semibold mb-1 block">Available Equipment</Label>
                    <p className="text-xs text-[#555555] mb-3">Only exercises you can actually do will be included</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(EQUIPMENT_OPTIONS || []).map(opt => {
                        const selected = (formData.available_equipment || []).includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              available_equipment: selected
                                ? prev.available_equipment.filter(e => e !== opt.value)
                                : [...(prev.available_equipment || []), opt.value],
                            }))}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-left transition-all ${
                              selected
                                ? "border-[#ccff00] bg-[rgba(204,255,0,0.05)]"
                                : "border-[#2a2a2a] hover:border-[rgba(204,255,0,0.3)] border-[#2a2a2a]"
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                              selected ? "bg-[#ccff00] border-[#ccff00]" : "border-[#2a2a2a]"
                            }`}>
                              {selected && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                                </svg>
                              )}
                            </div>
                            <span className={`text-xs font-medium ${selected ? "text-[#ccff00] text-[#ccff00]" : "text-[#a0a0a0] text-[#a0a0a0]"}`}>
                              {opt.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <SectionDivider />

                  {/* Injuries */}
                  <div>
                    <Label className="text-sm font-semibold mb-1 block">Injuries or Limitations</Label>
                    <p className="text-xs text-[#555555] mb-2">Helps the AI avoid exercises that could aggravate existing issues</p>
                    <Textarea
                      value={formData.injuries_limitations}
                      onChange={e => setFormData({ ...formData, injuries_limitations: e.target.value })}
                      placeholder="e.g. Lower back pain — avoid heavy deadlifts. Left knee issue — no deep squats."
                      className="min-h-[80px] text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
          </div>{/* end fitness section */}

          {/* Spacer for sticky bar */}
          {isDirty && <div className="h-28 md:h-20" />}
        </form>

        {/* ── SETTINGS SECTION (outside form — all actions are immediate) ── */}
        <div className={activeSection !== 'settings' ? 'md:hidden' : ''}>
          <Card className="mb-4">
            <CardContent className="pt-6">
              <SectionHeader icon={Bell} title="Notifications" />
              {!pushSupported ? (
                <p className="text-sm text-[#555555]">Push notifications are not supported on this browser. Add the app to your home screen to enable them.</p>
              ) : permission === "denied" ? (
                <p className="text-sm text-[#f87171]">Notifications are blocked. Enable them in your browser/iOS settings to receive reminders.</p>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">Workout & Check-In Reminders</span>
                    <p className="text-sm text-[#555555]">Daily workout reminders and weekly check-in prompts.</p>
                  </div>
                  <Button
                    variant={isSubscribed ? "outline" : "primary"}
                    size="sm"
                    onClick={isSubscribed ? unsubscribe : subscribe}
                    className="ml-4 shrink-0"
                  >
                    {isSubscribed ? (
                      <><BellOff className="w-4 h-4 mr-1.5" />Turn Off</>
                    ) : (
                      <><Bell className="w-4 h-4 mr-1.5" />Enable</>
                    )}
                  </Button>
                </div>
              )}

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

              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-medium text-white">Replay Tutorial</p>
                  <p className="text-sm text-[#a0a0a0]">Restart the app tutorial</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => { replayTutorial(); navigate('/dashboard'); toast.success('Tutorial restarted!'); }}
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  Replay
                </Button>
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
