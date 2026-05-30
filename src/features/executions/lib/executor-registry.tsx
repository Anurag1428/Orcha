import { googleFormTriggerExecutor } from "@/features/triggers/components/google-form-trigger/executor";
import { manualTriggerExecutor } from "@/features/triggers/components/manual-trigger/executor";
import { NodeType } from "@/generated/prisma";
import { anthropicExecutor } from "../components/anthropic/executor";
import { discordExecutor } from "../components/discord/executor";
import { forEachStartupExecutor } from "../components/for-each-startup/executor";
import { geminiExecutor } from "../components/gemini/executor";
import { gmailExecutor } from "../components/gmail/executor";
import { httpRequestExecutor } from "../components/http-request/executor";
import { openAiExecutor } from "../components/openai/executor";
import { slackExecutor } from "../components/slack/executor";
import type { NodeExecutor } from "../types";

export const executorRegistry: Record<NodeType, NodeExecutor> = {
  [NodeType.INITIAL]: manualTriggerExecutor,
  [NodeType.MANUAL_TRIGGER]: manualTriggerExecutor,
  [NodeType.HTTP_REQUEST]: httpRequestExecutor,
  [NodeType.GOOGLE_FORM_TRIGGER]: googleFormTriggerExecutor,
  [NodeType.GEMINI]: geminiExecutor,
  [NodeType.ANTHROPIC]: anthropicExecutor,
  [NodeType.OPENAI]: openAiExecutor,
  [NodeType.DISCORD]: discordExecutor,
  [NodeType.SLACK]: slackExecutor,
  [NodeType.GMAIL]: gmailExecutor,
  [NodeType.FOR_EACH_STARTUP]: forEachStartupExecutor,
};

export const getExecutor = (type: NodeType): NodeExecutor => {
  const executor = executorRegistry[type];
  if (!executor) {
    throw new Error(`No executor found for node type: ${type}`);
  }

  return executor;
};
