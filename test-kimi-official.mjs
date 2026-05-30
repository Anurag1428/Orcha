import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: "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",
});

async function run() {
  console.log("Starting official OpenAI SDK test...");
  const start = Date.now();
  
  try {
    const response = await client.chat.completions.create({
      model: "moonshotai/kimi-k2.6",
      messages: [{ role: "user", content: "Hello" }],
    });
    
    console.log("Time:", (Date.now() - start) / 1000, "seconds");
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.log("Time:", (Date.now() - start) / 1000, "seconds");
    console.error("Error:", error.message);
  }
}

run();
