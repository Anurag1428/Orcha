import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
})

async function main() {
  console.log("Starting DeepSeek test...");
  const start = Date.now();
  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-ai/deepseek-v4-pro", 
      messages: [{"role":"user","content":"Hello"}],
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      chat_template_kwargs: {"thinking":false},
      stream: false
    })
   
    process.stdout.write(completion.choices[0]?.message?.content || '');
    console.log("\nTime:", (Date.now() - start) / 1000, "seconds");
  } catch (err) {
    console.error("\nError:", err.message);
  }
}

main();
