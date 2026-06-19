import { useState } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
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
    <div className="relative">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="min-h-[120px] text-sm"
      />
      <div className="flex items-center justify-between mt-3 pt-3 border-t hairline">
        {domain !== "general" ? (
          <span className="text-[10px] text-ink-muted uppercase font-bold tracking-widest">
            {domain}
          </span>
        ) : (
          <span className="text-[10px] font-technical text-ink-faint">
            ⌘/Ctrl + Enter to capture
          </span>
        )}
        <Button
          size="lg"
          variant={hasContent ? "volt" : "dim"}
          disabled={!hasContent || captureMutation.isPending}
          onClick={() => captureMutation.mutate()}
        >
          {captureMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              Capture <Send className="w-3.5 h-3.5 ml-2" />
            </>
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
