import { tavily } from "@tavily/core";

export async function webSearch(query: string) {
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  const result = await client.search(query, {
    maxResults: 5,
    searchDepth: "basic",
  });
  
  return result.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content.slice(0, 600),
  }));
}
