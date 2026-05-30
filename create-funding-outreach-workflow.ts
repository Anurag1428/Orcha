/**
 * FUNDING OUTREACH WORKFLOW (Hunter + DeepSeek)
 * -------------------------
 * Daily automation that:
 * 1. Searches Inc42 + YourStory + TechCrunch for Indian startup funding news
 * 2. Extracts a canonical StartupLead[] via DeepSeek V4 Flash
 * 3. Fans out into one persisted child execution per startup
 * 4. Leaves founder/Hunter/Gmail processing to the next startup-child worker
 *
 * HOW TO RUN:
 * 1. Fill in the CONFIG section below
 * 2. Run: npx tsx create-funding-outreach-workflow.ts
 */

import { config } from "dotenv";

config();

import { NodeType, PrismaClient } from "./src/generated/prisma";

const prisma = new PrismaClient();

const CONFIG = {
  USER_ID: "Bbaay0kt2xbJT1e3mvimXMLnu8BQ4J41",
  OPENAI_CREDENTIAL_ID: "cmpsfoykv0001t5gct63hcwns",
  GMAIL_CREDENTIAL_ID: "cmpp51l090001t54c2rbxm3mk",
  TAVILY_API_KEY: "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",
  HUNTER_API_KEY: "30f4852cbb4fbb01e80f205bb8020291df48d91c",
  YOUR_NAME: "Anurag",
  YOUR_INTRO:
    "I'm building Orcha, a personal AI agent platform that automates workflows and tasks for founders and teams.",
  TEST_EMAIL: "anurag789p@gmail.com",
  LIVE_MODE: false,
};

async function main() {
  console.log("🚀 Creating Funding Outreach Workflow (DeepSeek + Hunter)...\n");

  const workflow = await prisma.workflow.create({
    data: {
      name: "Daily Funding Outreach",
      userId: CONFIG.USER_ID,
    },
  });
  console.log("✅ Workflow created:", workflow.id);

  // NODE 1: Trigger (INITIAL)
  const triggerNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Daily Trigger",
      type: NodeType.INITIAL,
      position: { x: 100, y: 300 },
      data: { variableName: "trigger" },
    },
  });

  // NODE 2: Search funding news via Tavily
  const searchNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Search Funding News",
      type: NodeType.HTTP_REQUEST,
      position: { x: 400, y: 300 },
      data: {
        variableName: "funding_news",
        endpoint: "https://api.tavily.com/search",
        method: "POST",
        body: JSON.stringify({
          api_key: CONFIG.TAVILY_API_KEY,
          query:
            "India startup funding raised today 2025 site:inc42.com OR site:yourstory.com OR site:techcrunch.com",
          max_results: 5,
          include_answer: false,
          include_raw_content: false,
        }),
      },
    },
  });

  // NODE 3: Extract canonical StartupLead[] (Flash)
  const extractDetailsNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Extract Startup Array",
      type: NodeType.OPENAI,
      position: { x: 700, y: 300 },
      credentialId: CONFIG.OPENAI_CREDENTIAL_ID,
      data: {
        variableName: "startup_extraction",
        model: "deepseek-ai/deepseek-v4-flash",
        baseURL: "https://integrate.api.nvidia.com/v1",
        systemPrompt:
          'You are an extraction AI. Extract EVERY funded startup from the input. Output EXACTLY a valid JSON array. Shape: [{"startup":"Company","funding":"$1M Seed","sector":"Fintech","rank":1}]. DO NOT output markdown or other text.',
        userPrompt:
          "Extract all funded startups from these results:\n{{json funding_news.httpResponse.data.results}}",
      },
    },
  });

  // NODE 4: Fan out into one child execution per startup
  const fanoutNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "For Each Startup",
      type: NodeType.FOR_EACH_STARTUP,
      position: { x: 1000, y: 300 },
      data: {
        variableName: "startup_fanout",
        startupsPath: "startup_extraction.text",
        postText: "{{json funding_news.httpResponse.data.results}}",
        openaiCredentialId: CONFIG.OPENAI_CREDENTIAL_ID,
        gmailCredentialId: CONFIG.GMAIL_CREDENTIAL_ID,
        senderName: CONFIG.YOUR_NAME,
        senderContext: CONFIG.YOUR_INTRO,
        testEmail: CONFIG.TEST_EMAIL,
        liveMode: CONFIG.LIVE_MODE,
      },
    },
  });

  console.log("✅ All 4 nodes created");

  await prisma.connection.createMany({
    data: [
      {
        workflowId: workflow.id,
        fromNodeId: triggerNode.id,
        toNodeId: searchNode.id,
      },
      {
        workflowId: workflow.id,
        fromNodeId: searchNode.id,
        toNodeId: extractDetailsNode.id,
      },
      {
        workflowId: workflow.id,
        fromNodeId: extractDetailsNode.id,
        toNodeId: fanoutNode.id,
      },
    ],
  });

  console.log("✅ Connections wired");

  await prisma.scheduledWorkflow.create({
    data: {
      workflowId: workflow.id,
      cronExpression: "30 3 * * *",
      nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  console.log(`
✅ WORKFLOW READY
   ID: ${workflow.id}

PIPELINE FLOW:
  [Trigger] → [Tavily Search] → [Flash Startup Array] → [For Each Startup]
  `);

  console.log("[Workflow Completed]");
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
