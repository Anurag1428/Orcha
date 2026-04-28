"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Terminal,
  Plus,
  History,
  GitBranch,
  Lock,
  BookOpen,
  HelpCircle,
  Copy,
  ExternalLink,
  Bell,
  Settings,
  Send,
  Sparkles,
  Shield,
  Package,
  Rocket,
  ChevronRight,
  Zap,
  Workflow,
  MessageSquare,
  ArrowRight,
} from "lucide-react";

/* ───────────────────────── types ───────────────────────── */
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  codeBlock?: { filename: string; code: string };
}

interface WorkflowStep {
  icon: React.ReactNode;
  label: string;
  title: string;
  detail?: string;
  tags?: string[];
  active: boolean;
}

/* ───────────────────── demo data ───────────────────────── */
const DEMO_HISTORY = [
  { icon: <History className="w-4 h-4" />, label: "API Integration Fix" },
  { icon: <History className="w-4 h-4" />, label: "Database Schema Design" },
  { icon: <GitBranch className="w-4 h-4" />, label: "Workflows" },
  { icon: <Lock className="w-4 h-4" />, label: "Vault" },
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: "user",
    content:
      "Can you help me refactor this auth middleware to handle both JWT and API keys? I also need to update the deployment workflow for the production environment.",
    timestamp: "14:20",
  },
  {
    role: "assistant",
    content:
      "I've drafted a refactor that uses a strategy pattern for the authentication layer. Here's the updated middleware logic:",
    timestamp: "14:21",
    codeBlock: {
      filename: "auth_middleware.ts",
      code: `export const authMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const token = req.headers.authorization?.split(' ')[1];

  if (apiKey) {
    return validateApiKey(apiKey, next);
  }

  if (token) {
    return validateJwt(token, next);
  }

  throw new UnauthorizedError('No credentials provided');
};`,
    },
  },
];

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    icon: <GitBranch className="w-5 h-5" />,
    label: "Trigger",
    title: "Git Push: Production",
    detail: "Branch: main",
    active: true,
  },
  {
    icon: <Shield className="w-5 h-5" />,
    label: "Validation",
    title: "Auth Context Check",
    tags: ["JWT", "API-KEY"],
    active: true,
  },
  {
    icon: <Package className="w-5 h-5" />,
    label: "Build",
    title: "Containerize App",
    active: false,
  },
  {
    icon: <Rocket className="w-5 h-5" />,
    label: "Deploy",
    title: "Kubernetes Rolling Update",
    active: false,
  },
];

/* ───────────────────── helpers ─────────────────────────── */
function nowTime() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/* ───────────────────── component ──────────────────────── */
export function LandingPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: nowTime(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const botMsg: ChatMessage = {
        role: "assistant",
        content:
          "I've analyzed your request and generated the workflow. You can see the updated pipeline in the preview panel — the validation step now covers both authentication strategies with automatic secret rotation.",
        timestamp: nowTime(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 1800);
  };

  return (
    <div className="flex flex-col h-screen bg-[#050505] text-[#e5e2e1] overflow-hidden font-sans antialiased selection:bg-white/10">
      {/* ─── Top Nav ─── */}
      <nav className="flex justify-between items-center w-full px-4 h-12 z-50 bg-[#050505] border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold tracking-tighter text-white uppercase">
            Orcha
          </span>
          <div className="hidden md:flex items-center gap-1">
            {["Workspace", "Deployments", "Logs"].map((tab, i) => (
              <button
                key={tab}
                className={`text-xs px-3 py-1.5 rounded-md transition-all duration-200 ${
                  i === 0
                    ? "text-white border-b-2 border-white"
                    : "text-zinc-500 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-colors">
            <Terminal className="w-4 h-4" />
          </button>
          <button className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-colors">
            <Bell className="w-4 h-4" />
          </button>
          <button className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          <Link
            href="/login"
            className="ml-2 px-3 py-1 text-xs font-medium text-black bg-white rounded-md hover:bg-zinc-200 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* ─── Main Shell ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Sidebar ─── */}
        <aside className="hidden md:flex flex-col w-60 border-r border-[#1a1a1a] bg-[#050505] py-5 px-3 shrink-0">
          {/* Terminal badge */}
          <div className="flex items-center gap-3 px-2 mb-5">
            <div className="w-8 h-8 flex items-center justify-center bg-[#111] border border-[#222] rounded-md">
              <Terminal className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-medium text-white tracking-wide uppercase">
                Terminal v1
              </div>
              <div className="text-[9px] text-zinc-600">Stable Build</div>
            </div>
          </div>

          {/* New Chat */}
          <button className="flex items-center gap-3 w-full bg-[#111] text-white border-r-2 border-white px-3 py-2.5 text-xs uppercase tracking-wider font-medium mb-4 transition-all active:scale-[0.98]">
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>

          {/* History */}
          <div className="flex-1 overflow-y-auto space-y-0.5 custom-scrollbar">
            <div className="px-3 py-2 text-[10px] text-zinc-600 font-mono uppercase tracking-widest">
              Recent History
            </div>
            {DEMO_HISTORY.map((item) => (
              <button
                key={item.label}
                className="flex items-center gap-3 w-full px-3 py-2.5 text-xs text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-all rounded-sm"
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-auto pt-4 space-y-1 border-t border-[#1a1a1a]">
            <Link
              href="/signup"
              className="flex items-center justify-center w-full py-2 border border-[#262626] text-white hover:bg-white hover:text-black transition-all text-[10px] uppercase tracking-wider font-medium rounded-sm mb-3"
            >
              Upgrade Plan
            </Link>
            <button className="flex items-center gap-3 w-full px-2 py-2 text-xs text-zinc-500 hover:bg-white/5 transition-all rounded-sm">
              <BookOpen className="w-4 h-4" />
              <span>Documentation</span>
            </button>
            <button className="flex items-center gap-3 w-full px-2 py-2 text-xs text-zinc-500 hover:bg-white/5 transition-all rounded-sm">
              <HelpCircle className="w-4 h-4" />
              <span>Support</span>
            </button>
          </div>
        </aside>

        {/* ─── Chat Canvas ─── */}
        <main className="flex-1 flex flex-col bg-[#050505] min-w-0">
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-8 py-8 max-w-3xl mx-auto w-full space-y-10">
            {messages.map((msg, idx) => (
              <div key={idx} className="group animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Sender label */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-[10px] font-mono uppercase tracking-widest ${
                      msg.role === "user" ? "text-zinc-500" : "text-white"
                    }`}
                  >
                    {msg.role === "user" ? "User" : "Assistant"}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-zinc-700" />
                  <span className="text-[10px] font-mono text-zinc-600">
                    {msg.timestamp}
                  </span>
                </div>

                {/* Content */}
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {msg.content}
                </p>

                {/* Code Block */}
                {msg.codeBlock && (
                  <div className="mt-4 bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg overflow-hidden">
                    <div className="bg-[#111] px-4 py-2 border-b border-[#1a1a1a] flex justify-between items-center">
                      <span className="text-[10px] font-mono text-zinc-500 tracking-wide">
                        {msg.codeBlock.filename}
                      </span>
                      <button className="text-zinc-600 hover:text-white transition-colors">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <pre className="p-4 text-[13px] font-mono leading-relaxed text-zinc-400 overflow-x-auto">
                      <code>{msg.codeBlock.code}</code>
                    </pre>
                  </div>
                )}

                {/* Post-code note for assistant */}
                {msg.codeBlock && msg.role === "assistant" && (
                  <p className="mt-4 text-sm text-zinc-300 leading-relaxed">
                    I've also mapped out the updated deployment flow in the
                    preview panel to the right. It now includes a pre-validation
                    step for secrets.
                  </p>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-white">
                  Assistant
                </span>
                <div className="flex gap-1 ml-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ─── Command Bar ─── */}
          <div className="p-4 sm:p-6 w-full max-w-3xl mx-auto">
            <div className="relative flex items-center bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl px-4 py-3 shadow-2xl focus-within:border-zinc-600 transition-colors duration-200">
              <Terminal className="w-4 h-4 text-zinc-600 mr-3 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="bg-transparent border-none focus:outline-none text-sm text-zinc-200 placeholder-zinc-600 w-full"
                placeholder="/ Ask anything or use a command..."
              />
              <div className="flex items-center gap-2 shrink-0">
                <div className="hidden sm:flex items-center gap-1 mr-2">
                  <kbd className="px-1.5 py-0.5 border border-[#222] rounded bg-[#111] text-[10px] font-mono text-zinc-500">
                    ⌘
                  </kbd>
                  <kbd className="px-1.5 py-0.5 border border-[#222] rounded bg-[#111] text-[10px] font-mono text-zinc-500">
                    K
                  </kbd>
                </div>
                <button
                  onClick={handleSend}
                  className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* ─── Workflow Preview Panel ─── */}
        <aside className="hidden lg:flex flex-col w-80 border-l border-[#1a1a1a] bg-[#050505] shrink-0">
          <div className="p-4 border-b border-[#1a1a1a] flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
              Workflow Preview
            </span>
            <button className="text-zinc-600 hover:text-white transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Flow visualization */}
          <div
            className="flex-1 overflow-y-auto custom-scrollbar p-6"
            style={{
              backgroundImage: "radial-gradient(#1a1a1a 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          >
            <div className="relative space-y-10">
              {/* Vertical connector line */}
              <div className="absolute left-6 top-8 bottom-8 w-[2px] bg-[#1a1a1a]">
                <div
                  className="absolute top-0 left-0 w-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.3)]"
                  style={{ height: "45%" }}
                />
              </div>

              {/* Steps */}
              {WORKFLOW_STEPS.map((step, idx) => (
                <div
                  key={idx}
                  className={`relative flex items-start gap-5 group transition-opacity duration-300 ${
                    step.active ? "opacity-100" : "opacity-30"
                  }`}
                >
                  <div
                    className={`z-10 w-12 h-12 flex items-center justify-center bg-[#0d0d0d] border-2 rounded-full ring-8 ring-[#050505] ${
                      step.active ? "border-white" : "border-[#1a1a1a]"
                    }`}
                  >
                    <span className={step.active ? "text-white" : "text-zinc-600"}>
                      {step.icon}
                    </span>
                  </div>
                  <div className="pt-1.5">
                    <div
                      className={`text-[11px] font-mono uppercase tracking-wider mb-1 ${
                        step.active ? "text-white" : "text-zinc-600"
                      }`}
                    >
                      {step.label}
                    </div>
                    <div
                      className={`text-sm font-semibold ${
                        step.active ? "text-white" : "text-zinc-500"
                      }`}
                    >
                      {step.title}
                    </div>
                    {step.detail && (
                      <div className="text-[10px] text-zinc-600 mt-1">
                        {step.detail}
                      </div>
                    )}
                    {step.tags && (
                      <div className="flex gap-2 mt-2">
                        {step.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-[#111] border border-[#1a1a1a] text-[9px] text-zinc-500 font-mono uppercase tracking-wider rounded-sm"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom status */}
          <div className="p-4 border-t border-[#1a1a1a] space-y-3">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-600">Active Workflow</span>
              <span className="text-white">v2.0.4-rc</span>
            </div>
            <div className="w-full bg-[#111] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-white h-full rounded-full transition-all duration-1000"
                style={{ width: "45%" }}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* ─── Mobile Bottom Nav ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#050505] border-t border-[#1a1a1a] flex items-center justify-around px-6 z-50">
        {[
          { icon: <MessageSquare className="w-5 h-5" />, label: "Chat", active: true },
          { icon: <History className="w-5 h-5" />, label: "History", active: false },
          { icon: <Workflow className="w-5 h-5" />, label: "Flow", active: false },
          { icon: <Settings className="w-5 h-5" />, label: "Config", active: false },
        ].map((item) => (
          <button
            key={item.label}
            className={`flex flex-col items-center gap-1 ${
              item.active ? "text-white" : "text-zinc-600"
            }`}
          >
            {item.icon}
            <span className="text-[9px] uppercase font-mono tracking-wider">
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      {/* ─── Custom Scrollbar Styles ─── */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1a1a1a;
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #333;
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in-from-bottom-2 {
          from { transform: translateY(8px); }
          to { transform: translateY(0); }
        }
        .animate-in {
          animation: fade-in 0.3s ease-out, slide-in-from-bottom-2 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
