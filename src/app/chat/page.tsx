"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, Plus, ArrowLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import toast from "react-hot-toast";
import type { ChatMessage, ChatThread } from "@/types/farm";

const QUICK_SUGGESTIONS = [
  "What should I do today?",
  "Restock Baja Hijau",
  "Check my inventory levels",
  "Market price update",
  "Schedule inspection for A",
  "How is my chilli doing?",
];

export default function ChatPage() {
  const { farm, setFarm } = useFarmStore();

  // Thread list state
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);

  // Message state (for active thread)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load farm if store is empty
  useEffect(() => {
    async function resolveFarm() {
      if (farm) return;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: farmRow } = await supabase.from("farms")
        .select("id, name, area_acres, grid_size, soil_type, water_source, polygon_geojson, bounding_box")
        .eq("onboarding_done", true).order("created_at", { ascending: false }).limit(1).single();
      if (farmRow) setFarm(farmRow);
    }
    resolveFarm();
  }, [farm, setFarm]);

  // Load threads
  const loadThreads = useCallback(async () => {
    if (!farm?.id) return;
    try {
      const res = await fetch(`/api/chat/threads?farm_id=${farm.id}`);
      if (res.ok) setThreads(await res.json());
    } catch { /* ignore */ }
    finally { setLoadingThreads(false); }
  }, [farm?.id]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Load messages for active thread
  useEffect(() => {
    if (!activeThread || !farm?.id) return;
    setLoadingMessages(true);
    fetch(`/api/chat?farm_id=${farm.id}&thread_id=${activeThread.id}`)
      .then((r) => r.ok ? r.json() : { messages: [] })
      .then((d) => setMessages(d.messages || []))
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, [activeThread, farm?.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create new thread
  const createThread = async () => {
    if (!farm?.id) return;
    try {
      const res = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: farm.id }),
      });
      if (res.ok) {
        const thread = await res.json();
        setThreads((prev) => [thread, ...prev]);
        setActiveThread(thread);
        setMessages([]);
      }
    } catch { toast.error("Failed to create chat"); }
  };

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !farm?.id || !activeThread || sending) return;

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      farm_id: farm.id,
      thread_id: activeThread.id,
      role: "user",
      content: text.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: farm.id, message: text.trim(), thread_id: activeThread.id }),
      });

      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");

      const { reply, action, used_tools } = await res.json();

      setMessages((prev) => [...prev, {
        id: `temp-a-${Date.now()}`,
        farm_id: farm.id,
        thread_id: activeThread.id,
        role: "assistant",
        content: reply,
        metadata: { action, used_tools },
        created_at: new Date().toISOString(),
      }]);

      if (action) toast.success(`Action: ${action.details}`, { duration: 4000 });

      // Refresh thread list to update last_message
      loadThreads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get response");
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text.trim());
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [farm?.id, activeThread, sending, loadThreads]);

  // Select thread + mark as read
  const handleSelectThread = useCallback(async (thread: ChatThread) => {
    setActiveThread(thread);
    // Mark as read
    if (thread.has_unread) {
      const supabase = createClient();
      await supabase.from("chat_threads").update({ has_unread: false }).eq("id", thread.id);
      setThreads((prev) => prev.map((t) => t.id === thread.id ? { ...t, has_unread: false } as ChatThread : t));
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return "now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  };

  // ── THREAD VIEW ──
  if (activeThread) {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-lg border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setActiveThread(null)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{activeThread.title}</p>
            <p className="text-[10px] text-gray-400">AgroBot AI</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loadingMessages ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>
          ) : messages.length === 0 ? (
            <div className="py-8">
              <p className="text-xs text-gray-400 text-center mb-4">Start the conversation</p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {QUICK_SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => sendMessage(s)}
                    className="text-[11px] px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-2xl rounded-br-sm bg-green-600 text-white"
                    : "rounded-2xl rounded-bl-sm bg-white text-gray-800 border border-gray-100"
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.role === "assistant" && msg.metadata && Array.isArray((msg.metadata as Record<string, unknown>).used_tools) && (
                    <div className="mt-1.5 flex flex-wrap gap-1 border-t border-gray-100 pt-1.5">
                      {((msg.metadata as Record<string, unknown>).used_tools as string[]).map((tool: string) => (
                        <span key={tool} className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] text-green-600">
                          <span className="h-1 w-1 rounded-full bg-green-400" />{tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-3 py-2.5 border border-gray-100">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-400" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-400" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-gray-100 bg-white px-4 py-2.5 flex gap-2" style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AgroBot anything..."
            className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs focus:border-green-400 focus:ring-1 focus:ring-green-400 outline-none"
            disabled={sending}
          />
          <button type="submit" disabled={!input.trim() || sending}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-white disabled:opacity-40">
            <Send size={16} />
          </button>
        </form>
      </div>
    );
  }

  // ── THREAD LIST ──
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-lg border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-semibold text-gray-900">Chats</h1>
        <button onClick={createThread} className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> New Chat
        </button>
      </div>

      <div className="px-4 pt-3 space-y-3">
        {loadingThreads ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : threads.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400 mb-3">No conversations yet</p>
            <button onClick={createThread} className="text-xs font-medium text-green-600 bg-green-50 px-4 py-2 rounded-lg">
              Start your first chat
            </button>
          </div>
        ) : (() => {
          const unread = threads.filter((t) => t.has_unread);
          const active = threads.filter((t) => !t.has_unread && !t.is_archived);
          const archived = threads.filter((t) => t.is_archived);

          return (
            <>
              {/* Unread section */}
              {unread.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Unread</p>
                  <div className="rounded-lg border border-green-200 bg-green-50/30 overflow-hidden">
                    {unread.map((thread) => (
                      <ThreadRow key={thread.id} thread={thread} onSelect={handleSelectThread} timeAgo={timeAgo} unread />
                    ))}
                  </div>
                </>
              )}

              {/* Recent section */}
              {active.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{unread.length > 0 ? "Recent" : "Conversations"}</p>
                  <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                    {active.map((thread) => (
                      <ThreadRow key={thread.id} thread={thread} onSelect={handleSelectThread} timeAgo={timeAgo} />
                    ))}
                  </div>
                </>
              )}

              {/* Archived section */}
              {archived.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Archived</p>
                  <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                    {archived.map((thread) => (
                      <ThreadRow key={thread.id} thread={thread} onSelect={handleSelectThread} timeAgo={timeAgo} />
                    ))}
                  </div>
                </>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── Thread Row Component ──
function ThreadRow({ thread, onSelect, timeAgo, unread }: { thread: ChatThread; onSelect: (t: ChatThread) => void; timeAgo: (d: string) => string; unread?: boolean }) {
  return (
    <button onClick={() => onSelect(thread)}
      className="w-full flex items-center gap-3 px-3 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 text-left transition-colors">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${unread ? "bg-green-200" : "bg-green-100"}`}>
        <span className={`text-xs font-bold ${unread ? "text-green-800" : "text-green-700"}`}>{thread.title.charAt(0).toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className={`text-xs truncate ${unread ? "font-bold text-gray-900" : "font-semibold text-gray-800"}`}>{thread.title}</p>
          <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{timeAgo(thread.last_message_at)}</span>
        </div>
        {thread.last_message && (
          <p className={`text-[11px] truncate mt-0.5 ${unread ? "text-gray-600 font-medium" : "text-gray-400"}`}>{thread.last_message}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {unread && <span className="w-2 h-2 rounded-full bg-green-500" />}
        <ChevronRight size={14} className="text-gray-300" />
      </div>
    </button>
  );
}
