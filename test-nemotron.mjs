import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
})

async function main() {
  console.log("Starting Nemotron test...");
  const start = Date.now();
  
  try {
    const completion = await openai.chat.completions.create({
      model: "nvidia/nemotron-3-super-120b-a12b",
      messages: [{"role":"user","content":"Hello"}],
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      // reasoning_budget: 16384,
      // chat_template_kwargs: {"enable_thinking":true},
      stream: true
    })
    
    for await (const chunk of completion) {
      // const reasoning = chunk.choices[0]?.delta?.reasoning_content;
      // if (reasoning) process.stdout.write(reasoning);
      process.stdout.write(chunk.choices[0]?.delta?.content || '')
    }
    console.log("\nTime:", (Date.now() - start) / 1000, "seconds");
  } catch (err) {
    console.error("\nError:", err.message);
    console.log("Time:", (Date.now() - start) / 1000, "seconds");
  }
}

main();
