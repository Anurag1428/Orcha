// Quick test to see what error the agent route throws
require('dotenv').config();

async function test() {
  try {
    // Test 1: Check keys
    console.log("=== KEY CHECK ===");
    console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "SET (" + process.env.GEMINI_API_KEY.substring(0,10) + "...)" : "MISSING");
    console.log("TAVILY_API_KEY:", process.env.TAVILY_API_KEY ? "SET (" + process.env.TAVILY_API_KEY.substring(0,10) + "...)" : "MISSING");
    console.log("APOLLO_API_KEY:", process.env.APOLLO_API_KEY ? "SET (" + process.env.APOLLO_API_KEY.substring(0,10) + "...)" : "MISSING");
    console.log("MISTRAL_API_KEY:", process.env.MISTRAL_API_KEY ? "SET" : "MISSING");
    
    // Test 2: Try to import and call generateText with Gemini
    console.log("\n=== GEMINI MODEL TEST ===");
    const { generateText, tool, stepCountIs } = await import('ai');
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    const { z } = await import('zod');
    
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = google("gemini-2.0-flash");
    
    console.log("Model created OK. Calling generateText...");
    
    const result = await generateText({
      model,
      system: "You are a helpful assistant. Respond in one short sentence.",
      messages: [{ role: "user", content: "Say hello" }],
      stopWhen: stepCountIs(2),
      tools: {
        web_search: tool({
          description: "Search the web",
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            return [{ title: "test", content: "test result" }];
          },
        }),
      },
    });
    
    console.log("SUCCESS! Response:", result.text);
  } catch (err) {
    console.error("ERROR:", err.message);
    if (err.cause) console.error("CAUSE:", err.cause);
    if (err.stack) console.error("STACK:", err.stack.split('\n').slice(0,5).join('\n'));
  }
}

test();
