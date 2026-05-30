export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, streamText, tool } from "ai";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  createOutreachState,
  mergeStartupLeads,
  type StartupLead,
  safeParseJsonObject,
  safeParseStartupExtraction,
  splitPersonName,
} from "@/features/agent/funding-workflow";
import { searchApollo } from "@/features/agent/tools/apollo";
import { createWorkflowFromAgent } from "@/features/agent/tools/create-workflow";
import { sendGmail } from "@/features/agent/tools/gmail";
import {
  findHunterEmail,
  verifyHunterEmail,
} from "@/features/agent/tools/hunter";
import {
  getCredentials,
  getProfile,
  rememberFact,
} from "@/features/agent/tools/memory";
import { webSearch } from "@/features/agent/tools/web-search";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent-prompt";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

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

  const nvidiaApiKey =
    process.env.NVIDIA_API_KEY ||
    "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";

  const nemotron = createOpenAI({
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: nvidiaApiKey,
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
            console.log(
              `[RAW NVIDIA] Chunk ${chunkIndex} | Time: ${Date.now()} | Length: ${text.length} | Preview: ${text.replace(/\n/g, "\\n").slice(0, 100)}`,
            );
            chunkIndex++;
          }
        })();
        return new Response(stream1, {
          status: res.status,
          headers: res.headers,
        });
      }
      return res;
    },
  });
  return nemotron.chat("nvidia/nemotron-3-super-120b-a12b");
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
  console.log(
    `[Profiler] Auth check & JSON parse: ${(performance.now() - tStart).toFixed(2)}ms`,
  );

  // 2. Load user profile
  tStart = performance.now();
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  console.log(
    `[Profiler] DB Load User Profile: ${(performance.now() - tStart).toFixed(2)}ms`,
  );

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
  console.log(
    `[Profiler] DB Load Chat History: ${(performance.now() - tStart).toFixed(2)}ms`,
  );

  // 4. Build system prompt with user's profile
  tStart = performance.now();
  const systemPrompt =
    AGENT_SYSTEM_PROMPT.replace(
      "{{USER_NAME}}",
      session.user.name ?? "there",
    ).replace("{{USER_PROFILE}}", JSON.stringify(profile?.context ?? {})) +
    `\n\nIMPORTANT: The current date and time is ${new Date().toLocaleString()}. Always use this as your reference for "today", "yesterday", "last 4 days", etc.` +
    `\n\nCRITICAL RULE: If you run a tool and do not find the information you need, or if you finish your entire workflow, YOU MUST ALWAYS GENERATE A FINAL TEXT RESPONSE EXPLAINING WHAT HAPPENED. Never leave your response blank.`;

  // 5. Build messages array for AI SDK
  const coreMessages = [
    ...history.map((msg) => ({
      role:
        msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: msg.content,
    })),
    { role: "user" as const, content: message },
  ];
  console.log(
    `[Profiler] Build Prompts & Messages: ${(performance.now() - tStart).toFixed(2)}ms`,
  );

  // 6. Define agent tools (all tools in one place)
  tStart = performance.now();
  const outreachState = createOutreachState();
  const startupLeadSchema = z.object({
    startup: z.string(),
    funding: z.string().nullable().optional(),
    sector: z.string().nullable().optional(),
    rank: z.number().nullable().optional(),
  });
  const createWorkflowInputSchema = z.object({
    name: z
      .string()
      .describe("Short descriptive name e.g. Monday JEE Summary Email"),
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
          "OPENAI",
          "GEMINI",
          "SLACK",
          "DISCORD",
          "HTTP_REQUEST",
          "GMAIL",
          "FOR_EACH_STARTUP",
        ]),
        dependsOn: z
          .array(z.string())
          .optional()
          .describe("Step IDs that must complete before this step runs"),
        config: z
          .record(z.string(), z.unknown())
          .describe("Step configuration"),
      }),
    ),
    runNow: z
      .boolean()
      .optional()
      .describe(
        "true = execute immediately after saving. false = wait for trigger.",
      ),
  });

  const agentTools = {
    set_workflow_state: tool({
      description:
        "Save and lock in the current workflow state to prevent re-searching.",
      inputSchema: z.object({
        startup: z.string(),
        funding: z.string().nullable().optional(),
        sector: z.string().nullable().optional(),
        rank: z.number().nullable().optional(),
        founder: z.string().nullable().optional(),
        linkedin: z.string().nullable().optional(),
        domain: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        verified: z.boolean().nullable().optional(),
        status: z
          .enum([
            "identified",
            "founder_found",
            "email_found",
            "email_verified",
            "email_rejected",
            "drafted",
            "sent",
            "skipped",
          ])
          .optional(),
        notes: z.string().nullable().optional(),
      }),
      execute: async (state) => {
        const savedState = outreachState.upsert(state);
        console.log(`[Workflow State Updated]`, savedState);
        return {
          success: true,
          message:
            "State locked. Do not research this startup again unless a required field is still missing.",
          state: savedState,
          allStates: outreachState.list(),
        };
      },
    }),

    get_workflow_state: tool({
      description:
        "Read deterministic outreach state for all startups processed in this request.",
      inputSchema: z.object({
        startup: z.string().optional(),
      }),
      execute: async ({ startup }) => {
        return startup ? outreachState.get(startup) : outreachState.list();
      },
    }),

    extract_startups_from_post: tool({
      description:
        "Extract ALL startup names, funding amounts, and sectors from LinkedIn post text. Returns a parsed startup array.",
      inputSchema: z.object({
        post_text: z.string(),
      }),
      execute: async ({ post_text }) => {
        console.log(`[Extraction Model] Parsing post text...`);
        const nvidiaApiKey =
          process.env.NVIDIA_API_KEY ||
          "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";
        const flash = createOpenAI({
          baseURL: "https://integrate.api.nvidia.com/v1",
          apiKey: nvidiaApiKey,
        });
        const response = await generateText({
          model: flash.chat("deepseek-ai/deepseek-v4-flash"),
          system:
            'Extract every startup mentioned in the text. Return ONLY valid JSON, no markdown. Shape: [{"startup":"Company","funding":"$1M Seed","sector":"Fintech"}]. If no startups are present, return [].',
          prompt: post_text,
        });
        const startups = safeParseStartupExtraction(response.text, "post");
        for (const startup of startups) outreachState.upsert(startup);
        return { startups, count: startups.length, raw: response.text };
      },
    }),

    vision_extract_infographic: tool({
      description:
        "Extract ALL startup names, funding amounts, rankings, and sectors from a LinkedIn infographic image. Returns a parsed startup array.",
      inputSchema: z.object({
        image_url: z.string(),
      }),
      execute: async ({ image_url }) => {
        console.log(
          `[Vision Extraction] Parsing infographic image at ${image_url}...`,
        );
        const nvidiaApiKey =
          process.env.NVIDIA_API_KEY ||
          "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";
        const vision = createOpenAI({
          baseURL: "https://integrate.api.nvidia.com/v1",
          apiKey: nvidiaApiKey,
        });
        // We simulate the output structure since we don't have true vision capabilities in the standard text SDK easily without passing messages array properly, but we'll try:
        const response = await generateText({
          model: vision.chat("meta/llama-3.2-90b-vision-instruct"),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: 'Extract every startup from this funding infographic. Return ONLY valid JSON, no markdown. Shape: [{"rank":1,"startup":"Company","funding":"$1M Seed","sector":"Fintech"}]. If unreadable, return [].',
                },
                { type: "image", image: new URL(image_url) },
              ],
            },
          ],
        });
        const startups = safeParseStartupExtraction(
          response.text,
          "infographic",
        );
        for (const startup of startups) outreachState.upsert(startup);
        return { startups, count: startups.length, raw: response.text };
      },
    }),

    merge_startup_extractions: tool({
      description:
        "Deterministically merge startup arrays from post and infographic extraction, de-duplicate by startup name, and lock the leaderboard in workflow state.",
      inputSchema: z.object({
        post_startups: z.array(startupLeadSchema).default([]),
        infographic_startups: z.array(startupLeadSchema).default([]),
      }),
      execute: async ({ post_startups, infographic_startups }) => {
        const merged = mergeStartupLeads(
          post_startups as StartupLead[],
          infographic_startups as StartupLead[],
        );
        for (const startup of merged) outreachState.upsert(startup);

        return {
          startups: merged,
          count: merged.length,
          state: outreachState.list(),
        };
      },
    }),

    generate_email_draft: tool({
      description:
        "Generate a highly personalized outreach email using deepseek-v4-pro based on the discovered startup and founder context.",
      inputSchema: z.object({
        startup_name: z.string(),
        founder_name: z.string(),
        funding_announcement: z
          .string()
          .describe("Details about their funding (amount, stage, sector)"),
        orcha_context: z
          .string()
          .describe("Context about the user/Orcha to include in the email"),
      }),
      execute: async ({
        startup_name,
        founder_name,
        funding_announcement,
        orcha_context,
      }) => {
        console.log(
          `[Reasoning Model] Generating email for ${founder_name} at ${startup_name}...`,
        );
        const nvidiaApiKey =
          process.env.NVIDIA_API_KEY ||
          "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";
        const deepseek = createOpenAI({
          baseURL: "https://integrate.api.nvidia.com/v1",
          apiKey: nvidiaApiKey,
        });

        const response = await generateText({
          model: deepseek.chat("deepseek-ai/deepseek-v4-pro"),
          system:
            "You are an expert cold outreach copywriter. Keep it short, punchy, and highly personalized. End with a soft ask for a 15 min call. No placeholders.",
          prompt: `Write a cold email to ${founder_name} at ${startup_name}. \nFunding Context: ${funding_announcement}\nSender Context: ${orcha_context}`,
        });

        outreachState.upsert({
          startup: startup_name,
          founder: founder_name,
          status: "drafted",
        });

        return {
          subject: `Congrats on the raise, ${startup_name}`,
          body: response.text,
        };
      },
    }),

    web_search: tool({
      description:
        "Search the internet for current information. For funding outreach founder discovery, pass startup and use max 2 searches per startup.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        days: z
          .number()
          .optional()
          .describe(
            "Optional. Filter results to the last X days (e.g. 4 for 'last 4 days')",
          ),
        domains: z
          .array(z.string())
          .optional()
          .describe(
            "Optional. Restrict search to specific domains (e.g. ['linkedin.com', 'inc42.com'])",
          ),
        startup: z
          .string()
          .optional()
          .describe(
            "Required when searching founder/domain details for a known startup.",
          ),
      }),
      execute: async ({
        query,
        days,
        domains,
        startup,
      }: {
        query: string;
        days?: number;
        domains?: string[];
        startup?: string;
      }) => {
        if (startup) {
          const current = outreachState.get(startup);
          if (current?.founder && (current.domain || current.linkedin)) {
            return {
              skipped: true,
              reason:
                "Founder/domain already locked in workflow state. Continue to Hunter instead of searching again.",
              state: current,
            };
          }

          if (current && current.searchCount >= 2) {
            return {
              skipped: true,
              reason:
                "Search limit reached for this startup. Move to the next workflow step with available state.",
              state: current,
            };
          }

          outreachState.incrementSearch(startup);
        }

        return await webSearch(query, days, domains);
      },
    }),

    discover_founder: tool({
      description:
        "Find and lock founder/CEO, LinkedIn URL, and company domain for one known startup with a hard cap of 2 web searches.",
      inputSchema: z.object({
        startup: z.string(),
        sector: z.string().nullable().optional(),
      }),
      execute: async ({ startup, sector }) => {
        const existing = outreachState.get(startup);
        if (existing?.founder && existing.domain) {
          return { skipped: true, state: existing };
        }

        if (existing && existing.searchCount >= 2) {
          return {
            skipped: true,
            reason: "Search limit already reached for this startup.",
            state: existing,
          };
        }

        outreachState.upsert({ startup, sector, status: "identified" });
        outreachState.incrementSearch(startup);

        const query =
          `${startup} founder CEO LinkedIn official website ${sector ?? ""}`.trim();
        const results = await webSearch(query, 30, [
          "linkedin.com",
          "crunchbase.com",
          "inc42.com",
        ]);
        const nvidiaApiKey =
          process.env.NVIDIA_API_KEY ||
          "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";
        const flash = createOpenAI({
          baseURL: "https://integrate.api.nvidia.com/v1",
          apiKey: nvidiaApiKey,
        });

        const response = await generateText({
          model: flash.chat("deepseek-ai/deepseek-v4-flash"),
          system:
            'Extract founder discovery data from search results. Return ONLY valid JSON: {"founder":"Full Name","linkedin":"https://...","domain":"company.com"}. Use null for missing fields.',
          prompt: JSON.stringify({ startup, results }),
        });

        const parsed = safeParseJsonObject<{
          founder?: string | null;
          linkedin?: string | null;
          domain?: string | null;
        }>(response.text);

        const savedState = outreachState.upsert({
          startup,
          sector,
          founder: parsed.founder ?? null,
          linkedin: parsed.linkedin ?? null,
          domain: parsed.domain ?? null,
          status: parsed.founder ? "founder_found" : "skipped",
        });

        return { state: savedState, results };
      },
    }),

    hunter_email_finder: tool({
      description:
        "Find the founder or CEO email using Hunter.io. Priority over Apollo.",
      inputSchema: z.object({
        startup: z.string().optional(),
        founderName: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        domain: z.string(),
      }),
      execute: async ({
        startup,
        founderName,
        firstName,
        lastName,
        domain,
      }) => {
        const nameParts = founderName
          ? splitPersonName(founderName)
          : { firstName: firstName ?? "", lastName: lastName ?? "" };
        const result = await findHunterEmail(
          nameParts.firstName,
          nameParts.lastName,
          domain,
        );
        if (startup) {
          outreachState.upsert({
            startup,
            founder: founderName,
            domain,
            email: result.email,
            status: result.email ? "email_found" : "skipped",
          });
        }
        return result;
      },
    }),

    hunter_email_verifier: tool({
      description:
        "Verify an email using Hunter.io. ALWAYS call this after finding an email.",
      inputSchema: z.object({
        startup: z.string().optional(),
        email: z.string(),
      }),
      execute: async ({ startup, email }) => {
        const result = await verifyHunterEmail(email);
        console.log(
          `[Hunter Verification Status] ${result.status} (Score: ${result.score})`,
        );
        if (startup) {
          const verified =
            result.status === "deliverable" || result.status === "valid";
          outreachState.upsert({
            startup,
            email,
            verified,
            status: verified ? "email_verified" : "email_rejected",
          });
        }
        return result;
      },
    }),

    find_email: tool({
      description:
        "Fallback: Find the founder or CEO email using Apollo if Hunter fails.",
      inputSchema: z.object({
        domain: z.string(),
      }),
      execute: async ({ domain }) => {
        return await searchApollo(domain);
      },
    }),

    send_email: tool({
      description:
        "Send an email from the user's Gmail account on their behalf. Always call get_credentials first to get the credentialId.",
      inputSchema: z.object({
        startup: z.string().optional(),
        credentialId: z
          .string()
          .describe("The Gmail credential ID from get_credentials"),
        to: z.string().describe("Recipient email address"),
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email body text"),
      }),
      execute: async (params: {
        startup?: string;
        credentialId: string;
        to: string;
        subject: string;
        body: string;
      }) => {
        console.log(`[Email Sent] Sending email to ${params.to}`);
        const result = await sendGmail(userId, params);
        if (params.startup) {
          outreachState.upsert({
            startup: params.startup,
            email: params.to,
            status: "sent",
          });
        }
        return result;
      },
    }),

    remember: tool({
      description:
        "Save an important fact about the user to memory. Use this during onboarding and whenever the user shares info you should not forget.",
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "Label for the info e.g. university, professorEmail, studentId",
          ),
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
          .enum(["OPENAI", "GEMINI", "GMAIL", "SLACK", "TAVILY"])
          .optional()
          .describe("Filter by credential type"),
      }),
      execute: async ({
        type,
      }: {
        type?: "OPENAI" | "GEMINI" | "GMAIL" | "SLACK" | "TAVILY";
      }) => {
        return await getCredentials(userId, type);
      },
    }),

    create_workflow: tool({
      description:
        "Create and save an automation workflow that runs automatically. Call this when: user wants recurring automation, multi-step pipeline, or uses words like every, whenever, schedule, automatically.",
      inputSchema: createWorkflowInputSchema,
      execute: async (params: z.infer<typeof createWorkflowInputSchema>) => {
        return await createWorkflowFromAgent({ userId, ...params });
      },
    }),
  };
  console.log(
    `[Profiler] Tool Registration: ${(performance.now() - tStart).toFixed(2)}ms`,
  );

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
      // Use providerOptions.gateway for automatic fallback to Nemotron model
      providerOptions: {
        gateway: {
          models: ["nvidia/nemotron-3-super-120b-a12b"],
        },
      },

      stopWhen: stepCountIs(20),
      tools: agentTools,
      maxRetries: 0,
      onStepFinish: (step) => {
        console.log(`\n--- [Agent Loop] Step Finished ---`);
        console.log(`Finish Reason: ${step.finishReason}`);
        console.log(`Tool Calls: ${step.toolCalls?.length || 0}`);
        console.log(`Tool Results: ${step.toolResults?.length || 0}`);
        if (step.toolCalls?.length > 0) {
          console.log(
            `Called tools: ${step.toolCalls.map((t) => t.toolName).join(", ")}`,
          );
        }
        console.log(`Proceeding to next step generation...`);
        console.log(`----------------------------------\n`);
      },
      // Log each chunk for debugging and ensure we always have output
      onChunk: (chunk) => {
        console.log(`[Streamer] Chunk received: ${JSON.stringify(chunk)}`);
      },
      onFinish: async ({ text }) => {
        // Ensure we have a non‑empty response; provide a fallback if needed
        const finalText =
          text && text.trim().length > 0 ? text : "[No response generated]";
        const tStart = performance.now();
        console.log(`[Streamer] Finished with ${finalText.length} characters`);
        await prisma.chatMessage.createMany({
          data: [
            { sessionId: activeSessionId, role: "user", content: message },
            {
              sessionId: activeSessionId,
              role: "assistant",
              content: finalText,
            },
          ],
        });
        if (profile && !profile.onboardingDone) {
          const ctx = profile.context as Record<string, string>;
          if (ctx.name && ctx.email) {
            await prisma.userProfile.update({
              where: { userId },
              data: { onboardingDone: true },
            });
          }
        }
        console.log(
          `[Profiler] DB Message Persistence (onFinish): ${(performance.now() - tStart).toFixed(2)}ms`,
        );
        console.log(
          `[Profiler] === TOTAL REQUEST TIME: ${((performance.now() - globalStart) / 1000).toFixed(2)}s ===\n`,
        );
      },
    });

    // Return a data stream response that useChat can consume, including tool invocations
    return result.toUIMessageStreamResponse({
      headers: {
        "x-session-id": activeSessionId,
      },
    });
  } catch (error: unknown) {
    console.error("Agent Chat Error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
