import Handlebars from "handlebars";
import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { anthropicChannel } from "@/inngest/channels/anthropic";
import OpenAI from "openai";

type AnthropicData = {
  variableName?: string;
  prompt?: string;
};

export const anthropicExecutor: NodeExecutor<AnthropicData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    anthropicChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const result = await step.run("anthropic-generation", async () => {
      if (!data.prompt) {
        throw new NonRetriableError("Anthropic node: No prompt configured");
      }

      if (!data.variableName) {
        throw new NonRetriableError("Anthropic node: Variable name not configured");
      }

      const prompt = Handlebars.compile(data.prompt)(context);

      const openai = new OpenAI({
        apiKey: process.env.NVIDIA_API_KEY,
        baseURL: "https://integrate.api.nvidia.com/v1",
      });

      const completion = await openai.chat.completions.create({
        model: "moonshotai/kimi-k2-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 4096,
      });

      const responseText = completion.choices[0]?.message?.content || "";

      return {
        ...context,
        [data.variableName]: responseText,
      };
    });

    await publish(
      anthropicChannel().status({
        nodeId,
        status: "success",
      }),
    );

    return result;
  } catch (error) {
    await publish(
      anthropicChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
