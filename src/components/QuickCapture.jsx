import { useState } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * QuickCapture — stream a note to the Second Brain inbox.
 *
 * `embedded` (SYS-13): when the component lives inside an existing glass
 * surface (a bottom-sheet Dialog, or a `glass` disclosure), set `embedded`
 * so we omit our own Card/CardContent. Stacking our glass Card inside another
 * glass surface produces box-in-a-box: two hairline edges + two inset
 * highlights, plus a meaningless hover-lift on a static modal. Page call sites
 * (Career, Mind) render on the bare field and keep the Card as their surface,
 * so `embedded` defaults to false.
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
      toast.success("Captured to Second Brain inbox");
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["capture-inbox", domain] });
      onCapture?.();
    },
    onError: () => toast.error("Failed to capture note"),
  });

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && content.trim()) {
      captureMutation.mutate();
    }
  };

  const body = (
    // SYS-05 dropped the Layout sheet's forced min-height, so the old
    // `flex flex-col mt-auto` (which pushed this body to the bottom of that
    // padded sheet) is now a no-op — drop it so the embedded wrapper carries
    // no misleading layout intent. `w-full` stays so the field/button still
    // span the sheet width.
    <div className={embedded ? "relative w-full" : "relative"}>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        size="capture"
        focusHue={focusHue}
        className="text-sm"
      />
      {/* Footer stacks on mobile (button full-width below the field, in the thumb
          zone) and becomes a row at md+ where the keyboard hint can sit beside it. */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-3 pt-3 border-t hairline">
        {/* The ⌘/Ctrl+Enter shortcut only exists on a hardware keyboard — the
            phone (the primary surface) has no such keys, so gate the hint to md+.
            The redundant domain label is dropped: the section heading already
            names the surface, so repeating "MIND" here was decoration. */}
        <span className="hidden md:inline text-[10.5px] font-technical text-ink-faint shrink-0">
          ⌘/Ctrl + Enter to capture
        </span>
        <Button
          size="lg"
          // The primary action holds the near-solid teal `volt` fill in BOTH
          // states so "Capture" is unmistakably the CTA the moment the sheet
          // opens, instead of fading into a quiet brand/10 ghost outline. The
          // empty-submit is already guarded inside captureMutation (it returns
          // early when content is blank), so the armed/disabled behavior is
          // preserved: we only disable while pending.
          variant="volt"
          // Full-width on mobile (embedded sheet AND the page card) so the primary
          // action fills the thumb zone; auto-width only beside the md+ hint row.
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
    <Card className="glass">
      <CardContent className="pt-4">{body}</CardContent>
    </Card>
  );
}
