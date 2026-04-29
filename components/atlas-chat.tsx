"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FITAI_ATLAS_LAUNCH_EVENT, type AtlasLaunchDetail } from "@/lib/atlas-launch";
import type { FitaiRefreshScope } from "@/lib/fitai-refresh";
import { dispatchFitaiRefresh } from "@/lib/fitai-refresh";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type ChatMode = "onboarding" | "checkin" | "chat";

export { FITAI_REFRESH_EVENT } from "@/lib/fitai-refresh";

export function AtlasChat() {
  const normalizeTargetScope = (value: unknown): FitaiRefreshScope | null => {
    if (typeof value !== "string") return null;
    const valid = new Set<FitaiRefreshScope>([
      "meals",
      "foodlog",
      "progress",
      "workouts",
      "bloodwork",
      "supplements",
      "profile",
      "analytics",
      "notifications",
      "atlas",
      "dashboard",
    ]);
    return valid.has(value as FitaiRefreshScope) ? (value as FitaiRefreshScope) : null;
  };

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load the latest conversation from DB on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/atlas");
        if (!res.ok) return;
        const data = await res.json() as {
          conversationId: string | null;
          messages: Array<{ role: string; content: string }>;
          onboardingComplete: boolean;
          mode: string;
        };

        if (data.conversationId) {
          setConversationId(data.conversationId);
        }

        if (data.messages.length > 0) {
          setMessages(
            data.messages.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }

        if (!data.onboardingComplete) {
          setNeedsOnboarding(true);
          setMode("onboarding");
          setIsOpen(true);
        } else if (data.mode && data.mode !== "chat") {
          setMode(data.mode as ChatMode);
        }
      } catch {
        // ignore — will just start fresh
      }
    })();
  }, []);

  useEffect(() => {
    const onLaunch = (ev: Event) => {
      const custom = ev as CustomEvent<AtlasLaunchDetail>;
      const detail = custom.detail ?? {};
      setIsOpen(true);
      if (detail.mode) setMode(detail.mode);
      if (typeof detail.prompt === "string" && detail.prompt.trim().length > 0) {
        setInput(detail.prompt);
      }
    };
    window.addEventListener(FITAI_ATLAS_LAUNCH_EVENT, onLaunch as EventListener);
    return () => {
      window.removeEventListener(FITAI_ATLAS_LAUNCH_EVENT, onLaunch as EventListener);
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/atlas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
          mode,
        }),
      });

      if (!response.ok) throw new Error("Failed to connect to Atlas");

      const newConvId = response.headers.get("X-Conversation-Id");
      if (newConvId) setConversationId(newConvId);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.role !== "assistant") return prev;
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + event.content },
                ];
              });
            } else if (event.type === "refresh") {
              const targetScope = normalizeTargetScope(event.target);
              dispatchFitaiRefresh({
                source: "atlas",
                target: targetScope ?? undefined,
                scopes: targetScope ? [targetScope, "dashboard"] : ["dashboard"],
              });
            } else if (event.type === "done") {
              if (needsOnboarding && mode === "onboarding") {
                setNeedsOnboarding(false);
              }
            } else if (event.type === "error") {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.role !== "assistant") return prev;
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: `Error: ${event.content}` },
                ];
              });
            }
          } catch {
            // ignore parse errors for partial lines
          }
        }
      }
    } catch (error) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            content:
              error instanceof Error
                ? `Connection error: ${error.message}`
                : "Connection error",
          },
        ];
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const modeLabel: Record<ChatMode, string> = {
    onboarding: "Onboarding",
    checkin: "Weekly Check-in",
    chat: "Chat with Atlas",
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-neon-green shadow-lg shadow-neon-green/20 transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
      >
        <MessageCircle className="h-6 w-6 text-black" />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-2 bottom-2 z-50 flex h-[72vh] max-h-[600px] w-auto flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface shadow-2xl shadow-black/50 sm:bottom-6 sm:right-6 sm:left-auto sm:h-[600px] sm:w-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-border bg-surface-dark px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neon-green/10">
            <span className="text-xs font-bold text-neon-green">A</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Atlas</p>
            <Badge
              variant="outline"
              className="mt-0.5 border-neon-green/30 text-[10px] text-neon-green"
            >
              {modeLabel[mode]}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ChatMode)}
            className="mr-1 max-w-[120px] rounded bg-surface-light px-2 py-1 text-xs text-gray-400 sm:mr-2 sm:max-w-none"
          >
            <option value="chat">Chat</option>
            <option value="checkin">Check-in</option>
            {needsOnboarding && <option value="onboarding">Onboarding</option>}
          </select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-400 hover:text-white"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neon-green/10">
              <span className="text-2xl font-bold text-neon-green">A</span>
            </div>
            <p className="text-sm font-medium text-white">
              {needsOnboarding
                ? "Welcome! Let's get you set up."
                : "How can I help today?"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {needsOnboarding
                ? "Tell me about your health goals to get started."
                : "Ask about nutrition, meals, workouts, or anything health-related."}
            </p>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-neon-green/10 text-white"
                    : "bg-surface-light text-gray-200"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.role === "assistant" &&
                  isStreaming &&
                  i === messages.length - 1 && (
                    <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-neon-green" />
                  )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-surface-border bg-surface-dark p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              needsOnboarding
                ? "Tell Atlas about your health goals..."
                : "Message Atlas..."
            }
            className="min-h-[40px] max-h-[120px] resize-none border-surface-border bg-surface text-sm text-white placeholder:text-gray-500"
            rows={1}
            disabled={isStreaming}
          />
          <Button
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            size="icon"
            className="h-10 w-10 shrink-0 bg-neon-green text-black hover:bg-neon-green/80 disabled:opacity-30"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
