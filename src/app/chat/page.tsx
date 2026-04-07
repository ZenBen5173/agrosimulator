"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, Sprout } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import toast from "react-hot-toast";
import type { ChatMessage } from "@/types/farm";

const QUICK_SUGGESTIONS = [
  "What should I do today?",
  "When to harvest?",
  "Crop health tips",
  "Market advice",
];

export default function ChatPage() {
  const { farm, setFarm } = useFarmStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load farm if store is empty (direct navigation to /chat)
  useEffect(() => {
    async function resolveFarm() {
      if (farm) return;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: farmRow } = await supabase
        .from("farms")
        .select(
          "id, name, area_acres, grid_size, soil_type, water_source, polygon_geojson, bounding_box"
        )
        .eq("onboarding_done", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (farmRow) setFarm(farmRow);
    }
    resolveFarm();
  }, [farm, setFarm]);

  // Load conversation history from Supabase
  useEffect(() => {
    if (!farm?.id) {
      return;
    }

    const loadHistory = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("chat_messages")
          .select("id, farm_id, role, content, created_at")
          .eq("farm_id", farm.id)
          .order("created_at", { ascending: true })
          .limit(50);

        if (error) {
          console.error("Failed to load chat history:", error);
          toast.error("Failed to load chat history");
        } else {
          setMessages((data as ChatMessage[]) || []);
        }
      } catch {
        toast.error("Failed to load chat history");
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [farm?.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !farm?.id || sending) return;

      const userMsg: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        farm_id: farm.id,
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
          body: JSON.stringify({ farm_id: farm.id, message: text.trim() }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to send message");
        }

        const { reply } = await res.json();

        const assistantMsg: ChatMessage = {
          id: `temp-assistant-${Date.now()}`,
          farm_id: farm.id,
          role: "assistant",
          content: reply,
          created_at: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to get response";
        toast.error(errorMessage);
        // Remove the optimistic user message on error
        setMessages((prev) =>
          prev.filter((m) => m.id !== userMsg.id)
        );
        setInput(text.trim());
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [farm?.id, sending]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  if (!farm?.id) {
    return (
      <div className="flex h-[calc(100vh-72px)] flex-col items-center justify-center px-6 text-center">
        <Loader2 size={32} className="mb-4 animate-spin text-green-500" />
        <p className="text-sm text-gray-500">Loading farm...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-lg">
            🤖
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">AgroBot</h1>
            <p className="text-xs text-gray-500">AI Farming Advisor</p>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loadingHistory ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
              🤖
            </div>
            <h2 className="mb-1 text-lg font-semibold text-gray-800">
              Hi, I&apos;m AgroBot!
            </h2>
            <p className="mb-6 max-w-[280px] text-center text-sm text-gray-500">
              Ask me anything about your farm. I can help with planting, pest
              management, weather advice, and more.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={sending}
                  className="rounded-full border border-green-200 bg-white px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-50 active:bg-green-100 disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`animate-message-in flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="mr-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-sm">
                    🤖
                  </div>
                )}
                <div
                  className={`max-w-[80%] whitespace-pre-wrap px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-2xl rounded-br-md bg-green-600 text-white"
                      : "rounded-2xl rounded-bl-md bg-white text-gray-800 shadow-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="animate-message-in flex justify-start">
                <div className="mr-2 mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-sm">
                  🤖
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm">
                  <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AgroBot anything..."
            disabled={sending}
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition-colors focus:border-green-400 focus:bg-white focus:ring-1 focus:ring-green-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-600 text-white transition-colors hover:bg-green-700 active:bg-green-800 disabled:bg-gray-300 disabled:text-gray-500"
          >
            {sending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
