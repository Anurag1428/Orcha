import { config } from "dotenv";

// Load environment variables
config();

async function testDeepSeek() {
  console.log("Testing DeepSeek API...");
  console.log("API Key:", process.env.ANTHROPIC_API_KEY?.substring(0, 10) + "...");
  console.log("Base URL:", "https://api.deepseek.com/v1");
  
  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: "Say 'Hello! DeepSeek API is working!' and nothing else.",
          },
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    console.log("\n✅ SUCCESS!");
    console.log("Response:", data.choices[0].message.content);
    console.log("\nFull response:", JSON.stringify(data, null, 2));
  } catch (error: any) {
    console.error("\n❌ ERROR!");
    console.error("Error message:", error.message);
  }
}

testDeepSeek();
