import { config } from "dotenv";
config();

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const nvidiaApiKey = "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";

const nemotron = createOpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: nvidiaApiKey,
});

async function runTest() {
  console.log("Testing SDK with .chat()...");
  
  try {
    const { text } = await generateText({
      model: nemotron.chat("nvidia/nemotron-3-super-120b-a12b"),
      prompt: "Hello",
    });

    console.log("Response:", text);
    
  } catch (error: any) {
    console.error("Test failed:", error);
  }
}

runTest();
