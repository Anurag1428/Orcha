import cronParser from "cron-parser";
import { NodeType, type Prisma } from "@/generated/prisma";
import prisma from "@/lib/db";

const TYPE_MAP: Record<string, NodeType> = {
  ANTHROPIC: NodeType.ANTHROPIC,
  OPENAI: NodeType.OPENAI,
  GEMINI: NodeType.GEMINI,
  SLACK: NodeType.SLACK,
  DISCORD: NodeType.DISCORD,
  HTTP_REQUEST: NodeType.HTTP_REQUEST,
  GMAIL: NodeType.GMAIL,
  FOR_EACH_STARTUP: NodeType.FOR_EACH_STARTUP,
};

export async function createWorkflowFromAgent(params: {
  userId: string;
  name: string;
  trigger: { type: string; cron?: string; formId?: string };
  steps: Array<{
    id: string;
    type: string;
    dependsOn?: string[];
    config: Record<string, unknown>;
  }>;
  runNow?: boolean;
}) {
  const { userId, name, trigger, steps, runNow = false } = params;

  // Step A: Create the Workflow record
  const workflow = await prisma.workflow.create({
    data: { name, userId },
  });

  // Step B: Create trigger node
  const triggerNodeId = `trigger_${workflow.id}`;
  await prisma.node.create({
    data: {
      id: triggerNodeId,
      workflowId: workflow.id,
      name: trigger.type,
      type: NodeType.MANUAL_TRIGGER,
      position: { x: 0, y: 0 },
      data: {
        cron: trigger.cron ?? null,
        formId: trigger.formId ?? null,
      },
    },
  });

  // Step C: Create all step nodes and map Claude's IDs to real DB IDs
  const nodeIdMap: Record<string, string> = {};
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const dbNodeId = `node_${workflow.id}_${i}`;
    nodeIdMap[step.id] = dbNodeId;

    await prisma.node.create({
      data: {
        id: dbNodeId,
        workflowId: workflow.id,
        name: step.type,
        type: TYPE_MAP[step.type] ?? NodeType.HTTP_REQUEST,
        position: { x: (i + 1) * 280, y: 0 },
        data: step.config as Prisma.InputJsonValue,
      },
    });
  }

  // Step D: Create connections between nodes
  const rootSteps = steps.filter(
    (s) => !s.dependsOn || s.dependsOn.length === 0,
  );
  for (const rootStep of rootSteps) {
    await prisma.connection.create({
      data: {
        workflowId: workflow.id,
        fromNodeId: triggerNodeId,
        toNodeId: nodeIdMap[rootStep.id],
        fromOutput: "main",
        toInput: "main",
      },
    });
  }

  for (const step of steps) {
    if (!step.dependsOn?.length) continue;
    for (const depId of step.dependsOn) {
      await prisma.connection.create({
        data: {
          workflowId: workflow.id,
          fromNodeId: nodeIdMap[depId],
          toNodeId: nodeIdMap[step.id],
          fromOutput: "main",
          toInput: "main",
        },
      });
    }
  }

  // Step F: Register cron if scheduled
  if (trigger.type === "SCHEDULE" && trigger.cron) {
    const interval = cronParser.parse(trigger.cron);
    const nextRunAt = interval.next().toDate();

    await prisma.scheduledWorkflow.create({
      data: {
        workflowId: workflow.id,
        cronExpression: trigger.cron,
        nextRunAt,
      },
    });
  }

  return {
    workflowId: workflow.id,
    workflowName: name,
    nodeCount: steps.length + 1,
    status: runNow ? "executing" : "saved",
  };
}
