import { config } from "dotenv";
config();

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

const getModel = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.AI_BASE_URL;
  const modelName = process.env.AI_MODEL;

  if (baseURL?.includes("deepseek")) {
    console.log("Using OpenAI provider (DeepSeek) with chat completions...");
    const deepseek = createOpenAI({
      apiKey,
      baseURL: baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1`,
    });
    return deepseek.chat(modelName ?? "deepseek-chat");
  } else {
    console.log("Using Anthropic provider...");
    const anthropic = createAnthropic({
      apiKey,
      baseURL,
    });
    return anthropic(modelName ?? "claude-3-5-sonnet-latest");
  }
};

async function main() {
  console.log("Testing Agent call with fixed AI SDK integration...");
  
  try {
    const { text, steps } = await generateText({
      model: getModel(),
      system: "You are a helpful assistant.",
      messages: [
        { role: "user", content: "Say 'Hello, dynamic model call is successful!' and nothing else." }
      ],
    });
    
    console.log("\n✅ SUCCESS!");
    console.log("Response text:", text);
    console.log("Full steps:", JSON.stringify(steps, null, 2));
  } catch (error: any) {
    console.error("\n❌ ERROR occurred during execution:");
    console.error(error);
  }
}

main();
