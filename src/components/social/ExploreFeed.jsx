import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useExploreFeed, useToggleKudos, useCloneSharedWorkout, useCloneProgram, useUnshareWorkout, useUnshareProgram, useUnshareRecipe } from "@/hooks/useSocialQueries";
import { FeedCard } from "@/pages/Social";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useNavigate, Link } from "react-router-dom";
import { Compass, Copy, Calendar, Repeat, Dumbbell, TrendingUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { format } from "date-fns";
import { supabase } from "@/api/supabaseClient";
import ProgramLikeButton from "@/components/programs/ProgramLikeButton";
import { ProgramCommentToggle, ProgramCommentPanel, useProgramCommentSection } from "@/components/social/ProgramCommentSection";
import RecipeFeedCard from "@/components/social/RecipeFeedCard";

export function ExploreFeed({ friendsOnly = false }) {
  const { user } = useAuth();
  const { data: allItems = [], isLoading } = useExploreFeed();
  const toggleKudos = useToggleKudos();
  const cloneWorkout = useCloneSharedWorkout();
  const cloneProgram = useCloneProgram();
  const unshareWorkout = useUnshareWorkout();
  const unshareProgram = useUnshareProgram();
  const unshareRecipe = useUnshareRecipe();
  const navigate = useNavigate();
  const [cloneTarget, setCloneTarget] = useState(null);
  const [unshareTarget, setUnshareTarget] = useState(null);

  // Filter items based on friendsOnly prop
  const items = friendsOnly
    ? allItems.filter(item => item.isFriend || item.created_by === user.id)
    : allItems;

  const confirmClone = async () => {
    if (!cloneTarget) return;
    try {
      if (cloneTarget.type === 'program') {
        const cloned = await cloneProgram.mutateAsync(cloneTarget.program_id);
        toast.success(`"${cloneTarget.program_title}" added to your programs!`);
        setCloneTarget(null);
        navigate(`/program/${cloned.id}`);
      } else {
        const cloned = await cloneWorkout.mutateAsync(cloneTarget);
        toast.success(`"${cloneTarget.workout_title}" added to your workouts!`);
        setCloneTarget(null);
        navigate(`/create-workout?edit=${cloned.id}`);
      }
    } catch (err) {
      toast.error(err.message || "Failed to clone");
    }
  };

  const confirmUnshare = async () => {
    if (!unshareTarget) return;
    try {
      if (unshareTarget.type === 'program') {
        await unshareProgram.mutateAsync(unshareTarget.id);
        toast.success("Program removed from feed");
      } else if (unshareTarget.type === 'recipe') {
        await unshareRecipe.mutateAsync(unshareTarget.id);
        toast.success("Recipe removed from feed");
      } else {
        await unshareWorkout.mutateAsync(unshareTarget.id);
        toast.success("Workout removed from feed");
      }
      setUnshareTarget(null);
    } catch (err) {
      toast.error("Failed to unshare");
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="border border-[#2a2a2a]">
        <CardContent className="py-12 text-center">
          <Compass className="w-10 h-10 text-[#a0a0a0] mx-auto mb-3" />
          <p className="text-[#555555] mb-1">
            {friendsOnly ? "No posts from friends yet" : "Nothing to discover yet"}
          </p>
          <p className="text-sm text-[#a0a0a0]">
            {friendsOnly
              ? "When your friends share workouts, programs, or recipes, they'll appear here."
              : "Discover public workouts, programs, and recipes from the community."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const isOwn = item.created_by === user.id;
        const showAddFriend = !item.isFriend && !isOwn;

        if (item.type === 'program') {
          return (
            <ProgramFeedCard
              key={item.id}
              item={item}
              isOwn={isOwn}
              onClone={() => setCloneTarget(item)}
              isCloning={cloneProgram.isPending}
              onUnshare={() => setUnshareTarget({ ...item, type: 'program' })}
            />
          );
        }

        if (item.type === 'recipe') {
          return (
            <RecipeFeedCard
              key={item.id}
              item={item}
              isOwn={isOwn}
              onUnshare={() => setUnshareTarget({ ...item, type: 'recipe' })}
            />
          );
        }

        return (
          <FeedCard
            key={item.id}
            item={item}
            isOwn={isOwn}
            showAddFriend={showAddFriend}
            onToggleKudos={() =>
              toggleKudos.mutate({
                sharedWorkoutId: item.id,
                hasReacted: item.userReacted,
              })
            }
            onClone={() => setCloneTarget(item)}
            isCloning={cloneWorkout.isPending}
            onUnshare={() => setUnshareTarget({ ...item, type: 'workout' })}
          />
        );
      })}

      {/* Clone confirmation dialog */}
      <Dialog open={!!cloneTarget} onOpenChange={(open) => !open && setCloneTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Use This Template?</DialogTitle>
            <DialogDescription>
              This will add "{cloneTarget?.type === 'program' ? cloneTarget?.program_title : cloneTarget?.workout_title}" to your {cloneTarget?.type === 'program' ? 'programs' : 'workouts'} so you can customize it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setCloneTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-[rgba(204,255,0,0.08)]0"
              onClick={confirmClone}
              disabled={cloneWorkout.isPending || cloneProgram.isPending}
            >
              <Copy className="w-4 h-4 mr-1.5" />
              {(cloneWorkout.isPending || cloneProgram.isPending) ? "Adding..." : `Add to My ${cloneTarget?.type === 'program' ? 'Programs' : 'Workouts'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unshare confirmation dialog */}
      <ConfirmDialog
        open={!!unshareTarget}
        onOpenChange={(open) => !open && setUnshareTarget(null)}
        title="Remove from Feed?"
        description={`This will remove your ${unshareTarget?.type === 'program' ? 'program' : unshareTarget?.type === 'recipe' ? 'recipe' : 'workout'} from the social feed. Your ${unshareTarget?.type === 'program' ? 'program' : unshareTarget?.type === 'recipe' ? 'recipe' : 'workout'} won't be deleted, just unshared.`}
        confirmText="Unshare"
        cancelText="Keep Shared"
        variant="danger"
        onConfirm={confirmUnshare}
        loading={unshareWorkout.isPending || unshareProgram.isPending || unshareRecipe.isPending}
      />
    </div>
  );
}

function ProgramFeedCard({ item, isOwn, onClone, isCloning, onUnshare }) {
  const [expanded, setExpanded] = useState(false);
  const username = item.authorProfile?.username || "Unknown";
  const displayName = item.authorProfile?.display_name || username;
  const program = item.program;
  const commentState = useProgramCommentSection(item.id, item.commentCount);

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
    <Card className="">
      <CardContent className="pt-5 pb-4">
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

        {/* Program title + caption */}
        <div className="flex items-start gap-2 mb-2">
          <TrendingUp className="w-5 h-5 text-[#ccff00] mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-semibold text-white">{item.program_title}</h4>
            {item.caption && <p className="text-sm text-[#a0a0a0] mt-1">{item.caption}</p>}
          </div>
        </div>

        {/* Program details */}
        {program && (
          <div className="bg-[#1a1a1a] bg-[#1a1a1a] rounded-lg p-3 mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge className={DIFFICULTY_COLORS[program.difficulty] || "bg-[#202020] text-[#a0a0a0]"}>
                {program.difficulty}
              </Badge>
              <Badge variant="outline">
                {GOAL_LABELS[program.goal] || program.goal}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#a0a0a0]" />
                <span className="text-[#a0a0a0] text-[#a0a0a0]">
                  {program.cycle_length}-day cycle
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-[#a0a0a0]" />
                <span className="text-[#a0a0a0] text-[#a0a0a0]">
                  {program.num_cycles} cycles
                </span>
              </div>
            </div>

            {program.description && (
              <p className="text-xs text-[#555555] pt-2 border-t border-[#2a2a2a]">
                {program.description}
              </p>
            )}

            {/* View Details button */}
            <div className="pt-2 border-t border-[#2a2a2a]">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-xs"
              >
                {expanded ? "Hide Details" : "View Details"}
              </Button>
            </div>

            {/* Expanded program details */}
            {expanded && <ProgramDetailsExpanded programId={program.id} />}
          </div>
        )}

        {/* Likes and Comments */}
        <div className="flex items-center gap-3 pt-2 border-t border-[#2a2a2a] mt-3">
          <ProgramLikeButton sharedProgramId={item.id} />
          <ProgramCommentToggle {...commentState} />
        </div>
      </CardContent>

      {/* Comment panel below actions */}
      {commentState.expanded && (
        <div className="px-5 pb-4 text-left">
          <ProgramCommentPanel {...commentState} />
        </div>
      )}
    </Card>
  );
}

function ProgramDetailsExpanded({ programId }) {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkouts = async () => {
      try {
        const { data, error } = await supabase
          .from('program_workouts')
          .select('*')
          .eq('program_id', programId)
          .order('day_number', { ascending: true });

        console.log('Fetching workouts for program:', programId, { data, error });

        if (error) {
          console.error('Error fetching program workouts:', error);
        } else if (data) {
          setWorkouts(data);
        }
      } catch (err) {
        console.error('Error fetching program workouts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkouts();
  }, [programId]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <LoadingSpinner size="small" />
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div className="text-center py-4 text-[#a0a0a0] text-xs">
        No workouts configured yet
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2 border-t border-[#2a2a2a]">
      <h5 className="text-xs font-semibold text-[#a0a0a0] text-[#a0a0a0] uppercase tracking-wide">
        Cycle Template ({workouts.length} days)
      </h5>
      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {workouts.map((workout) => (
          <WorkoutDayCard key={workout.id} workout={workout} />
        ))}
      </div>
    </div>
  );
}

function WorkoutDayCard({ workout }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleUseAsTemplate = async () => {
    try {
      // Clone the workout to the user's library
      const exercises = (workout.exercises || []).map(ex => ({
        name: ex.name,
        sets: ex.sets || 3,
        reps: ex.reps || "10",
        rest_seconds: ex.rest_seconds || 60,
        notes: ex.notes || "",
      }));

      const { data: cloned, error } = await supabase
        .from('workouts')
        .insert({
          title: workout.title,
          description: workout.description || `Cloned from program workout`,
          difficulty: "intermediate",
          duration_minutes: workout.duration_minutes || Math.max(15, exercises.length * 8),
          exercises,
          is_custom: true,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`"${workout.title}" added to your workouts!`);
      navigate(`/create-workout?edit=${cloned.id}`);
    } catch (err) {
      console.error('Error cloning workout:', err);
      toast.error(err.message || "Failed to clone workout");
    }
  };

  return (
    <div className="bg-[#121212] rounded border border-[#2a2a2a]">
      <div className="p-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Day {workout.day_number}
            </Badge>
            <span className="font-medium text-white text-xs">
              {workout.title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs capitalize">
              {workout.type}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleUseAsTemplate}
              className="h-6 px-2 text-xs text-[#ccff00] hover:text-[#ccff00] hover:bg-[rgba(204,255,0,0.08)]"
            >
              <Copy className="w-3 h-3 mr-1" />
              Use
            </Button>
          </div>
        </div>

        {workout.exercises && workout.exercises.length > 0 && (
          <>
            <div className="text-[#555555] text-[11px] ml-1 mb-1">
              {workout.exercises.length} exercises
              {!expanded && (
                <>
                  : {workout.exercises.slice(0, 3).map(ex => ex.name).join(', ')}
                  {workout.exercises.length > 3 && ` +${workout.exercises.length - 3} more`}
                </>
              )}
            </div>

            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-[#ccff00] hover:text-[#ccff00] font-medium ml-1"
            >
              {expanded ? "Hide exercises" : "Show exercises"}
            </button>

            {expanded && (
              <div className="mt-2 space-y-1 ml-1">
                {workout.exercises.map((ex, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] py-1 border-t border-[#2a2a2a]">
                    <span className="w-4 h-4 rounded-full bg-[rgba(204,255,0,0.12)] flex items-center justify-center text-[#ccff00] text-[#ccff00] text-[11px] font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white">{ex.name}</div>
                      {(ex.sets || ex.reps) && (
                        <div className="text-[#555555]">
                          {ex.sets && `${ex.sets} sets`}
                          {ex.sets && ex.reps && ' × '}
                          {ex.reps && `${ex.reps} reps`}
                        </div>
                      )}
                      {ex.notes && (
                        <div className="text-[#a0a0a0] italic mt-0.5">{ex.notes}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
