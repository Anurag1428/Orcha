import { createId } from "@paralleldrive/cuid2";
import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import {
  mergeStartupLeads,
  type StartupLead,
} from "@/features/agent/funding-workflow";
import type { NodeExecutor } from "@/features/executions/types";
import { ExecutionStatus, type Prisma } from "@/generated/prisma";
import { forEachStartupChannel } from "@/inngest/channels/for-each-startup";
import { STARTUP_OUTREACH_EVENT } from "@/inngest/startup-outreach";
import prisma from "@/lib/db";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(context, null, 2);
  return new Handlebars.SafeString(jsonString);
});

type ForEachStartupData = {
  variableName?: string;
  startupsPath?: string;
  startupsJson?: string;
  sourceUrl?: string;
  postText?: string;
  imageUrl?: string;
  openaiCredentialId?: string;
  gmailCredentialId?: string;
  senderName?: string;
  senderContext?: string;
  testEmail?: string;
  liveMode?: boolean;
};

type PersistedStartupExecution = {
  startup: string;
  startupLeadId: string;
  outreachAttemptId: string;
  childExecutionId: string;
  childInngestEventId: string;
  status: string;
};

function startupKey(startup: string) {
  return startup.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getPathValue(source: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJsonCandidate(text: string) {
  const clean = stripCodeFence(text);
  if (clean.startsWith("[") || clean.startsWith("{")) return clean;

  const arrayStart = clean.indexOf("[");
  const arrayEnd = clean.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return clean.slice(arrayStart, arrayEnd + 1);
  }

  const objectStart = clean.indexOf("{");
  const objectEnd = clean.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return clean.slice(objectStart, objectEnd + 1);
  }

  return clean;
}

function parseStartupSource(value: unknown): StartupLead[] {
  if (Array.isArray(value)) return normalizeStartupRows(value);

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (Array.isArray(objectValue.startups)) {
      return normalizeStartupRows(objectValue.startups);
    }
    if (typeof objectValue.text === "string") {
      return parseStartupSource(objectValue.text);
    }
  }

  if (typeof value === "string") {
    const parsed = JSON.parse(extractJsonCandidate(value));
    return parseStartupSource(parsed);
  }

  return [];
}

function normalizeStartupRows(rows: unknown[]): StartupLead[] {
  return rows
    .filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object",
    )
    .map((row): StartupLead | null => {
      const startup = String(
        row.startup ?? row.startupName ?? row.company ?? row.companyName ?? "",
      ).trim();

      if (!startup) return null;

      return {
        startup,
        funding:
          row.funding || row.fundingAmount || row.amount
            ? String(row.funding ?? row.fundingAmount ?? row.amount)
            : null,
        sector:
          row.sector || row.industry || row.category
            ? String(row.sector ?? row.industry ?? row.category)
            : null,
        rank:
          typeof row.rank === "number"
            ? row.rank
            : Number.isFinite(Number(row.rank))
              ? Number(row.rank)
              : null,
        source: row.source
          ? (String(row.source) as StartupLead["source"])
          : "merged",
      };
    })
    .filter((row): row is StartupLead => Boolean(row));
}

function compileTemplate(
  value: string | undefined,
  context: Record<string, unknown>,
) {
  if (!value) return null;
  const compiled = Handlebars.compile(value)(context).trim();
  return compiled.length > 0 ? compiled : null;
}

function resolveStartupArray(
  data: ForEachStartupData,
  context: Record<string, unknown>,
) {
  if (data.startupsJson) {
    return parseStartupSource(Handlebars.compile(data.startupsJson)(context));
  }

  const path = data.startupsPath || "startups";
  return parseStartupSource(getPathValue(context, path));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export const forEachStartupExecutor: NodeExecutor<ForEachStartupData> = async ({
  data,
  nodeId,
  workflowId,
  parentExecutionId,
  parentInngestEventId,
  context,
  step,
  publish,
}) => {
  await publish(
    forEachStartupChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  if (!workflowId || !parentExecutionId || !parentInngestEventId) {
    await publish(
      forEachStartupChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw new NonRetriableError(
      "FOR_EACH_STARTUP node: workflow execution metadata is missing",
    );
  }

  const variableName = data.variableName || "startupFanout";

  try {
    const resolvedStartups = resolveStartupArray(data, context);
    const startups = mergeStartupLeads(resolvedStartups);

    if (startups.length === 0) {
      throw new NonRetriableError(
        "FOR_EACH_STARTUP node: No startups found. Configure startupsPath or startupsJson to point to a StartupLead[]",
      );
    }

    const fundingPost = await step.run("for-each-startup-create-post", () => {
      return prisma.fundingPost.create({
        data: {
          workflowId,
          parentExecutionId,
          sourceUrl: compileTemplate(data.sourceUrl, context),
          postText: compileTemplate(data.postText, context),
          imageUrl: compileTemplate(data.imageUrl, context),
          rawInput: toJson({
            startups,
            sourcePath: data.startupsPath || null,
          }),
        },
      });
    });

    const childExecutions: PersistedStartupExecution[] = [];
    const pipelineConfig = {
      openaiCredentialId: data.openaiCredentialId || null,
      gmailCredentialId: data.gmailCredentialId || null,
      senderName: data.senderName || null,
      senderContext: data.senderContext || null,
      testEmail: data.testEmail || null,
      liveMode: data.liveMode ?? null,
    };

    for (let index = 0; index < startups.length; index++) {
      const startup = startups[index];
      const key = startupKey(startup.startup);
      const stepKey = `${index + 1}-${key || "startup"}`;

      const child = await step.run(
        `for-each-startup-child-${stepKey}`,
        async () => {
          return prisma.$transaction(async (tx) => {
            const startupLead = await tx.startupLead.upsert({
              where: {
                fundingPostId_startupKey: {
                  fundingPostId: fundingPost.id,
                  startupKey: key,
                },
              },
              update: {
                startup: startup.startup,
                funding: startup.funding ?? null,
                sector: startup.sector ?? null,
                rank: startup.rank ?? null,
                source: startup.source ?? "merged",
                status: "CREATED",
                state: toJson({
                  ...startup,
                  status: "CREATED",
                  searchCount: 0,
                }),
                raw: toJson(startup),
              },
              create: {
                fundingPostId: fundingPost.id,
                startup: startup.startup,
                startupKey: key,
                funding: startup.funding ?? null,
                sector: startup.sector ?? null,
                rank: startup.rank ?? null,
                source: startup.source ?? "merged",
                status: "CREATED",
                state: toJson({
                  ...startup,
                  status: "CREATED",
                  searchCount: 0,
                }),
                raw: toJson(startup),
              },
            });

            const childInngestEventId = [
              "fanout",
              parentInngestEventId,
              nodeId,
              key || createId(),
            ].join(":");

            const childExecution = await tx.execution.upsert({
              where: {
                inngestEventId: childInngestEventId,
              },
              update: {
                startupLeadId: startupLead.id,
                status: ExecutionStatus.RUNNING,
                completedAt: null,
                error: null,
                errorStack: null,
                output: toJson({
                  fundingPostId: fundingPost.id,
                  startupLeadId: startupLead.id,
                  startup,
                }),
              },
              create: {
                workflowId,
                parentExecutionId,
                startupLeadId: startupLead.id,
                inngestEventId: childInngestEventId,
                status: ExecutionStatus.RUNNING,
                output: toJson({
                  fundingPostId: fundingPost.id,
                  startupLeadId: startupLead.id,
                  startup,
                }),
              },
            });

            const outreachAttempt = await tx.outreachAttempt.upsert({
              where: {
                executionId: childExecution.id,
              },
              update: {
                fundingPostId: fundingPost.id,
                startupLeadId: startupLead.id,
              },
              create: {
                fundingPostId: fundingPost.id,
                startupLeadId: startupLead.id,
                executionId: childExecution.id,
                status: "CREATED",
                output: toJson({
                  startup,
                  pipelineConfig,
                  childExecutionId: childExecution.id,
                }),
              },
            });

            return {
              startup: startup.startup,
              startupLeadId: startupLead.id,
              outreachAttemptId: outreachAttempt.id,
              childExecutionId: childExecution.id,
              childInngestEventId,
              status: outreachAttempt.status,
            };
          });
        },
      );

      childExecutions.push(child);

      await step.sendEvent(`for-each-startup-dispatch-${stepKey}`, {
        id: child.childInngestEventId,
        name: STARTUP_OUTREACH_EVENT,
        data: {
          fundingPostId: fundingPost.id,
          startupLeadId: child.startupLeadId,
          outreachAttemptId: child.outreachAttemptId,
          childExecutionId: child.childExecutionId,
        },
      });

      await publish(
        forEachStartupChannel().status({
          nodeId,
          status: "loading",
          processed: index + 1,
          total: startups.length,
        }),
      );
    }

    await publish(
      forEachStartupChannel().status({
        nodeId,
        status: "success",
        processed: startups.length,
        total: startups.length,
      }),
    );

    return {
      ...context,
      [variableName]: {
        fundingPostId: fundingPost.id,
        total: startups.length,
        startups,
        childExecutions,
      },
    };
  } catch (error) {
    await publish(
      forEachStartupChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
