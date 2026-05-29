import { config } from "dotenv";
config();

import { generateText, tool, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

async function main() {
  console.log("Testing Google Gemini API WITH tools...");
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

  try {
    const google = createGoogleGenerativeAI({
      apiKey,
    });

    const model = google("gemini-2.5-flash");
    
    const result = await generateText({
      model,
      prompt: "Call the hello tool with greeting 'Bonjour'",
      stopWhen: stepCountIs(5),
      tools: {
        hello: tool({
          description: "Say hello",
          inputSchema: z.object({
            greeting: z.string(),
          }),
          execute: async ({ greeting }) => {
            console.log("TOOL EXECUTED:", greeting);
            return `Tool output: ${greeting}`;
          },
        }),
      },
    });

    console.log("\n✅ SUCCESS!");
    console.log("Response text:", result.text);
  } catch (error: any) {
    console.error("\n❌ ERROR:");
    console.error(error);
  }
}

main();
