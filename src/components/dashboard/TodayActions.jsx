import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/system";
import { ListChecks, Plus, CheckCircle2, Circle, Bot, X } from "lucide-react";
import { getTodayString } from "@/utils/dateUtils";
import { toast } from "sonner";

// Passive AI-source glyph hues. Coral is THE action color and is barred here
// (a passive datum glyph must never wear it). Each domain maps to a non-action
// data hue; text-faint is the fallback for unknown domains.
const DOMAIN_COLORS = {
  training:  "text-teal",
  nutrition: "text-gold",
  career:    "text-leaf",
  mind:      "text-violet",
  recovery:  "text-carb",
  admin:     "text-muted-2",
};

export default function TodayActions({ today, briefActions = [], isError = false }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayStr = today || getTodayString();
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const seedingRef = useRef(false);

  const { data: rawTodos = [] } = useQuery({
    queryKey: ["todos", todayStr, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .eq("created_by", user.id)
        .eq("date", todayStr)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Deduplicate by text, keeping the earliest created_at per unique text
  const seen = new Set();
  const todos = rawTodos.filter(t => {
    if (seen.has(t.text)) return false;
    seen.add(t.text);
    return true;
  });

  // Seed AI-generated todos from the brief on first load for today
  useEffect(() => {
    if (!user || !briefActions?.length) return;
    const seedKey = `todos_seeded_${user.id}_${todayStr}`;
    if (localStorage.getItem(seedKey) || seedingRef.current) return;
    seedingRef.current = true;

    const rows = briefActions.map(text => ({
      created_by: user.id,
      date: todayStr,
      text,
      source: "ai_generated",
      completed: false,
    }));

    supabase.from("todos").insert(rows).then(({ error }) => {
      if (!error) {
        localStorage.setItem(seedKey, "1");
        queryClient.invalidateQueries({ queryKey: ["todos", todayStr, user.id] });
      } else {
        seedingRef.current = false;
      }
    });
  }, [briefActions, user, todayStr, queryClient]);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }) => {
      const { error } = await supabase
        .from("todos")
        .update({ completed })
        .eq("id", id)
        .eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos", todayStr, user.id] }),
    onError: () => toast.error("Failed to update"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("todos").delete().eq("id", id).eq("created_by", user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["todos", todayStr, user.id] }),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!newText.trim()) return;
      const { error } = await supabase.from("todos").insert({
        created_by: user.id,
        date: todayStr,
        text: newText.trim(),
        source: "manual",
        completed: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewText("");
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["todos", todayStr, user.id] });
    },
    onError: () => toast.error("Failed to add task"),
  });

  const completed = todos.filter(t => t.completed).length;
  const total = todos.length;

  if (isError) return (
    <div className="glass glass-interactive px-4 pt-3 pb-3 text-sm text-bad">Could not load today's actions</div>
  );

  if (total === 0 && !adding) return null;

  return (
    <div className="glass glass-interactive px-4 pt-3 pb-3">
      <SectionLabel
        right={
          <Button
            variant="plain"
            onClick={() => setAdding(v => !v)}
            className="h-11 w-11 p-0 -my-2 active:scale-95 duration-200 [transition-timing-function:var(--ease)]"
            aria-label="Add action"
          >
            <Plus className="w-4 h-4" />
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-leaf" />
          Today's Actions
          {total > 0 && (
            <span className="font-technical text-[10px] text-muted-2 font-bold">{completed}/{total}</span>
          )}
        </span>
      </SectionLabel>
      {total > 0 && (
        <div className="h-1 bg-track rounded-full mt-2.5">
          <div
            className="h-full bg-leaf rounded-full transition-all duration-500 [transition-timing-function:var(--ease)]"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
      )}
      <div className="mt-2.5">
        <div className="space-y-1">
          {todos.map(todo => (
            <div
              key={todo.id}
              className="flex items-center gap-3 group py-1.5 border-b hairline last:border-0"
            >
              <button
                onClick={() => toggleMutation.mutate({ id: todo.id, completed: !todo.completed })}
                className="shrink-0 h-11 w-11 -my-2 -ml-2 flex items-center justify-center text-faint hover:text-leaf transition-colors duration-200 [transition-timing-function:var(--ease)] active:scale-95"
                aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
              >
                {todo.completed
                  ? <CheckCircle2 className="w-4 h-4 text-leaf" />
                  : <Circle className="w-4 h-4" />
                }
              </button>
              <span className={`flex-1 text-sm font-semibold leading-normal ${todo.completed ? "line-through text-muted-2" : "text-secondary"}`}>
                {todo.text}
              </span>
              {todo.source === "ai_generated" && (
                <Bot className={`w-4 h-4 shrink-0 ${DOMAIN_COLORS[todo.domain] || "text-faint"}`} />
              )}
              <button
                onClick={() => deleteMutation.mutate(todo.id)}
                className="shrink-0 h-11 w-11 -my-2 -mr-2 flex items-center justify-center text-faint hover:text-bad transition-colors duration-200 [transition-timing-function:var(--ease)] active:scale-95"
                aria-label="Delete action"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
 
        {adding && (
          <div className="rise-in flex gap-2 mt-4 pt-4 border-t hairline">
            <Input
              autoFocus
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") addMutation.mutate();
                if (e.key === "Escape") { setAdding(false); setNewText(""); }
              }}
              placeholder="Add a task..."
              className="text-sm flex-1"
            />
            <Button
              size="sm"
              variant="dim"
              className="h-11 px-4 font-bold text-xs uppercase tracking-wider"
              disabled={!newText.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
