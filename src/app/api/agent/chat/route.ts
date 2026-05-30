export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/db";
import { webSearch } from "@/features/agent/tools/web-search";
import { sendGmail } from "@/features/agent/tools/gmail";
import { rememberFact, getProfile, getCredentials } from "@/features/agent/tools/memory";
import { createWorkflowFromAgent } from "@/features/agent/tools/create-workflow";
import { searchApollo } from "@/features/agent/tools/apollo";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent-prompt";
import { streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createMistral } from "@ai-sdk/mistral";
import { z } from "zod";

/**
 * Returns the primary model: NVIDIA Nemotron 3 Super 120B A12B
 */
const getPrimaryModel = () => {
  // TEMPORARILY DISABLED:
  // Kimi endpoint is currently experiencing severe timeout issues
  // (5+ minute hangs and 504 Gateway Timeout responses).
  
  // const kimiApiKey = process.env.KIMI_API_KEY || "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";
  // 
  // const kimi = createOpenAI({
  //   baseURL: "https://integrate.api.nvidia.com/v1",
  //   apiKey: kimiApiKey,
  //   compatibility: "compatible",
  //   fetch: async (url, options) => {
  //     const fixedUrl = url.toString().replace('/responses', '/chat/completions');
  //     return fetch(fixedUrl, options);
  //   }
  // });
  // return kimi("moonshotai/kimi-k2.6");

  const nvidiaApiKey = process.env.NVIDIA_API_KEY || "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";
  
  const nemotron = createOpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: nvidiaApiKey,
    compatibility: "compatible",
    fetch: async (url, options) => {
      const res = await fetch(url, options);
      if (res.body) {
        const [stream1, stream2] = res.body.tee();
        (async () => {
          const reader = stream2.getReader();
          const decoder = new TextDecoder();
          let chunkIndex = 1;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            console.log(`[RAW NVIDIA] Chunk ${chunkIndex} | Time: ${Date.now()} | Length: ${text.length} | Preview: ${text.replace(/\n/g, '\\n').slice(0, 100)}`);
            chunkIndex++;
          }
        })();
        return new Response(stream1, { status: res.status, headers: res.headers });
      }
      return res;
    }
  });
  return nemotron.chat("nvidia/nemotron-3-super-120b-a12b");
};

/**
 * Returns the fallback model: Mistral
 */
const getFallbackModel = () => {
  const mistralApiKey = process.env.MISTRAL_API_KEY;
  if (!mistralApiKey) throw new Error("MISTRAL_API_KEY is not set in environment variables.");
  const mistral = createMistral({ 
    apiKey: mistralApiKey,
    fetch: async (url, options) => {
      const res = await fetch(url, options);
      if (res.body) {
        const [stream1, stream2] = res.body.tee();
        (async () => {
          const reader = stream2.getReader();
          const decoder = new TextDecoder();
          let chunkIndex = 1;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            console.log(`[RAW MISTRAL] Chunk ${chunkIndex} | Time: ${Date.now()} | Length: ${text.length} | Preview: ${text.replace(/\n/g, '\\n').slice(0, 100)}`);
            chunkIndex++;
          }
        })();
        return new Response(stream1, { status: res.status, headers: res.headers });
      }
      return res;
    }
  });
  return mistral("mistral-large-latest");
};

export async function POST(req: NextRequest) {
  const globalStart = performance.now();
  console.log("\n[Profiler] === NEW REQUEST START ===");

  // 1. Auth check
  let tStart = performance.now();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const { message, sessionId } = await req.json();
  console.log(`[Profiler] Auth check & JSON parse: ${((performance.now() - tStart)).toFixed(2)}ms`);

  // 2. Load user profile
  tStart = performance.now();
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  console.log(`[Profiler] DB Load User Profile: ${((performance.now() - tStart)).toFixed(2)}ms`);

  // 3. Load last 10 messages for conversation context
  tStart = performance.now();
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (sessionId) {
    const msgs = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { role: true, content: true },
    });
    history = msgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }
  console.log(`[Profiler] DB Load Chat History: ${((performance.now() - tStart)).toFixed(2)}ms`);

  // 4. Build system prompt with user's profile
  tStart = performance.now();
  const systemPrompt = AGENT_SYSTEM_PROMPT
    .replace("{{USER_NAME}}", session.user.name ?? "there")
    .replace("{{USER_PROFILE}}", JSON.stringify(profile?.context ?? {})) +
    `\n\nIMPORTANT: The current date and time is ${new Date().toLocaleString()}. Always use this as your reference for "today", "yesterday", "last 4 days", etc.` +
    `\n\nCRITICAL RULE: If you run a tool and do not find the information you need, or if you finish your entire workflow, YOU MUST ALWAYS GENERATE A FINAL TEXT RESPONSE EXPLAINING WHAT HAPPENED. Never leave your response blank.`;

  // 5. Build messages array for AI SDK
  const coreMessages = [
    ...history.map((msg) => ({
      role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: msg.content,
    })),
    { role: "user" as const, content: message },
  ];
  console.log(`[Profiler] Build Prompts & Messages: ${((performance.now() - tStart)).toFixed(2)}ms`);

  // 6. Define agent tools (all tools in one place)
  tStart = performance.now();
  const agentTools = {
    web_search: tool({
      description:
        "Search the internet for current information, news, facts, or anything time-sensitive. Use this to find latest funded startups on Inc42, YourStory, etc.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        days: z.number().optional().describe("Optional. Filter results to the last X days (e.g. 4 for 'last 4 days')"),
        domains: z.array(z.string()).optional().describe("Optional. Restrict search to specific domains (e.g. ['linkedin.com', 'inc42.com'])"),
      }),
      execute: async ({ query, days, domains }: { query: string, days?: number, domains?: string[] }) => {
        return await webSearch(query, days, domains);
      },
    }),

    find_email: tool({
      description:
        "Find the founder or CEO email of a company using Apollo. Takes a company domain (e.g. 'techstartup.com') and returns name, email, and title of the founder/CEO.",
      inputSchema: z.object({
        domain: z
          .string()
          .describe(
            "The company website domain, e.g. 'techstartup.com'. Extract this from the startup's website URL."
          ),
      }),
      execute: async ({ domain }: { domain: string }) => {
        return await searchApollo(domain);
      },
    }),

    send_email: tool({
      description:
        "Send an email from the user's Gmail account on their behalf. Always call get_credentials first to get the credentialId.",
      inputSchema: z.object({
        credentialId: z.string().describe("The Gmail credential ID from get_credentials"),
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email body text"),
      }),
      execute: async (params: {
        credentialId: string;
        to: string;
        subject: string;
        body: string;
      }) => {
        return await sendGmail(userId, params);
      },
    }),

    remember: tool({
      description:
        "Save an important fact about the user to memory. Use this during onboarding and whenever the user shares info you should not forget.",
      inputSchema: z.object({
        key: z.string().describe("Label for the info e.g. university, professorEmail, studentId"),
        value: z.string().describe("The value to store"),
      }),
      execute: async ({ key, value }: { key: string; value: string }) => {
        return await rememberFact(userId, key, value);
      },
    }),

    get_profile: tool({
      description: "Read all stored information about the user from memory.",
      inputSchema: z.object({}),
      execute: async () => {
        return await getProfile(userId);
      },
    }),

    get_credentials: tool({
      description:
        "List the user's connected credentials. Always call this before using Gmail or any AI tool in a workflow.",
      inputSchema: z.object({
        type: z
          .enum(["ANTHROPIC", "OPENAI", "GEMINI", "GMAIL", "SLACK", "TAVILY"])
          .optional()
          .describe("Filter by credential type"),
      }),
      execute: async ({
        type,
      }: {
        type?: "ANTHROPIC" | "OPENAI" | "GEMINI" | "GMAIL" | "SLACK" | "TAVILY";
      }) => {
        return await getCredentials(userId, type);
      },
    }),

    create_workflow: tool({
      description:
        "Create and save an automation workflow that runs automatically. Call this when: user wants recurring automation, multi-step pipeline, or uses words like every, whenever, schedule, automatically.",
      inputSchema: z.object({
        name: z.string().describe("Short descriptive name e.g. Monday JEE Summary Email"),
        trigger: z.object({
          type: z.enum(["MANUAL_TRIGGER", "GOOGLE_FORM_TRIGGER", "SCHEDULE"]),
          cron: z
            .string()
            .optional()
            .describe("Cron expression for SCHEDULE trigger e.g. 0 9 * * MON"),
          formId: z
            .string()
            .optional()
            .describe("Google Form ID for GOOGLE_FORM_TRIGGER"),
        }),
        steps: z.array(
          z.object({
            id: z.string().describe("Unique step ID e.g. step_1, step_2"),
            type: z.enum([
              "ANTHROPIC",
              "OPENAI",
              "GEMINI",
              "SLACK",
              "DISCORD",
              "HTTP_REQUEST",
              "GMAIL",
            ]),
            dependsOn: z
              .array(z.string())
              .optional()
              .describe("Step IDs that must complete before this step runs"),
            config: z.record(z.string(), z.any()).describe("Step configuration"),
          })
        ),
        runNow: z
          .boolean()
          .optional()
          .describe("true = execute immediately after saving. false = wait for trigger."),
      }),
      execute: async (params: any) => {
        return await createWorkflowFromAgent({ userId, ...params });
      },
    }),
  };
  console.log(`[Profiler] Tool Registration: ${((performance.now() - tStart)).toFixed(2)}ms`);

  try {
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const newSession = await prisma.chatSession.create({
        data: {
          userId,
          title: message.slice(0, 60),
        },
      });
      activeSessionId = newSession.id;
    }

    console.log("[Agent] Primary model: NVIDIA Nemotron 3 Super 120B A12B");
    const activeModel = getPrimaryModel();

      console.log("[Agent] Invoking streamText");
            const result = streamText({
        model: activeModel,
        system: systemPrompt,
        messages: coreMessages,
        // Use providerOptions.gateway for automatic fallback to Mistral model
        providerOptions: {
          gateway: {
            models: [
              "nvidia/nemotron-3-super-120b-a12b",
              "mistral-large-latest"
            ]
          }
        },

        maxTokens: 1024,
        maxSteps: 20,



        tools: agentTools,
        maxRetries: 0,
        // Log each chunk for debugging and ensure we always have output
        onChunk: (chunk) => {
          console.log(`[Streamer] Chunk received: ${JSON.stringify(chunk)}`);
        },
        onFinish: async ({ text }) => {
          // Ensure we have a non‑empty response; provide a fallback if needed
          const finalText = text && text.trim().length > 0 ? text : "[No response generated]";
          const tStart = performance.now();
          console.log(`[Streamer] Finished with ${finalText.length} characters`);
          await prisma.chatMessage.createMany({
            data: [
              { sessionId: activeSessionId, role: "user", content: message },
              { sessionId: activeSessionId, role: "assistant", content: finalText },
            ],
          });
          if (profile && !profile.onboardingDone) {
            const ctx = profile.context as Record<string, string>;
            if (ctx.name && ctx.email) {
              await prisma.userProfile.update({ where: { userId }, data: { onboardingDone: true } });
            }
          }
          console.log(`[Profiler] DB Message Persistence (onFinish): ${((performance.now() - tStart)).toFixed(2)}ms`);
          console.log(`[Profiler] === TOTAL REQUEST TIME: ${((performance.now() - globalStart) / 1000).toFixed(2)}s ===\n`);
        },
      });

    // Return a data stream response that useChat can consume, including tool invocations
    return result.toUIMessageStreamResponse({
      headers: {
        "x-session-id": activeSessionId,
      },
    });

  } catch (error: any) {
    console.error("Agent Chat Error:", error);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
