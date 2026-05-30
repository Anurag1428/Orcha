"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";

type ToolInvocation = {
  toolCallId: string;
  toolName: string;
  args?: any;
  result?: any;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayContent?: string;
  isGenerating?: boolean;
  timestamp: Date;
  toolInvocations?: ToolInvocation[];
};

const quickActions = [
  { emoji: "📧", title: "Email", description: "Send, draft, or schedule emails", prompt: "Send an email to " },
  { emoji: "🔍", title: "Search", description: "Find anything on the web", prompt: "Search for " },
  { emoji: "⚡", title: "Automate", description: "Set up recurring tasks", prompt: "Every " },
  { emoji: "🧠", title: "Remember", description: "Save info about me", prompt: "Remember that " },
];

const popularAutomations = [
  { label: "📅 Weekly study plan email", prompt: "Every Monday at 9am, create a study plan and email it to me" },
  { label: "📰 Daily news summary", prompt: "Every morning, search for today's top news and send me a summary" },
  { label: "📝 Form submission notification", prompt: "Whenever my Google Form gets a response, notify me on Slack" },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [localInput, setLocalInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [displayLengthMap, setDisplayLengthMap] = useState<Record<string, number>>({});
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, displayLengthMap]);

  useEffect(() => {
    const generatingMsgIndex = messages.findIndex(m => m.isGenerating);
    if (generatingMsgIndex === -1) {
      if (!isLoading && messages.length > 0) {
        const newMap = { ...displayLengthMap };
        let changed = false;
        messages.forEach(m => {
          if (newMap[m.id] !== m.content.length) {
            newMap[m.id] = m.content.length;
            changed = true;
          }
        });
        if (changed) setDisplayLengthMap(newMap);
      }
      return;
    }

    const msg = messages[generatingMsgIndex];
    const target = msg.content;
    const currentLen = displayLengthMap[msg.id] || 0;

    if (currentLen === target.length && !isLoading) {
      setMessages(prev => {
        const newMsgs = [...prev];
        const finalMsg = { ...msg, isGenerating: false };
        if (finalMsg.content.trim() === "") {
          finalMsg.content = finalMsg.toolInvocations && finalMsg.toolInvocations.length > 0
            ? "I've finished running the tools, but I didn't find any additional information to share."
            : "I've completed the task.";
        }
        newMsgs[generatingMsgIndex] = finalMsg;
        return newMsgs;
      });
      return;
    }

    if (currentLen < target.length) {
      const backlog = target.length - currentLen;
      let delay = 15;
      if (backlog > 100) delay = 5;
      
      const nextChar = target[currentLen];
      if (['.', '!', '?'].includes(nextChar) && backlog < 50) delay = 150;
      else if (nextChar === ',' && backlog < 50) delay = 50;

      const timer = setTimeout(() => {
        setDisplayLengthMap(prev => {
          const charsToAdd = backlog > 100 ? 5 : (backlog > 50 ? 3 : 1);
          return {
            ...prev,
            [msg.id]: Math.min(target.length, (prev[msg.id] || 0) + charsToAdd)
          };
        });
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [messages, isLoading, displayLengthMap]);

  useEffect(() => {
    if (localInput && textareaRef.current) {
      textareaRef.current.focus();
      const len = localInput.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [localInput]);

  async function sendMessage(promptText: string) {
    if (!promptText.trim() || isLoading) return;
    const text = promptText.trim();
    
    setLocalInput("");
    setIsLoading(true);

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    
    const agentMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: agentMsgId, role: "assistant", content: "", isGenerating: true, timestamp: new Date(), toolInvocations: [] }]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const returnedSessionId = res.headers.get("x-session-id");
      if (returnedSessionId) setSessionId(returnedSessionId);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        let done = false;
        let buffer = "";
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ""; 
            
            setMessages(prev => {
              const newMsgs = [...prev];
              const idx = newMsgs.findIndex(m => m.id === agentMsgId);
              if (idx === -1) return prev;
              const msg = { ...newMsgs[idx], toolInvocations: [...(newMsgs[idx].toolInvocations || [])] };

              for (const line of lines) {
                if (!line.trim() || !line.startsWith('data: ')) continue;
                try {
                  const data = JSON.parse(line.slice(6)); // strip "data: "
                  if (data.type === 'text-delta' && data.textDelta) {
                    msg.content += data.textDelta;
                  } else if (data.type === 'tool-call' || data.type === 'tool-input-available') {
                    // Extract args or input depending on the SDK version
                    const args = data.args || data.input || data.toolCall?.args || {};
                    const toolCallId = data.toolCallId || data.toolCall?.toolCallId || data.id;
                    const toolName = data.toolName || data.toolCall?.toolName;
                    if (toolCallId && toolName) {
                      msg.toolInvocations!.push({ toolCallId, toolName, args });
                    }
                  } else if (data.type === 'tool-result' || data.type === 'tool-output-available') {
                    const toolCallId = data.toolCallId || data.toolCall?.toolCallId;
                    const result = data.result || data.output || data.toolResult;
                    const existingTool = msg.toolInvocations!.find(t => t.toolCallId === toolCallId);
                    if (existingTool) existingTool.result = result;
                  } else if (!['start', 'finish', 'step-finish', 'response-metadata', 'start-step', 'text-start', 'text-end', 'tool-input-start', 'tool-input-delta'].includes(data.type)) {
                    // msg.content += `\n[DEBUG UNRECOGNIZED (${data.type})]: ${JSON.stringify(data)}\n`;
                  }
                } catch(e) {}
              }
              newMsgs[idx] = msg;
              return newMsgs;
            });
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setMessages(prev => prev.map(m => m.id === agentMsgId ? { ...m, content: `Error: ${err.message}`, isGenerating: false } : m));
    } finally {
      setIsLoading(false);
    }
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(localInput);
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3">Hey there! 👋</h1>
            <p className="text-zinc-400 text-base sm:text-lg mb-10 max-w-md">
              I&apos;m Orcha, your personal AI assistant. What can I help you with?
            </p>

            <div className="grid grid-cols-2 gap-3 w-full max-w-lg mb-10">
              {quickActions.map((action) => (
                <button
                  key={action.title}
                  type="button"
                  onClick={() => sendMessage(action.prompt)}
                  className="group flex flex-col items-start gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-left transition-all duration-200 hover:border-violet-500/50 hover:scale-[1.02] hover:shadow-lg hover:shadow-violet-500/5"
                >
                  <span className="text-2xl mb-1">{action.emoji}</span>
                  <span className="text-sm font-semibold text-white">{action.title}</span>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors duration-200">
                    {action.description}
                  </span>
                </button>
              ))}
            </div>

            <div className="w-full max-w-lg">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600 mb-3">Popular Automations</p>
              <div className="flex flex-wrap justify-center gap-2">
                {popularAutomations.map((auto) => (
                  <button
                    key={auto.label}
                    type="button"
                    onClick={() => sendMessage(auto.prompt)}
                    className="rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-xs text-zinc-400 transition-all duration-200 hover:border-violet-500/50 hover:text-zinc-200 hover:bg-zinc-800/80"
                  >
                    {auto.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg) => {
              const isGenerating = isLoading && msg.id === messages[messages.length - 1]?.id && msg.role === 'assistant';
              const displayLen = displayLengthMap[msg.id] ?? msg.content.length;
              let renderedContent = msg.content.slice(0, displayLen);
              
              if (!isGenerating && msg.role === 'assistant' && msg.content.trim() === "") {
                renderedContent = msg.toolInvocations && msg.toolInvocations.length > 0
                  ? "I've finished running the tools, but I didn't find any additional information to share."
                  : "I've completed the task.";
              }

              return (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="flex flex-col gap-1 max-w-[80%]">
                    <div className={`flex items-start gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                      {msg.role === "assistant" && (
                        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-xs">⚡</span>
                      )}

                      <div className="flex flex-col gap-2">
                        {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                          <div className="flex flex-col gap-2 mb-1 mt-1">
                            {msg.toolInvocations.map((tool, i) => (
                              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 w-fit">
                                {!('result' in tool) ? (
                                  <div className="h-3 w-3 rounded-full border-2 border-zinc-500 border-t-violet-500 animate-spin" />
                                ) : (
                                  <div className="h-3 w-3 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center text-[8px] font-bold">✓</div>
                                )}
                                <span className="font-mono">{tool.toolName}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {(renderedContent.length > 0 || isGenerating) && (
                          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-gradient-to-br from-violet-600 to-purple-600 text-white rounded-br-sm" : "bg-zinc-800/80 border-l-2 border-violet-500 text-zinc-100 rounded-bl-sm"}`}>
                            {isGenerating && renderedContent.length === 0 && (!msg.toolInvocations || msg.toolInvocations.length === 0) ? (
                              <div className="flex gap-1.5 h-5 items-center px-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                                <div className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                                <div className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                              </div>
                            ) : (
                              renderedContent
                            )}
                            {isGenerating && (renderedContent.length > 0 || (msg.toolInvocations && msg.toolInvocations.length > 0 && msg.content.length > 0)) && (
                              <span className="inline-block w-1.5 h-3.5 ml-1 bg-violet-500/80 animate-pulse align-middle" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <form className="flex gap-3 items-end" onSubmit={handleFormSubmit}>
            <textarea
              ref={textareaRef}
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(localInput);
                }
              }}
              placeholder="Ask me anything..."
              rows={1}
              disabled={isLoading}
              className="flex-1 bg-zinc-900 text-white placeholder-zinc-500 rounded-xl px-4 py-3.5 text-sm resize-none outline-none border border-zinc-800 focus:border-violet-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={isLoading || !localInput?.trim()}
              className="flex items-center justify-center h-[46px] w-[46px] shrink-0 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white transition-all duration-200 hover:from-violet-500 hover:to-purple-500 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </form>
          <p className="text-zinc-600 text-[11px] mt-2 text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
