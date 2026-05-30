import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NonRetriableError } from "inngest";
import {
  safeParseJsonObject,
  splitPersonName,
} from "@/features/agent/funding-workflow";
import { sendGmail } from "@/features/agent/tools/gmail";
import {
  findHunterEmail,
  verifyHunterEmail,
} from "@/features/agent/tools/hunter";
import { webSearch } from "@/features/agent/tools/web-search";
import { ExecutionStatus, type Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { inngest } from "./client";

const STARTUP_OUTREACH_EVENT = "funding/startup.outreach";

const STATUS_ORDER = [
  "CREATED",
  "FOUNDER_FOUND",
  "EMAIL_FOUND",
  "EMAIL_VERIFIED",
  "EMAIL_GENERATED",
  "EMAIL_SENT",
] as const;

type OutreachStatus = (typeof STATUS_ORDER)[number] | "FAILED";

type PipelineConfig = {
  openaiCredentialId?: string | null;
  gmailCredentialId?: string | null;
  senderName?: string | null;
  senderContext?: string | null;
  liveMode?: boolean | null;
  testEmail?: string | null;
};

type AttemptOutput = {
  pipelineConfig?: PipelineConfig;
  startup?: {
    startup?: string;
    funding?: string | null;
    sector?: string | null;
    rank?: number | null;
  };
  founderDiscovery?: unknown;
  companyDiscovery?: {
    domain?: string | null;
    description?: string | null;
    website?: string | null;
  };
  emailFinder?: unknown;
  emailVerification?: unknown;
  emailDraft?: {
    subject: string;
    body: string;
  };
  sentEmail?: unknown;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function getAttemptOutput(value: unknown): AttemptOutput {
  return asRecord(value) as AttemptOutput;
}

function mergeOutput(existing: unknown, updates: Partial<AttemptOutput>) {
  return {
    ...getAttemptOutput(existing),
    ...updates,
  };
}

function mergeStartupState(
  existing: unknown,
  updates: Record<string, unknown>,
) {
  return {
    ...asRecord(existing),
    ...updates,
  };
}

function statusIndex(status: OutreachStatus) {
  return STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number]);
}

function hasReached(current: OutreachStatus, target: OutreachStatus) {
  if (current === "FAILED") return false;
  return statusIndex(current) >= statusIndex(target);
}

function deriveResumeStatus(attempt: {
  status: string;
  founder: string | null;
  domain: string | null;
  email: string | null;
  verified: boolean | null;
  output: unknown;
}): OutreachStatus {
  const output = getAttemptOutput(attempt.output);

  if (output.sentEmail || attempt.status === "EMAIL_SENT") return "EMAIL_SENT";
  if (output.emailDraft || attempt.status === "EMAIL_GENERATED") {
    return "EMAIL_GENERATED";
  }
  if (attempt.verified || attempt.status === "EMAIL_VERIFIED") {
    return "EMAIL_VERIFIED";
  }
  if (attempt.email || attempt.status === "EMAIL_FOUND") return "EMAIL_FOUND";
  if (attempt.founder || attempt.status === "FOUNDER_FOUND") {
    return "FOUNDER_FOUND";
  }

  return "CREATED";
}

async function loadAttempt(outreachAttemptId: string) {
  return prisma.outreachAttempt.findUniqueOrThrow({
    where: { id: outreachAttemptId },
    include: {
      execution: true,
      startupLead: {
        include: {
          fundingPost: {
            include: {
              workflow: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

async function getNvidiaApiKey(userId: string, credentialId?: string | null) {
  if (credentialId) {
    const credential = await prisma.credential.findUnique({
      where: {
        id: credentialId,
        userId,
      },
    });

    if (credential) return decrypt(credential.value);
  }

  if (!process.env.NVIDIA_API_KEY) {
    throw new NonRetriableError(
      "NVIDIA_API_KEY or a valid OpenAI/NVIDIA credential is required",
    );
  }

  return process.env.NVIDIA_API_KEY;
}

async function generateJson<T extends Record<string, unknown>>({
  userId,
  credentialId,
  model,
  system,
  prompt,
}: {
  userId: string;
  credentialId?: string | null;
  model: string;
  system: string;
  prompt: string;
}) {
  const openai = createOpenAI({
    apiKey: await getNvidiaApiKey(userId, credentialId),
    baseURL: "https://integrate.api.nvidia.com/v1",
  });

  const response = await generateText({
    model: openai.chat(model),
    system,
    prompt,
  });

  return {
    text: response.text,
    json: safeParseJsonObject<T>(response.text),
  };
}

async function updateProgress({
  outreachAttemptId,
  startupLeadId,
  status,
  fields = {},
  output,
}: {
  outreachAttemptId: string;
  startupLeadId: string;
  status: OutreachStatus;
  fields?: {
    founder?: string | null;
    linkedin?: string | null;
    domain?: string | null;
    email?: string | null;
    verified?: boolean | null;
    searchCount?: number;
    error?: string | null;
    completedAt?: Date | null;
  };
  output?: Partial<AttemptOutput>;
}) {
  const current = await prisma.outreachAttempt.findUniqueOrThrow({
    where: { id: outreachAttemptId },
    select: {
      output: true,
      startupLead: {
        select: {
          state: true,
        },
      },
    },
  });

  const nextOutput = output
    ? mergeOutput(current.output, output)
    : current.output;
  const nextState = mergeStartupState(current.startupLead.state, {
    status,
    ...fields,
    ...(output || {}),
  });

  await prisma.$transaction([
    prisma.outreachAttempt.update({
      where: { id: outreachAttemptId },
      data: {
        status,
        ...fields,
        output: toJson(nextOutput),
      },
    }),
    prisma.startupLead.update({
      where: { id: startupLeadId },
      data: {
        status,
        state: toJson(nextState),
      },
    }),
  ]);
}

async function failAttempt({
  outreachAttemptId,
  startupLeadId,
  executionId,
  error,
}: {
  outreachAttemptId: string;
  startupLeadId: string;
  executionId?: string | null;
  error: unknown;
}) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  await updateProgress({
    outreachAttemptId,
    startupLeadId,
    status: "FAILED",
    fields: {
      error: message,
      completedAt: new Date(),
    },
  });

  if (executionId) {
    await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: ExecutionStatus.FAILED,
        error: message,
        errorStack: stack,
        completedAt: new Date(),
      },
    });
  }
}

export const executeStartupOutreach = inngest.createFunction(
  {
    id: "execute-startup-outreach",
    retries: process.env.NODE_ENV === "production" ? 3 : 1,
    concurrency: {
      limit: 1,
      key: "event.data.fundingPostId",
    },
    onFailure: async ({ event }) => {
      const data = event.data.event.data as {
        outreachAttemptId?: string;
        startupLeadId?: string;
        childExecutionId?: string;
      };

      if (!data.outreachAttemptId || !data.startupLeadId) return;

      await failAttempt({
        outreachAttemptId: data.outreachAttemptId,
        startupLeadId: data.startupLeadId,
        executionId: data.childExecutionId,
        error: event.data.error,
      });
    },
  },
  {
    event: STARTUP_OUTREACH_EVENT,
  },
  async ({ event, step }) => {
    const {
      outreachAttemptId,
      startupLeadId,
      childExecutionId,
    }: {
      outreachAttemptId?: string;
      startupLeadId?: string;
      childExecutionId?: string;
    } = event.data;

    if (!outreachAttemptId || !startupLeadId || !childExecutionId) {
      throw new NonRetriableError(
        "Startup outreach event requires outreachAttemptId, startupLeadId, and childExecutionId",
      );
    }

    await step.run("mark-child-running", async () => {
      await prisma.execution.update({
        where: { id: childExecutionId },
        data: {
          status: ExecutionStatus.RUNNING,
          completedAt: null,
          error: null,
          errorStack: null,
        },
      });

      await prisma.outreachAttempt.update({
        where: { id: outreachAttemptId },
        data: {
          startedAt: new Date(),
          error: null,
        },
      });
    });

    try {
      let attempt = await loadAttempt(outreachAttemptId);
      const userId = attempt.startupLead.fundingPost.workflow.userId;
      const startup = attempt.startupLead.startup;
      const funding = attempt.startupLead.funding;
      const sector = attempt.startupLead.sector;
      const config = getAttemptOutput(attempt.output).pipelineConfig || {};
      let currentStatus = deriveResumeStatus(attempt);

      if (!hasReached(currentStatus, "FOUNDER_FOUND")) {
        const founderDiscovery = await step.run(
          "founder-discovery",
          async () => {
            const results = await webSearch(
              `${startup} founder co-founder CEO LinkedIn`,
              30,
              ["linkedin.com", "inc42.com", "yourstory.com", "crunchbase.com"],
            );

            const extraction = await generateJson<{
              founder?: string | null;
              linkedin?: string | null;
            }>({
              userId,
              credentialId: config.openaiCredentialId,
              model: "deepseek-ai/deepseek-v4-flash",
              system:
                'Extract founder discovery data. Return ONLY valid JSON: {"founder":"Full Name","linkedin":"https://..."} Use null for missing fields.',
              prompt: JSON.stringify({ startup, funding, sector, results }),
            });

            return {
              results,
              founder: extraction.json.founder ?? null,
              linkedin: extraction.json.linkedin ?? null,
            };
          },
        );

        if (!founderDiscovery.founder) {
          throw new NonRetriableError(`Founder not found for ${startup}`);
        }

        await updateProgress({
          outreachAttemptId,
          startupLeadId,
          status: "FOUNDER_FOUND",
          fields: {
            founder: founderDiscovery.founder,
            linkedin: founderDiscovery.linkedin,
            searchCount: attempt.searchCount + 1,
          },
          output: {
            founderDiscovery,
          },
        });
      }

      attempt = await loadAttempt(outreachAttemptId);
      currentStatus = deriveResumeStatus(attempt);

      if (!attempt.domain) {
        const companyDiscovery = await step.run(
          "company-discovery",
          async () => {
            const results = await webSearch(
              `${startup} official website domain company ${sector ?? ""}`.trim(),
              30,
            );

            const extraction = await generateJson<{
              domain?: string | null;
              website?: string | null;
              description?: string | null;
            }>({
              userId,
              credentialId: config.openaiCredentialId,
              model: "deepseek-ai/deepseek-v4-flash",
              system:
                'Extract company discovery data. Return ONLY valid JSON: {"domain":"company.com","website":"https://company.com","description":"one sentence"} Use null for missing fields.',
              prompt: JSON.stringify({ startup, sector, results }),
            });

            return {
              results,
              domain: extraction.json.domain ?? null,
              website: extraction.json.website ?? null,
              description: extraction.json.description ?? null,
            };
          },
        );

        if (!companyDiscovery.domain) {
          throw new NonRetriableError(
            `Company domain not found for ${startup}`,
          );
        }

        await updateProgress({
          outreachAttemptId,
          startupLeadId,
          status: "FOUNDER_FOUND",
          fields: {
            domain: companyDiscovery.domain,
            searchCount: attempt.searchCount + 1,
          },
          output: {
            companyDiscovery,
          },
        });
      }

      attempt = await loadAttempt(outreachAttemptId);
      currentStatus = deriveResumeStatus(attempt);

      if (!hasReached(currentStatus, "EMAIL_FOUND")) {
        const hunterResult = await step.run("hunter-email-finder", async () => {
          if (!attempt.founder || !attempt.domain) {
            throw new NonRetriableError(
              `Founder and domain are required before Hunter lookup for ${startup}`,
            );
          }

          const { firstName, lastName } = splitPersonName(attempt.founder);
          return findHunterEmail(firstName, lastName, attempt.domain);
        });

        if (!hunterResult.email) {
          throw new NonRetriableError(
            `Hunter did not find an email for ${startup}`,
          );
        }

        await updateProgress({
          outreachAttemptId,
          startupLeadId,
          status: "EMAIL_FOUND",
          fields: {
            email: hunterResult.email,
          },
          output: {
            emailFinder: hunterResult,
          },
        });
      }

      attempt = await loadAttempt(outreachAttemptId);
      currentStatus = deriveResumeStatus(attempt);

      if (!hasReached(currentStatus, "EMAIL_VERIFIED")) {
        const verification = await step.run(
          "hunter-email-verifier",
          async () => {
            if (!attempt.email) {
              throw new NonRetriableError(
                `Email is required before Hunter verification for ${startup}`,
              );
            }

            return verifyHunterEmail(attempt.email);
          },
        );

        const verified =
          verification.status === "deliverable" ||
          verification.status === "valid";

        if (!verified) {
          throw new NonRetriableError(
            `Hunter verification rejected ${attempt.email} for ${startup}`,
          );
        }

        await updateProgress({
          outreachAttemptId,
          startupLeadId,
          status: "EMAIL_VERIFIED",
          fields: {
            verified,
          },
          output: {
            emailVerification: verification,
          },
        });
      }

      attempt = await loadAttempt(outreachAttemptId);
      currentStatus = deriveResumeStatus(attempt);

      if (!hasReached(currentStatus, "EMAIL_GENERATED")) {
        const draft = await step.run("deepseek-email-generation", async () => {
          const senderName = config.senderName || "Anurag";
          const senderContext =
            config.senderContext ||
            "I am building Orcha, a personal AI agent platform that automates workflows and tasks for founders and teams.";

          const extraction = await generateJson<{
            subject?: string | null;
            body?: string | null;
          }>({
            userId,
            credentialId: config.openaiCredentialId,
            model: "deepseek-ai/deepseek-v4-pro",
            system:
              'Write a concise, highly personalized founder outreach email. Return ONLY valid JSON: {"subject":"...","body":"..."} No placeholders.',
            prompt: JSON.stringify({
              senderName,
              senderContext,
              startup,
              funding,
              sector,
              founder: attempt.founder,
              company: getAttemptOutput(attempt.output).companyDiscovery,
            }),
          });

          return {
            subject:
              extraction.json.subject || `Congrats on the raise, ${startup}`,
            body:
              extraction.json.body ||
              extraction.text
                .replace(/^```(?:json)?/i, "")
                .replace(/```$/i, ""),
          };
        });

        await updateProgress({
          outreachAttemptId,
          startupLeadId,
          status: "EMAIL_GENERATED",
          output: {
            emailDraft: draft,
          },
        });
      }

      attempt = await loadAttempt(outreachAttemptId);
      currentStatus = deriveResumeStatus(attempt);

      if (!hasReached(currentStatus, "EMAIL_SENT")) {
        const sentEmail = await step.run("gmail-send", async () => {
          const output = getAttemptOutput(attempt.output);
          const draft = output.emailDraft;
          const gmailCredentialId = config.gmailCredentialId;

          if (!draft?.subject || !draft.body) {
            throw new NonRetriableError(
              `Email draft is required before Gmail send for ${startup}`,
            );
          }

          if (!gmailCredentialId) {
            throw new NonRetriableError(
              "gmailCredentialId is required in FOR_EACH_STARTUP pipeline config",
            );
          }

          const to =
            config.liveMode === false && config.testEmail
              ? config.testEmail
              : attempt.email;

          if (!to) {
            throw new NonRetriableError(
              `No recipient email available for ${startup}`,
            );
          }

          return sendGmail(userId, {
            credentialId: gmailCredentialId,
            to,
            subject: draft.subject,
            body: draft.body,
          });
        });

        await updateProgress({
          outreachAttemptId,
          startupLeadId,
          status: "EMAIL_SENT",
          fields: {
            completedAt: new Date(),
          },
          output: {
            sentEmail,
          },
        });
      }

      const finalAttempt = await loadAttempt(outreachAttemptId);
      const finalOutput = getAttemptOutput(finalAttempt.output);

      await step.run("mark-child-success", async () => {
        await prisma.execution.update({
          where: { id: childExecutionId },
          data: {
            status: ExecutionStatus.SUCCESS,
            completedAt: new Date(),
            output: toJson({
              outreachAttemptId,
              startupLeadId,
              status: "EMAIL_SENT",
              startup,
              email: finalAttempt.email,
              output: finalOutput,
            }),
          },
        });
      });

      return {
        outreachAttemptId,
        startupLeadId,
        status: "EMAIL_SENT",
      };
    } catch (error) {
      await failAttempt({
        outreachAttemptId,
        startupLeadId,
        executionId: childExecutionId,
        error,
      });

      throw error;
    }
  },
);

export { STARTUP_OUTREACH_EVENT };
