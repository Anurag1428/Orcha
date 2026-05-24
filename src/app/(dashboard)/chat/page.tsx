"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

const quickActions = [
  {
    emoji: "📧",
    title: "Email",
    description: "Send, draft, or schedule emails",
    prompt: "Send an email to ",
  },
  {
    emoji: "🔍",
    title: "Search",
    description: "Find anything on the web",
    prompt: "Search for ",
  },
  {
    emoji: "⚡",
    title: "Automate",
    description: "Set up recurring tasks",
    prompt: "Every ",
  },
  {
    emoji: "🧠",
    title: "Remember",
    description: "Save info about me",
    prompt: "Remember that ",
  },
];

const popularAutomations = [
  {
    label: "📅 Weekly study plan email",
    prompt: "Every Monday at 9am, create a study plan and email it to me",
  },
  {
    label: "📰 Daily news summary",
    prompt:
      "Every morning, search for today's top news and send me a summary",
  },
  {
    label: "📝 Form submission notification",
    prompt:
      "Whenever my Google Form gets a response, notify me on Slack",
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-focus the textarea when input is filled by a quick action
  useEffect(() => {
    if (input && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      const len = input.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [input]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });

      const data = await res.json();
      if (data.sessionId) setSessionId(data.sessionId);

      const agentMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Something went wrong. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Messages / Empty State */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        {messages.length === 0 ? (
          /* ───── Empty State ───── */
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center">
            {/* Greeting */}
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3">
              Hey there! 👋
            </h1>
            <p className="text-zinc-400 text-base sm:text-lg mb-10 max-w-md">
              I&apos;m Orcha, your personal AI assistant. What can I help you
              with?
            </p>

            {/* Quick-Action Cards — 2×2 grid */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg mb-10">
              {quickActions.map((action) => (
                <button
                  key={action.title}
                  type="button"
                  onClick={() => setInput(action.prompt)}
                  className="group flex flex-col items-start gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-left transition-all duration-200 hover:border-violet-500/50 hover:scale-[1.02] hover:shadow-lg hover:shadow-violet-500/5"
                >
                  <span className="text-2xl mb-1">{action.emoji}</span>
                  <span className="text-sm font-semibold text-white">
                    {action.title}
                  </span>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors duration-200">
                    {action.description}
                  </span>
                </button>
              ))}
            </div>

            {/* Popular Automations */}
            <div className="w-full max-w-lg">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600 mb-3">
                Popular Automations
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {popularAutomations.map((auto) => (
                  <button
                    key={auto.label}
                    type="button"
                    onClick={() => setInput(auto.prompt)}
                    className="rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs text-zinc-400 transition-all duration-200 hover:border-violet-500/50 hover:text-zinc-200 hover:bg-zinc-800/80"
                  >
                    {auto.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ───── Chat Messages ───── */
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div className="flex flex-col gap-1 max-w-[80%]">
                  {/* Bubble */}
                  <div
                    className={`flex items-start gap-2 ${
                      msg.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {/* Orcha icon for assistant */}
                    {msg.role === "assistant" && (
                      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-xs">
                        ⚡
                      </span>
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-gradient-to-br from-violet-600 to-purple-600 text-white rounded-br-sm"
                          : "bg-zinc-800/80 border-l-2 border-violet-500 text-zinc-100 rounded-bl-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <span
                    className={`text-[10px] text-zinc-600 ${
                      msg.role === "user" ? "text-right pr-1" : "pl-8"
                    }`}
                  >
                    {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}

            {/* Loading dots */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-start gap-2">
                  <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-xs">
                    ⚡
                  </span>
                  <div className="bg-zinc-800/80 border-l-2 border-violet-500 rounded-2xl rounded-bl-sm px-5 py-4">
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                      <div className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                      <div className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ───── Input Area ───── */}
      <div className="border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask me anything..."
              rows={1}
              disabled={isLoading}
              className="flex-1 bg-zinc-900 text-white placeholder-zinc-500 rounded-xl px-4 py-3.5 text-sm resize-none outline-none border border-zinc-800 focus:border-violet-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="flex items-center justify-center h-[46px] w-[46px] shrink-0 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white transition-all duration-200 hover:from-violet-500 hover:to-purple-500 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
          <p className="text-zinc-600 text-[11px] mt-2 text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
