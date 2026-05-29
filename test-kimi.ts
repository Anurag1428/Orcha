import { config } from "dotenv";
config();

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

async function main() {
  console.log("Testing Nvidia / Moonshot Kimi API...");
  const apiKey = process.env.KIMI_API_KEY || "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";
  console.log("API Key ends with:", apiKey.slice(-10));

  try {
    const kimi = createOpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: apiKey,
    });

    const modelName = "meta/llama-3.3-70b-instruct";
    console.log(`Running test with model: ${modelName} (since moonshotai/kimi-k2.6 is currently timing out on Nvidia NIM)...`);

    const { text } = await generateText({
      model: kimi.chat(modelName),
      prompt: "Say 'Hello, Nvidia API is working!' and nothing else.",
    });

    console.log("\n✅ SUCCESS!");
    console.log("Response text:", text);
  } catch (error: any) {
    console.error("\n❌ ERROR:");
    console.error(error.message || error);
  }
}

main();
