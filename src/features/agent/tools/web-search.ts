import { tavily } from "@tavily/core";

export async function webSearch(query: string, days?: number, domains?: string[]) {
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  const result = await client.search(query, {
    maxResults: 5,
    searchDepth: "advanced",
    ...(days ? { days, topic: "news" } : {}),
    ...(domains && domains.length > 0 ? { includeDomains: domains } : {}),
  });
  
  return result.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
  }));
}
