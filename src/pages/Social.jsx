import { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePendingFriendRequests,
  useNewlyAcceptedFriends,
  useMarkFriendsAsViewed,
  useSendFriendRequest,
  useSentFriendRequests,
  useFriends,
} from "@/hooks/useSocialQueries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCommentSection, CommentPanel } from "@/components/social/CommentSection";
import { ExploreFeed } from "@/components/social/ExploreFeed";
import { MiniVolumeChart } from "@/components/social/MiniVolumeChart";
import { SocialContent } from "@/components/social/SocialContent";
import { LeaderboardsContent } from "@/components/social/LeaderboardsContent";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { getWorkoutPhotoUrl } from "@/utils/imageUpload";
import {
  Dumbbell,
  Flame,
  Trophy,
  Copy,
  TrendingUp,
  Users,
  Medal,
  UserPlus,
  MessageCircle,
  Trash2,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_COLORS } from "@/lib/strava";
const StaticRouteMap = lazy(() => import("@/components/strava/StaticRouteMap"));
import { format } from "date-fns";
import { toast } from "sonner";

function useSuggestedUsers() {
  const { user } = useAuth();
  const { friends = [] } = useFriends();
  const { sentRequests = [] } = useSentFriendRequests();
  const [pendingIds, setPendingIds] = useState(new Set());
  const sendRequest = useSendFriendRequest();

  const friendIds = new Set(friends.map(f =>
    f.requester_id === user?.id ? f.addressee_id : f.requester_id
  ));
  const sentIds = new Set(sentRequests.map(r => r.addressee_id));

  const { data: rawSuggestions = [] } = useQuery({
    queryKey: ['suggestedUsers', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('created_by, username, display_name, avatar_url, total_workouts, current_streak')
        .eq('privacy_level', 'public')
        .neq('created_by', user.id)
        .order('total_workouts', { ascending: false })
        .limit(8);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const visible = rawSuggestions
    .filter(p => !friendIds.has(p.created_by) && !sentIds.has(p.created_by) && !pendingIds.has(p.created_by))
    .slice(0, 6);

  function handleAddFriend(profile) {
    if (!profile.username) return;
    setPendingIds(prev => new Set([...prev, profile.created_by]));
    sendRequest.mutate(profile.username, {
      onError: (err) => {
        setPendingIds(prev => { const s = new Set(prev); s.delete(profile.created_by); return s; });
        toast.error(err.message || 'Failed to send request');
      },
    });
  }

  return { visible, handleAddFriend };
}

function SuggestedUsersPanel() {
  const { visible, handleAddFriend } = useSuggestedUsers();
  if (!visible.length) return null;

  return (
    <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-4 mb-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#555555] mb-3">
        Suggested
      </p>
      <div className="space-y-2.5">
        {visible.map((profile) => (
          <div key={profile.created_by} className="flex items-center gap-2.5">
            <Link to={profile.username ? `/profile/${profile.username}` : "#"}>
              <UserAvatar url={profile.avatar_url} username={profile.username || profile.display_name} size="sm" />
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={profile.username ? `/profile/${profile.username}` : "#"}>
                <p className="text-sm font-medium text-white truncate text-left hover:text-[#ccff00] transition-colors">
                  {profile.display_name || profile.username || "User"}
                </p>
              </Link>
              {profile.total_workouts > 0 && (
                <p className="text-xs text-[#a0a0a0] text-left">{profile.total_workouts} workouts</p>
              )}
            </div>
            <button
              onClick={() => handleAddFriend(profile)}
              disabled={!profile.username}
              className="shrink-0 text-xs font-semibold px-2 py-1 rounded-md bg-[rgba(204,255,0,0.1)] text-[#ccff00] hover:bg-[rgba(204,255,0,0.18)] transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiscoverAthletes() {
  const { visible, handleAddFriend } = useSuggestedUsers();
  if (!visible.length) return null;

  return (
    <div className="mb-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#555555] mb-3">
        Discover_Athletes
      </p>
      <div className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        {visible.map((profile) => (
          <div
            key={profile.created_by}
            className="shrink-0 w-[120px] rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-3 flex flex-col items-center gap-2"
          >
            <Link to={profile.username ? `/profile/${profile.username}` : "#"}>
              <UserAvatar url={profile.avatar_url} username={profile.username || profile.display_name} size="md" />
            </Link>
            <div className="w-full text-center min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {profile.display_name || profile.username || "User"}
              </p>
              <p className="text-[10px] text-[#555555] truncate">@{profile.username}</p>
              {profile.total_workouts > 0 && (
                <p className="text-[10px] text-[#a0a0a0] mt-0.5">{profile.total_workouts} workouts</p>
              )}
            </div>
            <button
              onClick={() => handleAddFriend(profile)}
              disabled={!profile.username}
              className="w-full flex items-center justify-center gap-1 text-[10px] font-semibold py-1 rounded-md bg-[rgba(204,255,0,0.1)] text-[#ccff00] hover:bg-[rgba(204,255,0,0.18)] transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-3 h-3" />
              Add
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityStreamHeader({ feedFilter, setFeedFilter }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#555555]">
        Activity_Stream
      </p>
      <div className="inline-flex rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-0.5">
        <button
          onClick={() => setFeedFilter("friends")}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            feedFilter === "friends"
              ? "bg-[rgba(204,255,0,0.12)] text-[#ccff00] font-bold"
              : "text-[#a0a0a0] hover:text-white"
          }`}
        >
          <Users className="w-3 h-3" />
          Friends
        </button>
        <button
          onClick={() => setFeedFilter("trending")}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            feedFilter === "trending"
              ? "bg-[rgba(204,255,0,0.12)] text-[#ccff00] font-bold"
              : "text-[#a0a0a0] hover:text-white"
          }`}
        >
          <TrendingUp className="w-3 h-3" />
          Trending
        </button>
      </div>
    </div>
  );
}

function isFriendActiveToday(fp) {
  if (!fp?.current_streak || !fp?.last_workout_date) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lastWorkout = new Date(fp.last_workout_date); lastWorkout.setHours(0, 0, 0, 0);
  return Math.round((today - lastWorkout) / 86400000) <= 1;
}

export default function Social() {
  const { pendingRequests = [] } = usePendingFriendRequests();
  const { newlyAccepted = [] } = useNewlyAcceptedFriends();
  const markAsViewed = useMarkFriendsAsViewed();
  const { friends = [] } = useFriends();

  const [desktopCenter, setDesktopCenter] = useState("feed"); // "feed" | "friends"
  const [mobileTab, setMobileTab] = useState("feed"); // "feed" | "friends" | "ranks"
  const [feedFilter, setFeedFilter] = useState("friends");

  const isViewingFriends = desktopCenter === "friends" || mobileTab === "friends";

  useEffect(() => {
    if (isViewingFriends) markAsViewed();
  }, [isViewingFriends, markAsViewed]);

  const totalNotifications = pendingRequests.length + newlyAccepted.length;

  return (
    <div className="bg-[#121212] min-h-screen p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto">

        {/* Mobile tab bar */}
        <div className="xl:hidden flex rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-1 mb-4 gap-1">
          {[
            { key: "feed", icon: Dumbbell, label: "Feed" },
            { key: "friends", icon: Users, label: "Friends", badge: totalNotifications },
            { key: "ranks", icon: Medal, label: "Ranks" },
          ].map(({ key, icon: Icon, label, badge }) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
                mobileTab === key
                  ? "bg-[rgba(204,255,0,0.12)] text-[#ccff00] font-bold"
                  : "text-[#a0a0a0] hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge > 0 && (
                <span className="bg-[rgba(239,68,68,0.1)] text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>


        {/* Three-column layout (xl+) / single column (mobile) */}
        <div className="xl:grid xl:grid-cols-[260px_1fr_290px] xl:gap-5">

          {/* LEFT SIDEBAR — desktop only */}
          <aside className="hidden xl:block">
          <div
            className="flex flex-col gap-4 [&::-webkit-scrollbar]:hidden"
            style={{
              position: 'sticky',
              top: 'calc(var(--layout-header-height, 64px) + 1.5rem)',
              maxHeight: 'calc(100vh - var(--layout-header-height, 64px) - 3rem)',
              overflowY: 'auto',
              scrollbarWidth: 'none',
              padding: '4px',
              margin: '-4px',
            }}
          >

            {/* Feed */}
            <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a0a0a0] mb-3">
                Feed
              </p>
              <div className="flex gap-1 bg-[#1a1a1a] rounded-lg p-1">
                <button
                  onClick={() => setFeedFilter("friends")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    feedFilter === "friends"
                      ? "bg-[rgba(204,255,0,0.12)] text-[#ccff00] font-bold"
                      : "text-[#555555] hover:text-white"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Friends
                </button>
                <button
                  onClick={() => setFeedFilter("trending")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    feedFilter === "trending"
                      ? "bg-[rgba(204,255,0,0.12)] text-[#ccff00] font-bold"
                      : "text-[#555555] hover:text-white"
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Trending
                </button>
              </div>
            </div>

            {/* Connections */}
            <div className="rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#a0a0a0]">
                  Connections
                </p>
                {totalNotifications > 0 && (
                  <span className="bg-[rgba(239,68,68,0.1)] text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {totalNotifications}
                  </span>
                )}
              </div>

              {friends.length === 0 ? (
                <p className="text-xs text-[#a0a0a0] text-center py-4">No connections yet</p>
              ) : (
                <div className="space-y-0.5">
                  {friends.slice(0, 6).map((friendship) => {
                    const fp = friendship.friendProfile;
                    const isActive = isFriendActiveToday(fp);
                    return (
                      <Link
                        key={friendship.id}
                        to={fp?.username ? `/profile/${fp.username}` : "#"}
                        onClick={fp?.username ? undefined : (e) => e.preventDefault()}
                        className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-[#242424] transition-colors"
                      >
                        <UserAvatar
                          url={fp?.avatar_url}
                          username={fp?.username || fp?.display_name}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate text-left">
                            {fp?.display_name || fp?.username || "Unknown"}
                          </p>
                          <p className="text-xs text-[#a0a0a0] truncate text-left">
                            {isActive && fp?.current_streak > 0
                              ? `${fp.current_streak} day streak`
                              : fp?.username
                              ? `@${fp.username}`
                              : ""}
                          </p>
                        </div>
                        {isActive && (
                          <div className="w-2 h-2 rounded-full bg-[rgba(204,255,0,0.08)]0 shrink-0" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => setDesktopCenter("friends")}
                className="mt-3 w-full flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#a0a0a0] hover:text-[#ccff00] transition-colors py-2 border-t border-[#2a2a2a]"
              >
                Manage Connections
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
          </aside>

          {/* CENTER COLUMN */}
          <main>
            {/* Desktop */}
            <div className="hidden xl:block">
              {desktopCenter === "friends" ? (
                <div>
                  <button
                    onClick={() => setDesktopCenter("feed")}
                    className="flex items-center gap-1.5 text-sm font-medium text-[#555555] hover:text-[#ccff00] transition-colors mb-4"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Feed
                  </button>
                  <SocialContent />
                </div>
              ) : (
                <ExploreFeed friendsOnly={feedFilter === "friends"} />
              )}
            </div>

            {/* Mobile */}
            <div className="xl:hidden">
              {mobileTab === "feed" && (
                <>
                  <DiscoverAthletes />
                  <ActivityStreamHeader feedFilter={feedFilter} setFeedFilter={setFeedFilter} />
                  <ExploreFeed friendsOnly={feedFilter === "friends"} />
                </>
              )}
              {mobileTab === "friends" && <SocialContent />}
              {mobileTab === "ranks" && <LeaderboardsContent />}
            </div>
          </main>

          {/* RIGHT SIDEBAR — desktop only */}
          <aside className="hidden xl:block">
            <div
              className="[&::-webkit-scrollbar]:hidden"
              style={{
                position: 'sticky',
                top: 'calc(var(--layout-header-height, 64px) + 1.5rem)',
                maxHeight: 'calc(100vh - var(--layout-header-height, 64px) - 3rem)',
                overflowY: 'auto',
                scrollbarWidth: 'none',
                padding: '4px',
                margin: '-4px',
              }}
            >
              <SuggestedUsersPanel />
              <LeaderboardsContent />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function FeedCard({ item, isOwn, showAddFriend, onToggleKudos, onClone, isCloning, onUnshare }) {
  const commentState = useCommentSection(item.id, item.commentCount || 0);
  const username = item.authorProfile?.username || "Unknown";
  const displayName = item.authorProfile?.display_name || username;
  const [exercisesExpanded, setExercisesExpanded] = useState(false);

  const exerciseLimit = item.share_type === "detailed" ? 3 : 4;
  const allExercises = item.exercises || [];
  const hasMore = allExercises.length > exerciseLimit;
  const visibleExercises = exercisesExpanded ? allExercises : allExercises.slice(0, exerciseLimit);

  const borderColor = item.share_type === 'cardio' ? '#f97316' : item.share_type === 'detailed' ? '#4f46e5' : '#7c3aed';

  return (
    <div
      className="rounded-xl border-l-4 bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="px-5 pt-5 pb-4">
        {/* Author header */}
        <div className="flex items-start gap-3 mb-3">
          <Link to={`/profile/${username}`}>
            <UserAvatar url={item.authorProfile?.avatar_url} username={username} size="md" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                to={`/profile/${username}`}
                className="font-semibold text-white hover:text-[#ccff00] text-sm"
              >
                {displayName}
              </Link>
              <span className="text-xs text-[#a0a0a0]">@{username}</span>
              <span className="text-xs text-[#a0a0a0]">·</span>
              <span className="text-xs text-[#a0a0a0]">{format(new Date(item.created_at), "MMM d, h:mm a")}</span>
              {showAddFriend && <AddFriendButton username={username} />}
            </div>
          </div>
          <div className="flex gap-2">
            {!isOwn && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-[#ccff00] border-[rgba(204,255,0,0.3)] hover:bg-[rgba(204,255,0,0.08)] text-xs"
                onClick={onClone}
                disabled={isCloning}
              >
                <Copy className="w-3.5 h-3.5 mr-1" /> Use Template
              </Button>
            )}
            {isOwn && onUnshare && (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-[#f87171] hover:bg-[rgba(239,68,68,0.08)] text-xs"
                onClick={onUnshare}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Unshare
              </Button>
            )}
          </div>
        </div>

        {/* Workout title + caption */}
        <h4 className="font-semibold text-white mb-1">{item.workout_title}</h4>
        {item.caption && <p className="text-sm text-[#a0a0a0] mb-2">{item.caption}</p>}

        {/* Photo carousel */}
        {item.photo_urls?.length > 0 && <FeedPhotoCarousel photoUrls={item.photo_urls} />}

        {/* PR badges */}
        {item.prs && item.prs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {item.prs.map((pr, i) => (
              <Badge key={i} className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                <Trophy className="w-3 h-3 mr-1" />
                {pr.exercise} {pr.weight} lbs PR
              </Badge>
            ))}
          </div>
        )}

        {/* Cardio map — full-bleed */}
        {item.share_type === "cardio" && item.exercises?.[0]?.map_polyline && (
          <div className="-mx-5 mb-3 overflow-hidden">
            <Suspense fallback={<div style={{ height: 200 }} className="bg-[#1a1a1a] animate-pulse" />}>
              <StaticRouteMap
                polyline={item.exercises[0].map_polyline}
                mapKey={item.id}
                height={200}
              />
            </Suspense>
          </div>
        )}

        {/* Cardio stats */}
        {item.share_type === "cardio" && (() => {
          const c = item.exercises?.[0] || {};
          const typeLabel = ACTIVITY_TYPE_LABELS[c.activity_type] || c.activity_type || "Activity";
          const typeColor = ACTIVITY_TYPE_COLORS[c.activity_type] || "bg-[#202020] text-white";
          const miles = c.distance_meters > 0 ? (c.distance_meters / 1609.34).toFixed(2) : null;
          const secs = c.moving_time_seconds;
          const dur = secs ? (secs >= 3600 ? `${Math.floor(secs/3600)}h ${Math.floor((secs%3600)/60)}m` : `${Math.floor(secs/60)}m`) : null;
          const pace = (c.average_speed && c.distance_meters > 0 && ['Run','VirtualRun','Walk','Hike'].includes(c.activity_type))
            ? (() => { const mpmi = (1609.34 / c.average_speed) / 60; const m = Math.floor(mpmi); const s = Math.round((mpmi - m) * 60); return `${m}:${String(s).padStart(2,'0')} /mi`; })()
            : null;
          const stats = [
            miles && { value: `${miles} mi`, label: "Distance" },
            dur && { value: dur, label: "Time" },
            pace && { value: pace, label: "Pace" },
            c.average_heartrate && { value: Math.round(c.average_heartrate), label: "Avg BPM" },
            c.calories && { value: Math.round(c.calories), label: "Cal" },
          ].filter(Boolean);
          return (
            <div className="mb-4">
              <span className={`inline-block text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full mb-3 ${typeColor}`}>{typeLabel}</span>
              {stats.length > 0 && (
                <div className="flex">
                  {stats.map((stat, i) => (
                    <div key={i} className={`flex-1 flex flex-col ${i > 0 ? 'border-l border-[#2a2a2a] pl-4' : ''}`}>
                      <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">{stat.label}</span>
                      <span className="text-xl font-bold tabular-nums text-white mt-0.5">{stat.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Stats grid (detailed shares) */}
        {item.share_type === "detailed" && (() => {
          const exercises = item.exercises || [];
          const totalSets = exercises.reduce(
            (sum, ex) => sum + (Array.isArray(ex.sets) ? ex.sets.length : 0),
            0
          );
          const totalVolume = exercises.reduce((sum, ex) => {
            const sets = Array.isArray(ex.sets) ? ex.sets : [];
            return sum + sets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0);
          }, 0);
          const durationMin = item.duration_seconds ? Math.round(item.duration_seconds / 60) : null;

          const stats = [
            { value: totalSets, label: "Sets" },
            totalVolume > 0 && {
              value: totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume,
              label: "Lbs",
            },
            { value: exercises.length, label: "Exercises" },
            durationMin && { value: durationMin, label: "Min" },
          ].filter(Boolean);

          return (
            <div className="flex mb-4">
              {stats.map((stat, i) => (
                <div key={i} className={`flex-1 flex flex-col ${i > 0 ? 'border-l border-[#2a2a2a] pl-4' : ''}`}>
                  <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">{stat.label}</span>
                  <span className="text-xl font-bold tabular-nums text-white mt-0.5">{stat.value}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Stats strip for other share types (not detailed, not cardio) */}
        {item.share_type !== "detailed" && item.share_type !== "cardio" && (() => {
          const exercises = item.exercises || [];
          const totalSets = exercises.reduce((sum, ex) => {
            const s = ex.sets;
            return sum + (Array.isArray(s) ? s.length : typeof s === 'number' ? s : 0);
          }, 0);
          const topPr = item.prs?.[0];
          const stats = [
            { value: exercises.length, label: "Exercises" },
            { value: totalSets, label: "Sets" },
            { value: topPr ? `${topPr.weight} lbs` : "—", label: "Top" },
          ];
          return (
            <div className="flex mb-4">
              {stats.map((stat, i) => (
                <div key={i} className={`flex-1 flex flex-col ${i > 0 ? 'border-l border-[#2a2a2a] pl-4' : ''}`}>
                  <span className="text-xs font-bold uppercase tracking-widest text-[#a0a0a0]">{stat.label}</span>
                  <span className="text-xl font-bold tabular-nums text-white mt-0.5">{stat.value}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Volume bars */}
        {item.share_type === "detailed" && (
          <div className="mb-3">
            <MiniVolumeChart exercises={item.exercises} />
          </div>
        )}

        {/* Exercise list */}
        {item.share_type !== "cardio" && (
          <div className="space-y-1.5 mb-3">
            {visibleExercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[#a0a0a0] text-xs font-medium shrink-0">
                  {i + 1}
                </span>
                <span className="text-white text-[#a0a0a0]">{ex.name}</span>
                {item.share_type === "blank" || !Array.isArray(ex.sets) ? (
                  <span className="text-[#a0a0a0] text-xs">
                    {Array.isArray(ex.sets) ? ex.sets.length : ex.sets} x {ex.reps}
                  </span>
                ) : (
                  <span className="text-[#a0a0a0] text-xs">
                    {ex.sets.length} sets
                    {ex.sets[0]?.weight > 0 && ` · ${ex.sets[0].weight} lbs`}
                  </span>
                )}
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => setExercisesExpanded(!exercisesExpanded)}
                className="text-xs text-[#ccff00] hover:text-[#ccff00] ml-7 font-medium"
              >
                {exercisesExpanded ? "Show less" : `+${allExercises.length - exerciseLimit} more`}
              </button>
            )}
          </div>
        )}

        {/* Engagement row */}
        <div className="flex items-center gap-3 pt-2 border-t border-[#2a2a2a]">
          <button
            onClick={onToggleKudos}
            className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
              item.userReacted ? "text-orange-500" : "text-[#a0a0a0] hover:text-orange-500"
            }`}
          >
            <Flame className={`w-4 h-4 ${item.userReacted ? "fill-orange-500" : ""}`} />
            {item.reactionCount > 0 ? item.reactionCount : "Fire"}
          </button>
          <button
            onClick={() => commentState.setExpanded(!commentState.expanded)}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              commentState.expanded
                ? "text-[#ccff00] font-medium"
                : "text-[#a0a0a0] hover:text-[#a0a0a0]"
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            {commentState.displayCount > 0 ? commentState.displayCount : "Comment"}
          </button>
        </div>
      </div>

      {commentState.expanded && (
        <div className="px-5 pb-4 text-left">
          <CommentPanel {...commentState} />
        </div>
      )}
    </div>
  );
}

export function FeedPhotoCarousel({ photoUrls }) {
  const [signedUrls, setSignedUrls] = useState([]);

  useEffect(() => {
    if (!photoUrls || photoUrls.length === 0) return;
    let cancelled = false;

    const load = async () => {
      const urls = [];
      for (const path of photoUrls) {
        try {
          const url = await getWorkoutPhotoUrl(path);
          if (url) urls.push(url);
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setSignedUrls(urls);
    };

    load();
    return () => { cancelled = true; };
  }, [photoUrls]);

  if (signedUrls.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
      {signedUrls.map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          className="h-40 rounded-lg object-cover flex-shrink-0"
          loading="lazy"
        />
      ))}
    </div>
  );
}

function AddFriendButton({ username }) {
  const [sent, setSent] = useState(false);
  const sendRequest = useSendFriendRequest();

  const handleAdd = async () => {
    try {
      await sendRequest.mutateAsync(username);
      setSent(true);
    } catch (err) {
      const msg = err.message || "Failed to send request";
      if (msg.includes("already") || msg.includes("pending")) setSent(true);
      toast.error(msg);
    }
  };

  if (sent) {
    return <span className="text-xs text-[#a0a0a0] font-medium">Requested</span>;
  }

  return (
    <button
      onClick={handleAdd}
      disabled={sendRequest.isPending}
      className="flex items-center gap-1 text-xs font-semibold text-[#ccff00] hover:text-[#ccff00] transition-colors"
    >
      <UserPlus className="w-3.5 h-3.5" />
      {sendRequest.isPending ? "Sending..." : "Follow"}
    </button>
  );
}
