import { config } from "dotenv";
config();

import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

async function main() {
  console.log("Testing Google Gemini API...");
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  console.log("API Key exists:", !!apiKey);

  try {
    const google = createGoogleGenerativeAI({
      apiKey,
    });

    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: "Say 'Hello, Gemini is working!' and nothing else.",
    });

    console.log("\n✅ SUCCESS!");
    console.log("Response text:", text);
  } catch (error: any) {
    console.error("\n❌ ERROR:");
    console.error(error);
  }
}

main();
