import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useComments, useAddComment, useDeleteComment } from "@/hooks/useSocialQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Link } from "react-router-dom";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export function useCommentSection(sharedWorkoutId, commentCount = 0) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");

  const { data: comments = [], isLoading } = useComments(sharedWorkoutId, expanded);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    if (trimmed.length > 500) {
      toast.error("Comment must be under 500 characters");
      return;
    }

    addComment.mutate(
      { sharedWorkoutId, body: trimmed },
      {
        onSuccess: () => setBody(""),
        onError: () => toast.error("Failed to post comment"),
      }
    );
  };

  const handleDelete = (commentId) => {
    deleteComment.mutate(commentId, {
      onError: () => toast.error("Failed to delete comment"),
    });
  };

  const displayCount = expanded ? comments.length : commentCount;

  return {
    user,
    expanded,
    setExpanded,
    body,
    setBody,
    comments,
    isLoading,
    addComment,
    handleSubmit,
    handleDelete,
    displayCount,
  };
}

export function CommentToggle({ expanded, setExpanded, displayCount }) {
  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="flex items-center gap-1.5 text-sm text-[#555555] hover:text-[#a0a0a0] transition-colors"
    >
      <MessageCircle className="w-4 h-4" />
      {displayCount > 0 ? displayCount : "Comment"}
    </button>
  );
}

export function CommentPanel({
  expanded,
  isLoading,
  comments,
  user,
  handleDelete,
  handleSubmit,
  body,
  setBody,
  addComment,
}) {
  if (!expanded) return null;

  return (
    <div className="mt-3 space-y-3 text-left">
      {isLoading ? (
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
                  <span className="text-xs text-[#555555]">
                    @{comment.authorProfile?.username || "unknown"}
                  </span>
                  <span className="text-xs text-[#555555]">·</span>
                  <span className="text-xs text-[#555555]">
                    {format(new Date(comment.created_at), "MMM d, h:mm a")}
                  </span>
                  {comment.created_by === user?.id && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-[#a0a0a0] hover:text-[#f87171] transition-colors ml-auto"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-[#a0a0a0] ">{comment.body}</p>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Comment input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 500))}
          placeholder="Write a comment..."
          className="text-sm"
          maxLength={500}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!body.trim() || addComment.isPending}
          className="bg-brand px-3"
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </form>
    </div>
  );
}

// Backwards-compatible single component
export function CommentSection({ sharedWorkoutId, commentCount = 0 }) {
  const commentState = useCommentSection(sharedWorkoutId, commentCount);

  return (
    <div>
      <CommentToggle {...commentState} />
      <CommentPanel {...commentState} />
    </div>
  );
}
