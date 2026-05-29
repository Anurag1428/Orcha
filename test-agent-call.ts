import { config } from "dotenv";
config();

import Anthropic from "@anthropic-ai/sdk";

async function main() {
  console.log("Testing Agent chat call...");
  console.log("AI_BASE_URL:", process.env.AI_BASE_URL);
  console.log("AI_MODEL:", process.env.AI_MODEL);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.AI_BASE_URL,
  });

  try {
    const response = await client.messages.create({
      model: process.env.AI_MODEL ?? "claude-haiku-4-5",
      max_tokens: 4096,
      messages: [
        { role: "user", content: "Say hello!" }
      ],
    });
    console.log("Success! Response:", response.content);
  } catch (error: any) {
    console.error("Error making agent call:");
    console.error(error);
  }
}

main();
