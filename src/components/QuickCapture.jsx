import { useState } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, Button, Textarea } from "@/components/ui";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * QuickCapture: stream a note to the Second Brain inbox.
 * `embedded` omits the Card when the component sits inside a Sheet or Card
 * already (no box in a box). Page call sites render it on the bare field.
 */
export default function QuickCapture({
  domain = "general",
  placeholder = "Capture a note...",
  onCapture,
  embedded = false,
  // A page that OWNS a hue (e.g. Mind = violet) threads its hue token name so the
  // free-write field's focus ring speaks the surface identity instead of borrowing
  // the system-default teal. Forwarded straight to the Textarea primitive.
  focusHue = "teal",
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const hasContent = content.trim().length > 0;

  const captureMutation = useMutation({
    mutationFn: async () => {
      if (!content.trim()) return;
      return await db.entities.CaptureInbox.create({
        created_by: user.id,
        content: content.trim(),
        domain: domain,
        processed: false,
      });
    },
    onSuccess: () => {
      toast.success("Captured.");
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["capture-inbox", domain] });
      onCapture?.();
    },
    onError: () => toast.error("Note not saved. Check your connection and try again."),
  });

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && content.trim()) {
      captureMutation.mutate();
    }
  };

  const body = (
    <div className={embedded ? "relative w-full" : "relative"}>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        size="capture"
        focusHue={focusHue}
        className="text-body"
      />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-3 pt-3 border-t border-charcoal-borderSoft">
        <span className="hidden md:inline text-caption text-ink-faint tabular-nums shrink-0">
          ⌘/Ctrl + Enter to capture
        </span>
        <Button
          size="lg"
          variant="primary"
          className={embedded ? "flex-1" : "w-full md:w-auto"}
          disabled={!hasContent || captureMutation.isPending}
          onClick={() => captureMutation.mutate()}
        >
          {captureMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 spin-loop" />
          ) : (
            "Capture"
          )}
        </Button>
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardContent className="pt-4">{body}</CardContent>
    </Card>
  );
}
