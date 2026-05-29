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
import { generateText, tool, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createMistral } from "@ai-sdk/mistral";
import { z } from "zod";

/**
 * Returns the primary model: Kimi (moonshotai/kimi-k2.6)
 */
const getPrimaryModel = () => {
  const kimiApiKey = process.env.KIMI_API_KEY || "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";
  
  const kimi = createOpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: kimiApiKey,
  });
  return kimi.chat("moonshotai/kimi-k2.6");
};

/**
 * Returns the fallback model: Mistral
 */
const getFallbackModel = () => {
  const mistralApiKey = process.env.MISTRAL_API_KEY;
  if (!mistralApiKey) throw new Error("MISTRAL_API_KEY is not set in environment variables.");
  const mistral = createMistral({ apiKey: mistralApiKey });
  return mistral("mistral-large-latest");
};

export async function POST(req: NextRequest) {
  // 1. Auth check
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;
  const { message, sessionId } = await req.json();

  // 2. Load user profile
  const profile = await prisma.userProfile.findUnique({ where: { userId } });

  // 3. Load last 10 messages for conversation context
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

  // 4. Build system prompt with user's profile
  const systemPrompt = AGENT_SYSTEM_PROMPT
    .replace("{{USER_NAME}}", session.user.name ?? "there")
    .replace("{{USER_PROFILE}}", JSON.stringify(profile?.context ?? {})) +
    `\n\nIMPORTANT: The current date and time is ${new Date().toLocaleString()}. Always use this as your reference for "today", "yesterday", "last 4 days", etc.`;

  // 5. Build messages array for AI SDK
  const coreMessages = [
    ...history.map((msg) => ({
      role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: msg.content,
    })),
    { role: "user" as const, content: message },
  ];

  // 6. Define agent tools (all tools in one place)
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

  try {
    let textResult;

    // 7. Try Kimi first (primary model)
    try {
      console.log("[Agent] Using primary model: Kimi-k2.6");
      const primaryModel = getPrimaryModel();
      textResult = await generateText({
        model: primaryModel,
        system: systemPrompt,
        messages: coreMessages,
        stopWhen: stepCountIs(10),
        tools: agentTools,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(10000),
      });
    } catch (primaryError: any) {
      // 8. Kimi failed — immediately fallback to Mistral
      console.warn(
        "[Agent] Kimi failed. Falling back to Mistral. Error:",
        primaryError.message
      );
      try {
        const fallbackModel = getFallbackModel();
        textResult = await generateText({
          model: fallbackModel,
          system: systemPrompt,
          messages: coreMessages,
          stopWhen: stepCountIs(10),
          tools: agentTools,
          maxRetries: 0,
        });
      } catch (mistralError: any) {
        console.error("[Agent] Mistral fallback also failed:", mistralError.message);
        throw mistralError;
      }
    }

    const { text: finalText } = textResult;

    // 9. Save session + messages to DB
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

    await prisma.chatMessage.createMany({
      data: [
        { sessionId: activeSessionId, role: "user", content: message },
        { sessionId: activeSessionId, role: "assistant", content: finalText },
      ],
    });

    // 10. Mark onboarding done if profile is filled
    if (profile && !profile.onboardingDone) {
      const ctx = profile.context as Record<string, string>;
      if (ctx.name && ctx.email) {
        await prisma.userProfile.update({
          where: { userId },
          data: { onboardingDone: true },
        });
      }
    }

    return Response.json({
      reply: finalText,
      sessionId: activeSessionId,
    });
  } catch (error: any) {
    console.error("Agent Chat Error:", error);
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
