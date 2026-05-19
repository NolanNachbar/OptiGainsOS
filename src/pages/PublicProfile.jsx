import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePublicProfile, useSharedWorkouts, useSharedPrograms, useCloneSharedWorkout, useCloneProgram } from "@/hooks/useSocialQueries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingScreen, LoadingSpinner } from "@/components/ui/loading-spinner";
import { User, Lock, Dumbbell, Flame, Trophy, ArrowLeft, Copy, BarChart3, Share2, BookOpen, Calendar, Repeat, TrendingUp } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { toast } from "sonner";
import { format } from "date-fns";
import MuscleHeatMap from "@/components/MuscleHeatMap";
import { getWorkoutBodyData } from "@/utils/muscleVolumeUtils";
import SEO from "@/components/SEO";

export default function PublicProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("workouts");
  const { data: profile, isLoading, error } = usePublicProfile(username);
  const { data: sharedWorkouts = [], isLoading: loadingWorkouts } = useSharedWorkouts(profile?.created_by);
  const { data: sharedPrograms = [], isLoading: loadingPrograms } = useSharedPrograms(profile?.created_by);
  const cloneWorkout = useCloneSharedWorkout();
  const cloneProgram = useCloneProgram();

  const handleCloneWorkout = async (sharedWorkout) => {
    try {
      const cloned = await cloneWorkout.mutateAsync(sharedWorkout);
      toast.success(`"${sharedWorkout.workout_title}" added to your workouts!`);
      navigate(`/create-workout?edit=${cloned.id}`);
    } catch (err) {
      toast.error(err.message || "Failed to clone workout");
    }
  };

  const handleCloneProgram = async (sharedProgram) => {
    try {
      const cloned = await cloneProgram.mutateAsync(sharedProgram.program_id);
      toast.success(`"${sharedProgram.program?.name}" added to your programs!`);
      navigate(`/program/${cloned.id}`);
    } catch (err) {
      toast.error(err.message || "Failed to clone program");
    }
  };

  if (isLoading) return <LoadingScreen />;

  if (error || !profile) {
    return (
      <div className="bg-[#121212] min-h-screen transition-colors duration-300">
        <SEO title="User Not Found" description="The requested user profile could not be found." />
        <div className="p-4 md:p-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[#a0a0a0] hover:text-white mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
        <div className="px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <Card className="">
              <CardContent className="py-12 text-center">
                <User className="w-12 h-12 text-[#a0a0a0] mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">User not found</h3>
                <p className="text-[#555555]">No user with the username "@{username}" exists.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (profile.restricted) {
    return (
      <div className="bg-[#121212] min-h-screen transition-colors duration-300">
        <SEO title={`@${profile.username} (Private)`} description="This profile is private or only visible to friends." />
        <div className="p-4 md:p-6">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[#a0a0a0] hover:text-white mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
        <div className="px-4 md:px-6">
          <div className="max-w-5xl mx-auto">
            <Card className="">
              <CardContent className="py-12 text-center">
                <Lock className="w-12 h-12 text-[#a0a0a0] mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">@{profile.username}</h3>
                <p className="text-[#555555]">
                  {profile.privacy_level === 'private'
                    ? "This profile is private."
                    : "This profile is only visible to friends."}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const ldJson = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": profile.display_name || profile.username,
    "alternateName": profile.username,
    "description": profile.bio || `Fitness profile for ${profile.username} on Vektor`,
    "image": profile.avatar_url,
    "url": `https://vektor.app/profile/${profile.username}`,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://vektor.app/profile/${profile.username}`
    }
  };

  return (
    <div className="bg-[#121212] min-h-screen transition-colors duration-300">
      <SEO 
        title={`${profile.display_name || profile.username} (@${profile.username})`}
        description={profile.bio || `Check out ${profile.display_name || profile.username}'s fitness progress, shared workouts, and training programs on Vektor.`}
        ogImage={profile.avatar_url}
        ldJson={ldJson}
      />
      <div className="p-4 md:p-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[#a0a0a0] hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>
      <div className="px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="pt-8 pb-6">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4">
                <UserAvatar url={profile.avatar_url} username={profile.username} size="lg" className="w-20 h-20 text-2xl" />
              </div>
              {profile.display_name && (
                <h2 className="text-2xl font-bold text-white">{profile.display_name}</h2>
              )}
              <p className={`${profile.display_name ? 'text-sm text-[#555555]' : 'text-2xl font-bold text-white'}`}>@{profile.username}</p>
              {profile.bio && (
                <p className="text-[#a0a0a0] mt-2 max-w-md">{profile.bio}</p>
              )}
              {profile.isOwn && (
                <span className="mt-2 px-3 py-1 bg-brand/10 text-brand text-xs font-medium rounded-full">
                  This is you
                </span>
              )}
              {!profile.isOwn && profile.isFriend && (
                <span className="mt-2 px-3 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                  Friends
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="border-none">
            <CardContent className="py-4 text-center">
              <Dumbbell className="w-6 h-6 text-brand mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{profile.total_workouts || 0}</p>
              <p className="text-xs text-[#555555]">Workouts</p>
            </CardContent>
          </Card>
          <Card className="border-none">
            <CardContent className="py-4 text-center">
              <Flame className="w-6 h-6 text-orange-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{profile.current_streak || 0}</p>
              <p className="text-xs text-[#555555]">Day Streak</p>
            </CardContent>
          </Card>
          <Card className="border-none">
            <CardContent className="py-4 text-center">
              <Trophy className="w-6 h-6 text-amber-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{profile.longest_streak || 0}</p>
              <p className="text-xs text-[#555555]">Best Streak</p>
            </CardContent>
          </Card>
        </div>

        {/* Additional Info */}
        {(profile.fitness_level || (profile.primary_goal && profile.primary_goal.length > 0)) && (
          <Card className="border-none mb-6">
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-2">
                {profile.fitness_level && (
                  <span className="px-3 py-1 bg-[rgba(59,130,246,0.08)] text-[#60a5fa] text-sm rounded-full capitalize">
                    {profile.fitness_level}
                  </span>
                )}
                {Array.isArray(profile.primary_goal) && profile.primary_goal.map((goal) => (
                  <span key={goal} className="px-3 py-1 bg-emerald-50 text-emerald-700 text-sm rounded-full capitalize">
                    {goal.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Shared Content */}
        <Card className="">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-brand" />
              Shared Content
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="workouts">
                  <Dumbbell className="w-4 h-4 mr-1.5" />
                  Workouts
                  {sharedWorkouts.length > 0 && (
                    <span className="ml-1.5 text-xs">({sharedWorkouts.length})</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="programs">
                  <BookOpen className="w-4 h-4 mr-1.5" />
                  Programs
                  {sharedPrograms.length > 0 && (
                    <span className="ml-1.5 text-xs">({sharedPrograms.length})</span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="workouts">
                {loadingWorkouts ? (
                  <div className="flex justify-center py-8"><LoadingSpinner /></div>
                ) : sharedWorkouts.length === 0 ? (
                  <p className="text-center text-[#555555] py-6">No shared workouts yet</p>
                ) : (
                  <div className="space-y-4">
                    {sharedWorkouts.map((sw) => (
                      <Card key={sw.id} className="bg-[#202020]">
                        <CardContent className="pt-5 pb-4">
                          <div className="flex gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h4 className="font-semibold text-white">{sw.workout_title}</h4>
                                  {sw.caption && (
                                    <p className="text-sm text-[#a0a0a0] mt-1">{sw.caption}</p>
                                  )}
                                  {sw.prs && sw.prs.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {sw.prs.map((pr, i) => (
                                        <Badge key={i} className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                                          <Trophy className="w-3 h-3 mr-1" />
                                          {pr.exercise} {pr.weight} lbs PR
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className="text-xs">
                                      {sw.exercises?.length || 0} exercises
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {sw.share_type === 'detailed' ? (
                                        <><BarChart3 className="w-3 h-3 mr-1" />With performance</>
                                      ) : (
                                        <><Dumbbell className="w-3 h-3 mr-1" />Exercises only</>
                                      )}
                                    </Badge>
                                    <span className="text-xs text-[#a0a0a0]">
                                      {format(new Date(sw.created_at), "MMM d")}
                                    </span>
                                  </div>
                                </div>
                                {!profile.isOwn && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0 text-brand border-brand/30 hover:bg-brand/[8%]"
                                    onClick={() => handleCloneWorkout(sw)}
                                    disabled={cloneWorkout.isPending}
                                  >
                                    <Copy className="w-4 h-4 mr-1" />
                                    Use Template
                                  </Button>
                                )}
                              </div>

                              {/* Exercise list preview */}
                              <div className="space-y-1.5">
                                {(sw.exercises || []).map((ex, i) => (
                                  <div key={i} className="flex items-center gap-2 text-sm">
                                    <span className="w-5 h-5 rounded-full bg-brand/[8%]0 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                      {i + 1}
                                    </span>
                                    <span className="text-[#a0a0a0]">{ex.name}</span>
                                    {sw.share_type === 'blank' || !Array.isArray(ex.sets) ? (
                                      <span className="text-[#a0a0a0] text-xs">
                                        {Array.isArray(ex.sets) ? ex.sets.length : ex.sets} x {ex.reps}
                                      </span>
                                    ) : (
                                      <span className="text-[#a0a0a0] text-xs">
                                        {ex.sets.length} sets
                                        {ex.sets[0]?.weight > 0 && ` - ${ex.sets[0].weight} lbs`}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Muscle heatmap */}
                            {(() => {
                              const bodyData = getWorkoutBodyData(sw.exercises || []);
                              return bodyData.length > 0 ? (
                                <>
                                  <div className="w-px bg-[#2a2a2a] shrink-0" />
                                  <div className="w-[130px] shrink-0 flex flex-col justify-center">
                                    <MuscleHeatMap data={bodyData} className="flex-1" />
                                  </div>
                                </>
                              ) : null;
                            })()}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="programs">
                {loadingPrograms ? (
                  <div className="flex justify-center py-8"><LoadingSpinner /></div>
                ) : sharedPrograms.length === 0 ? (
                  <p className="text-center text-[#555555] py-6">No shared programs yet</p>
                ) : (
                  <div className="space-y-4">
                    {sharedPrograms.map((sp) => {
                      const program = sp.program;
                      const DIFFICULTY_COLORS = {
                        beginner: "bg-[rgba(34,197,94,0.1)] text-[#4ade80]",
                        intermediate: "bg-yellow-100 text-yellow-700",
                        advanced: "bg-[rgba(239,68,68,0.1)] text-[#f87171]",
                      };
                      const GOAL_LABELS = {
                        muscle_gain: "Muscle Gain",
                        fat_loss: "Fat Loss",
                        strength: "Strength",
                        endurance: "Endurance",
                        general: "General Fitness",
                      };

                      return (
                        <Card key={sp.id} className="bg-[#202020]">
                          <CardContent className="pt-5 pb-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-start gap-2 mb-2">
                                  <TrendingUp className="w-5 h-5 text-brand mt-0.5 flex-shrink-0" />
                                  <div>
                                    <h4 className="font-semibold text-white">{program?.name || 'Untitled Program'}</h4>
                                    {sp.caption && (
                                      <p className="text-sm text-[#a0a0a0] mt-1">{sp.caption}</p>
                                    )}
                                  </div>
                                </div>

                                {program && (
                                  <div className="space-y-2 mt-3">
                                    <div className="flex flex-wrap gap-2">
                                      <Badge className={DIFFICULTY_COLORS[program.difficulty] || "bg-[#202020] text-white"}>
                                        {program.difficulty}
                                      </Badge>
                                      <Badge variant="outline">
                                        {GOAL_LABELS[program.goal] || program.goal}
                                      </Badge>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-[#a0a0a0]" />
                                        <span className="text-[#a0a0a0]">{program.cycle_length}-day cycle</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <Repeat className="w-3.5 h-3.5 text-[#a0a0a0]" />
                                        <span className="text-[#a0a0a0]">{program.num_cycles} cycles</span>
                                      </div>
                                    </div>

                                    {program.description && (
                                      <p className="text-xs text-[#555555] pt-2 border-t border-[#2a2a2a]">
                                        {program.description}
                                      </p>
                                    )}

                                    <span className="text-xs text-[#a0a0a0]">
                                      Shared {format(new Date(sp.created_at), "MMM d")}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {!profile.isOwn && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="shrink-0 text-brand border-brand/30 hover:bg-brand/[8%]"
                                  onClick={() => handleCloneProgram(sp)}
                                  disabled={cloneProgram.isPending}
                                >
                                  <Copy className="w-4 h-4 mr-1" />
                                  Use Template
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
