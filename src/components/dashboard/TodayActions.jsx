import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListChecks, Plus, CheckCircle2, Circle, Bot, X } from "lucide-react";
import { getTodayString } from "@/utils/dateUtils";
import { toast } from "sonner";

const DOMAIN_COLORS = {
  training:  "text-brand",
  nutrition: "text-green-400",
  career:    "text-indigo-400",
  mind:      "text-purple-400",
  recovery:  "text-blue-400",
  admin:     "text-[#a0a0a0]",
};

export default function TodayActions({ today, briefActions = [] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const todayStr = today || getTodayString();
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: todos = [] } = useQuery({
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

  // Seed AI-generated todos from the brief on first load for today
  useEffect(() => {
    if (!user || !briefActions?.length) return;
    const seedKey = `todos_seeded_${user.id}_${todayStr}`;
    if (localStorage.getItem(seedKey)) return;

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

  if (total === 0 && !adding) return null;

  return (
    <Card className="bg-[#1a1a1a] border-[#2a2a2a] mb-6">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-brand" />
            Today's Actions
            {total > 0 && (
              <span className="text-[10px] font-bold text-[#555555] ml-1">{completed}/{total}</span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdding(v => !v)}
            className="h-6 w-6 p-0 text-[#555555] hover:text-brand"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        {total > 0 && (
          <div className="h-0.5 bg-[#2a2a2a] rounded-full mt-2">
            <div
              className="h-full bg-brand rounded-full transition-all duration-500"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-1">
        <div className="space-y-1.5">
          {todos.map(todo => (
            <div
              key={todo.id}
              className="flex items-center gap-2.5 group py-1"
            >
              <button
                onClick={() => toggleMutation.mutate({ id: todo.id, completed: !todo.completed })}
                className="shrink-0 text-[#555555] hover:text-brand transition-colors"
              >
                {todo.completed
                  ? <CheckCircle2 className="w-4 h-4 text-brand" />
                  : <Circle className="w-4 h-4" />
                }
              </button>
              <span className={`flex-1 text-sm leading-snug ${todo.completed ? "line-through text-[#555555]" : "text-[#e0e0e0]"}`}>
                {todo.text}
              </span>
              {todo.source === "ai_generated" && (
                <Bot className={`w-3 h-3 shrink-0 ${DOMAIN_COLORS[todo.domain] || "text-[#555555]"}`} />
              )}
              <button
                onClick={() => deleteMutation.mutate(todo.id)}
                className="opacity-0 group-hover:opacity-100 text-[#555555] hover:text-red-400 transition-all shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {adding && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-[#2a2a2a]">
            <Input
              autoFocus
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") addMutation.mutate();
                if (e.key === "Escape") { setAdding(false); setNewText(""); }
              }}
              placeholder="Add a task..."
              className="h-8 text-sm flex-1"
            />
            <Button
              size="sm"
              variant="volt"
              className="h-8 px-3"
              disabled={!newText.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
