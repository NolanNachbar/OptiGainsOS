import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Link, useNavigate } from "react-router-dom";
import { ChefHat, Copy, Trash2, Flame, MessageCircle, Send } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useRecipeReactions } from "@/hooks/useRecipeReactions";
import { useRecipeComments, useAddRecipeComment, useDeleteRecipeComment } from "@/hooks/useSocialQueries";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Trash2 as TrashIcon } from "lucide-react";

export default function RecipeFeedCard({ item, isOwn, onUnshare }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isCloning, setIsCloning] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const username = item.authorProfile?.username || "Unknown";
  const displayName = item.authorProfile?.display_name || username;

  const { likeCount, userLiked, toggleLike, isLoading: likesLoading } = useRecipeReactions(item.id);
  const { data: comments = [], isLoading: commentsLoading } = useRecipeComments(item.id, commentsExpanded);
  const addComment = useAddRecipeComment();
  const deleteComment = useDeleteRecipeComment();

  const handleCloneRecipe = async () => {
    setIsCloning(true);
    try {
      const { data: cloned, error } = await supabase
        .from('recipes')
        .insert({
          name: item.recipe_name,
          description: item.description || `Cloned from @${username}`,
          servings: item.servings,
          ingredients: item.ingredients,
          total_calories: item.total_calories,
          total_protein: item.total_protein,
          total_carbs: item.total_carbs,
          total_fats: item.total_fats,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`"${item.recipe_name}" saved to your recipes!`);
      navigate('/food-tracker');
    } catch (err) {
      console.error('Error cloning recipe:', err);
      toast.error(err.message || "Failed to save recipe");
    } finally {
      setIsCloning(false);
    }
  };

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    const trimmed = commentBody.trim();
    if (!trimmed) return;
    if (trimmed.length > 500) {
      toast.error("Comment must be under 500 characters");
      return;
    }

    addComment.mutate(
      { sharedRecipeId: item.id, body: trimmed },
      {
        onSuccess: () => setCommentBody(""),
        onError: () => toast.error("Failed to post comment"),
      }
    );
  };

  const handleDeleteComment = (commentId) => {
    deleteComment.mutate(commentId, {
      onError: () => toast.error("Failed to delete comment"),
    });
  };

  return (
    <Card className="border-none shadow-md">
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
                className="shrink-0 text-[#ccff00] border-[rgba(204,255,0,0.3)] hover:bg-[rgba(204,255,0,0.08)] dark:hover:bg-[rgba(204,255,0,0.08)] text-xs"
                onClick={handleCloneRecipe}
                disabled={isCloning}
              >
                <Copy className="w-3.5 h-3.5 mr-1" /> Save Recipe
              </Button>
            )}
            {isOwn && onUnshare && (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs"
                onClick={onUnshare}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Unshare
              </Button>
            )}
          </div>
        </div>

        {/* Recipe title + description */}
        <div className="flex items-start gap-2 mb-2">
          <ChefHat className="w-5 h-5 text-[#ccff00] mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-semibold text-white">{item.recipe_name}</h4>
            {item.description && <p className="text-sm text-[#a0a0a0] mt-1">{item.description}</p>}
          </div>
        </div>

        {/* Nutrition info */}
        <div className="bg-[#1a1a1a] bg-[#1a1a1a] rounded-lg p-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[#555555] font-medium">Nutrition per serving</p>
            <Badge variant="outline" className="text-xs">{item.servings} servings</Badge>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <p className="font-bold text-white">{Math.round(item.total_calories) || 0}</p>
              <p className="text-[#a0a0a0]">Calories</p>
            </div>
            <div>
              <p className="font-bold text-white">{Math.round(item.total_protein) || 0}g</p>
              <p className="text-[#a0a0a0]">Protein</p>
            </div>
            <div>
              <p className="font-bold text-white">{Math.round(item.total_carbs) || 0}g</p>
              <p className="text-[#a0a0a0]">Carbs</p>
            </div>
            <div>
              <p className="font-bold text-white">{Math.round(item.total_fats) || 0}g</p>
              <p className="text-[#a0a0a0]">Fats</p>
            </div>
          </div>

          {/* Ingredients preview */}
          {item.ingredients && item.ingredients.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#2a2a2a]">
              <p className="text-xs font-medium text-[#a0a0a0] mb-1">Ingredients:</p>
              <div className="space-y-0.5">
                {item.ingredients.slice(0, 3).map((ingredient, i) => (
                  <p key={i} className="text-xs text-[#555555]">
                    • {ingredient.food_name} ({ingredient.serving_size} {ingredient.serving_unit})
                  </p>
                ))}
                {item.ingredients.length > 3 && (
                  <p className="text-xs text-[#a0a0a0] italic">
                    +{item.ingredients.length - 3} more ingredients
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Engagement row */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-100 mt-3">
          <button
            onClick={toggleLike}
            disabled={likesLoading}
            className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
              userLiked ? "text-orange-500" : "text-[#a0a0a0] hover:text-orange-500"
            }`}
          >
            <Flame className={`w-4 h-4 ${userLiked ? "fill-orange-500" : ""}`} />
            {likeCount > 0 ? likeCount : "Fire"}
          </button>
          <button
            onClick={() => setCommentsExpanded(!commentsExpanded)}
            className={`flex items-center gap-1.5 text-sm transition-colors ${
              commentsExpanded
                ? "text-[#ccff00] font-medium"
                : "text-[#a0a0a0] hover:text-[#a0a0a0]"
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            {comments.length > 0 ? comments.length : "Comment"}
          </button>
        </div>
      </CardContent>

      {/* Comment panel */}
      {commentsExpanded && (
        <div className="px-5 pb-4 text-left">
          <div className="space-y-3">
            {commentsLoading ? (
              <div className="flex justify-center py-2">
                <LoadingSpinner size="small" />
              </div>
            ) : (
              <>
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-2 items-start">
                    <Link to={`/profile/${comment.authorProfile?.username || ""}`}>
                      <UserAvatar
                        url={comment.authorProfile?.avatar_url}
                        username={comment.authorProfile?.username}
                        size="sm"
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Link
                          to={`/profile/${comment.authorProfile?.username || ""}`}
                          className="hover:underline"
                        >
                          <span className="text-xs font-semibold text-white">
                            {comment.authorProfile?.display_name || comment.authorProfile?.username || "Unknown User"}
                          </span>
                        </Link>
                        <span className="text-xs text-[#a0a0a0]">
                          @{comment.authorProfile?.username || "unknown"}
                        </span>
                        <span className="text-xs text-[#a0a0a0]">·</span>
                        <span className="text-xs text-[#a0a0a0]">
                          {format(new Date(comment.created_at), "MMM d, h:mm a")}
                        </span>
                        {comment.created_by === user?.id && (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="text-[#a0a0a0] hover:text-danger-500 transition-colors ml-auto"
                          >
                            <TrashIcon className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 text-[#a0a0a0]">{comment.body}</p>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Comment input */}
            <form onSubmit={handleCommentSubmit} className="flex gap-2">
              <Input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value.slice(0, 500))}
                placeholder="Write a comment..."
                className="text-sm"
                maxLength={500}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!commentBody.trim() || addComment.isPending}
                className="bg-[rgba(204,255,0,0.08)]0 px-3"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
