import axios from "axios";
import { config } from "dotenv";
config();

const kimiApiKey = process.env.KIMI_API_KEY || "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";

async function testKimi() {
  console.log("Testing raw Kimi request...");
  
  const payloadWithoutTools = {
    model: "moonshotai/kimi-k2.6",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" }
    ],
    max_tokens: 100,
  };

  try {
    const res = await axios.post("https://integrate.api.nvidia.com/v1/chat/completions", payloadWithoutTools, {
      headers: {
        "Authorization": `Bearer ${kimiApiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 10000 // 10 second timeout
    });
    console.log("Raw Response SUCCESS:", res.data.choices[0].message.content);
  } catch (err) {
    console.error("Raw Response FAILED:", err.response ? err.response.data : err.message);
  }
}

testKimi();
