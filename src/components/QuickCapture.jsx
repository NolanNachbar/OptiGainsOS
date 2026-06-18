import { useState } from "react";
import { db } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function QuickCapture({ domain = "general", placeholder = "Capture a note...", onCapture }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");

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

  return (
    <Card className="glass glass-interactive">
      <CardContent className="pt-4">
        <div className="relative">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[120px] bg-transparent border-none focus-visible:ring-0 px-0 resize-none text-base text-ink placeholder:text-ink-muted"
          />
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
            <span className="text-[10px] text-ink-muted uppercase font-bold tracking-widest">
              Domain: {domain}
            </span>
            <Button
              size="sm"
              variant="volt"
              disabled={!content.trim() || captureMutation.isPending}
              onClick={() => captureMutation.mutate()}
              className="min-h-[44px] px-5"
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
      </CardContent>
    </Card>
  );
}
