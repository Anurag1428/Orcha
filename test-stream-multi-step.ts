import { config } from "dotenv";
config();
import { streamText, tool, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

const nvidiaApiKey = process.env.NVIDIA_API_KEY || "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";
const nemotron = createOpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: nvidiaApiKey,
});

async function main() {
  const result = streamText({
    model: nemotron.chat("nvidia/nemotron-3-super-120b-a12b"),
    prompt: "What is the weather in Paris?",
    stopWhen: stepCountIs(5),
    tools: {
      getWeather: tool({
        description: "Get the weather for a location",
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }) => {
          console.log(`\n>>> Tool getWeather executed for ${location}! <<<\n`);
          return `The weather in ${location} is sunny and 75F.`;
        }
      })
    },
    onStepFinish: (step) => {
      console.log(`\n[Step Finish]`);
      console.log(`Finish Reason: ${step.finishReason}`);
      console.log(`Tool Calls: ${step.toolCalls.map(t => t.toolName).join(", ")}`);
    },
    onFinish: ({ text, steps }) => {
      console.log("\n[Final Output]:", text);
      console.log("Total steps taken:", steps?.length);
    }
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}
main();
