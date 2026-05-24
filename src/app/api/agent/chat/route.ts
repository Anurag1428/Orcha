import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/db";
import { webSearch } from "@/features/agent/tools/web-search";
import { sendGmail } from "@/features/agent/tools/gmail";
import { rememberFact, getProfile, getCredentials } from "@/features/agent/tools/memory";
import { createWorkflowFromAgent } from "@/features/agent/tools/create-workflow";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent-prompt";
import { AGENT_TOOLS } from "@/lib/agent-tools";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_BASE_URL,
});

export async function POST(req: NextRequest) {
  // 1. Auth check
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;
  const { message, sessionId } = await req.json();

  // 2. Load user profile
  const profile = await prisma.userProfile.findUnique({ where: { userId } });

  // 3. Load last 10 messages for conversation context
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (sessionId) {
    const msgs = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { role: true, content: true },
    });
    history = msgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }

  // 4. Build system prompt with user's profile
  const systemPrompt = AGENT_SYSTEM_PROMPT
    .replace("{{USER_NAME}}", session.user.name ?? "there")
    .replace("{{USER_PROFILE}}", JSON.stringify(profile?.context ?? {}));

  // 5. Build messages array
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: message },
  ];

  // 6. First call to Claude
  let response = await client.messages.create({
    model: process.env.AI_MODEL ?? "claude-haiku-4-5",
    max_tokens: 4096,
    system: systemPrompt,
    tools: AGENT_TOOLS,
    messages,
  });

  // 7. Agentic loop
  const allMessages: Anthropic.MessageParam[] = [...messages];
  
  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      let result: unknown;

      switch (toolUse.name) {
        case "web_search":
          result = await webSearch((toolUse.input as { query: string }).query);
          break;
        case "send_email":
          result = await sendGmail(userId, toolUse.input as any);
          break;
        case "remember":
          result = await rememberFact(
            userId,
            (toolUse.input as any).key,
            (toolUse.input as any).value
          );
          break;
        case "get_profile":
          result = await getProfile(userId);
          break;
        case "get_credentials":
          result = await getCredentials(userId, (toolUse.input as any).type);
          break;
        case "create_workflow":
          result = await createWorkflowFromAgent({
            userId,
            ...(toolUse.input as any),
          });
          break;
        default:
          result = { error: `Unknown tool: ${toolUse.name}` };
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    allMessages.push({ role: "assistant", content: response.content });
    allMessages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: process.env.AI_MODEL ?? "claude-haiku-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages: allMessages,
    });
  }

  // 8. Extract final text reply
  const finalText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // 9. Save session + messages to DB
  let activeSessionId = sessionId;
  if (!activeSessionId) {
    const newSession = await prisma.chatSession.create({
      data: {
        userId,
        title: message.slice(0, 60),
      },
    });
    activeSessionId = newSession.id;
  }

  await prisma.chatMessage.createMany({
    data: [
      { sessionId: activeSessionId, role: "user", content: message },
      { sessionId: activeSessionId, role: "assistant", content: finalText },
    ],
  });

  // 10. Mark onboarding done if profile is filled
  if (profile && !profile.onboardingDone) {
    const ctx = profile.context as Record<string, string>;
    if (ctx.name && ctx.email) {
      await prisma.userProfile.update({
        where: { userId },
        data: { onboardingDone: true },
      });
    }
  }

  return Response.json({
    reply: finalText,
    sessionId: activeSessionId,
  });
}
