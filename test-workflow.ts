import { config } from "dotenv";
config();

import { generateText, tool, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

const kimiApiKey = process.env.KIMI_API_KEY || "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";

// Global metrics
let networkCallCount = 0;
let totalKimiApiTime = 0;
let retryCount = 0;

const kimi = createOpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: kimiApiKey,
  compatibility: "compatible",
  fetch: async (url, options) => {
    networkCallCount++;
    const fixedUrl = url.toString().replace('/responses', '/chat/completions');
    console.log(`[Network Call #${networkCallCount}] -> POST ${fixedUrl}`);
    
    const startTime = performance.now();
    try {
      const res = await fetch(fixedUrl, options);
      const duration = performance.now() - startTime;
      totalKimiApiTime += duration;
      
      console.log(`[Network Call #${networkCallCount}] <- Status: ${res.status} ${res.statusText} | Time: ${duration.toFixed(0)}ms`);
      
      if (res.status === 429 || res.status >= 500) {
        retryCount++;
      }
      return res;
    } catch (err: any) {
      const duration = performance.now() - startTime;
      totalKimiApiTime += duration;
      console.error(`[Network Call #${networkCallCount}] <- ERROR: ${err.message} | Time: ${duration.toFixed(0)}ms`);
      throw err;
    }
  }
});

async function runTest() {
  console.log("=========================================");
  console.log("STARTING TELEMETRY TEST - PROMPT: 'Hello'");
  console.log("=========================================\n");
  
  const totalStartTime = performance.now();

  try {
    const { text, steps } = await generateText({
      model: kimi("moonshotai/kimi-k2.6"),
      prompt: "Hello",
      stopWhen: stepCountIs(10),
      onStepFinish: (step) => {
        console.log(`\n--- Step Finished ---`);
        console.log(`Finish Reason: ${step.finishReason}`);
        console.log(`Tools Called: ${step.toolCalls?.length || 0}`);
        console.log(`Tool Results: ${step.toolResults?.length || 0}`);
      }
    });

    const totalDuration = performance.now() - totalStartTime;

    console.log("\n=========================================");
    console.log("TELEMETRY TIMING REPORT");
    console.log("=========================================");
    console.log(`Total request time     : ${totalDuration.toFixed(0)}ms`);
    console.log(`Time spent in Kimi API : ${totalKimiApiTime.toFixed(0)}ms`);
    console.log(`Number of LLM calls    : ${networkCallCount}`);
    console.log(`Number of tool calls   : ${steps?.reduce((acc, step) => acc + step.toolCalls.length, 0) || 0}`);
    console.log(`Total Steps taken      : ${steps?.length || 1}`);
    console.log(`Retry count (HTTP >400): ${retryCount}`);
    console.log("=========================================\n");
    
    console.log("[Agent Response]:", text);
    
  } catch (error: any) {
    const totalDuration = performance.now() - totalStartTime;
    console.log("\n=========================================");
    console.log("TELEMETRY TIMING REPORT (FAILED)");
    console.log("=========================================");
    console.log(`Total request time     : ${totalDuration.toFixed(0)}ms`);
    console.log(`Time spent in Kimi API : ${totalKimiApiTime.toFixed(0)}ms`);
    console.log(`Number of LLM calls    : ${networkCallCount}`);
    console.log(`Retry count (HTTP >400): ${retryCount}`);
    console.log(`Fatal Error            : ${error.message}`);
    console.log("=========================================\n");
  }
}

runTest();
