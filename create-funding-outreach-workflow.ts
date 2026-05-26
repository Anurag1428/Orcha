/**
 * FUNDING OUTREACH WORKFLOW
 * -------------------------
 * Daily automation that:
 * 1. Searches Inc42 + YourStory + TechCrunch for Indian startup funding news
 * 2. Extracts top founder's details
 * 3. Finds their email via Apollo
 * 4. Writes a personalized congratulatory email using Claude
 * 5. Sends it via Gmail
 *
 * HOW TO RUN:
 * 1. Fill in the CONFIG section below
 * 2. Run: npx tsx create-funding-outreach-workflow.ts
 *
 * PREREQUISITES:
 * - Gmail connected via /credentials (OAuth flow)
 * - Anthropic credential added via /credentials
 * - Tavily API key (get free at tavily.com)
 * - Apollo API key (get free at apollo.io)
 */

import { config } from "dotenv";
config();

import { PrismaClient } from "./src/generated/prisma";
import { NodeType } from "./src/generated/prisma";

const prisma = new PrismaClient();

// ============================================================
// CONFIG — fill these in before running
// ============================================================
const CONFIG = {
  USER_ID: "YOUR_USER_ID",                           // your user id from DB
  ANTHROPIC_CREDENTIAL_ID: "YOUR_ANTHROPIC_CRED_ID", // from /credentials page
  GMAIL_CREDENTIAL_ID: "YOUR_GMAIL_CRED_ID",         // from /credentials page
  TAVILY_API_KEY: "YOUR_TAVILY_API_KEY",
  APOLLO_API_KEY: "YOUR_APOLLO_API_KEY",
  YOUR_NAME: "Anurag",
  YOUR_INTRO: "I'm building Orcha, a personal AI agent platform that automates workflows and tasks for founders and teams.",
  TEST_EMAIL: "your@email.com",                       // your own email to test before going live
  LIVE_MODE: false,                                   // set to true when you're ready to send to real founders
};
// ============================================================

async function main() {
  console.log("🚀 Creating Funding Outreach Workflow...\n");

  // ── Step 1: Create the workflow ──────────────────────────
  const workflow = await prisma.workflow.create({
    data: {
      name: "Daily Funding Outreach",
      userId: CONFIG.USER_ID,
    },
  });
  console.log("✅ Workflow created:", workflow.id);

  // ── Step 2: Create nodes ─────────────────────────────────

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

  // NODE 3: Extract ONLY the domain from top funded startup
  const extractDomainNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Extract Founder Domain",
      type: NodeType.ANTHROPIC,
      position: { x: 700, y: 200 },
      credentialId: CONFIG.ANTHROPIC_CREDENTIAL_ID,
      data: {
        variableName: "founder_domain",
        systemPrompt:
          "You extract website domains from startup news. Output ONLY the domain name, nothing else. No punctuation, no explanation. Example output: razorpay.com",
        userPrompt: `From these funding news results, find the most recently funded Indian startup and output ONLY their website domain.
If you cannot find the exact domain, make your best guess from the startup name (e.g. "Zepto" → "zepto.in").

Search results:
{{json funding_news.httpResponse.data.results}}`,
      },
    },
  });

  // NODE 4: Extract full founder details for email context
  const extractDetailsNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Extract Founder Details",
      type: NodeType.ANTHROPIC,
      position: { x: 700, y: 400 },
      credentialId: CONFIG.ANTHROPIC_CREDENTIAL_ID,
      data: {
        variableName: "founder_details",
        systemPrompt: `You extract structured information from startup funding news.
Output ONLY this exact format, no extra text:
FOUNDER_NAME: [full name of the founder or CEO]
STARTUP: [company name]
AMOUNT: [funding amount, e.g. $5M Seed]
ROUND: [funding round, e.g. Seed, Series A]
WHAT_THEY_DO: [one sentence description of what the company does]`,
        userPrompt: `Extract details of the most recently funded Indian startup from these results:
{{json funding_news.httpResponse.data.results}}`,
      },
    },
  });

  // NODE 5: Find founder's email via Apollo
  const apolloNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Find Email via Apollo",
      type: NodeType.HTTP_REQUEST,
      position: { x: 1000, y: 300 },
      data: {
        variableName: "apollo_result",
        endpoint: "https://api.apollo.io/v1/people/search",
        method: "POST",
        body: `{
  "api_key": "${CONFIG.APOLLO_API_KEY}",
  "q_organization_domains": ["{{founder_domain.text}}"],
  "person_titles": ["founder", "co-founder", "CEO", "CTO", "managing director"],
  "per_page": 1,
  "reveal_personal_emails": true
}`,
      },
    },
  });

  // NODE 6: Write personalized email using Claude
  const emailWriterNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Write Personalized Email",
      type: NodeType.ANTHROPIC,
      position: { x: 1300, y: 300 },
      credentialId: CONFIG.ANTHROPIC_CREDENTIAL_ID,
      data: {
        variableName: "email_content",
        systemPrompt: `You write short, genuine cold outreach emails for ${CONFIG.YOUR_NAME}.
About ${CONFIG.YOUR_NAME}: ${CONFIG.YOUR_INTRO}

Rules:
- Congratulate the founder genuinely on their funding round
- Reference their specific startup and what they do (shows you did research)
- Mention ${CONFIG.YOUR_NAME}'s work in ONE sentence max, naturally — not salesy
- End with a soft ask: quick 15 min call, or just staying in touch
- Max 80 words total
- No subject line fluff like "Congratulations!" — make it specific
- Sound like a real human, not a template

Respond with ONLY valid JSON, no markdown:
{"subject": "string", "body": "string"}`,
        userPrompt: `Write a cold outreach email using this founder info:

Founder Details:
{{founder_details.text}}

Apollo contact data (use the email from here):
{{json apollo_result.httpResponse.data}}`,
      },
    },
  });

  // NODE 7: Send the email via Gmail
  const gmailNode = await prisma.node.create({
    data: {
      workflowId: workflow.id,
      name: "Send Email",
      type: NodeType.GMAIL,
      position: { x: 1600, y: 300 },
      credentialId: CONFIG.GMAIL_CREDENTIAL_ID,
      data: {
        variableName: "sent_email",
        credentialId: CONFIG.GMAIL_CREDENTIAL_ID,
        // In test mode, send to yourself. In live mode, use Apollo-found email.
        to: CONFIG.LIVE_MODE
          ? "{{apollo_result.httpResponse.data.people[0].email}}"
          : CONFIG.TEST_EMAIL,
        subject: "{{email_content.text}}",
        body: "{{email_content.text}}",
      },
    },
  });

  console.log("✅ All 7 nodes created");

  // ── Step 3: Wire up connections ──────────────────────────
  await prisma.connection.createMany({
    data: [
      // trigger → search
      {
        workflowId: workflow.id,
        fromNodeId: triggerNode.id,
        toNodeId: searchNode.id,
      },
      // search → extract domain (parallel branch)
      {
        workflowId: workflow.id,
        fromNodeId: searchNode.id,
        toNodeId: extractDomainNode.id,
      },
      // search → extract details (parallel branch)
      {
        workflowId: workflow.id,
        fromNodeId: searchNode.id,
        toNodeId: extractDetailsNode.id,
      },
      // extract domain → apollo
      {
        workflowId: workflow.id,
        fromNodeId: extractDomainNode.id,
        toNodeId: apolloNode.id,
      },
      // extract details → email writer
      {
        workflowId: workflow.id,
        fromNodeId: extractDetailsNode.id,
        toNodeId: emailWriterNode.id,
      },
      // apollo → email writer
      {
        workflowId: workflow.id,
        fromNodeId: apolloNode.id,
        toNodeId: emailWriterNode.id,
      },
      // email writer → gmail
      {
        workflowId: workflow.id,
        fromNodeId: emailWriterNode.id,
        toNodeId: gmailNode.id,
      },
    ],
  });

  console.log("✅ Connections wired");

  // ── Step 4: Schedule it (daily at 9:00 AM IST = 03:30 UTC) ──
  await prisma.scheduledWorkflow.create({
    data: {
      workflowId: workflow.id,
      cronExpression: "30 3 * * *", // 9:00 AM IST every day
      nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    },
  });
  console.log("✅ Scheduled: runs daily at 9:00 AM IST");

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ WORKFLOW READY: Daily Funding Outreach
   ID: ${workflow.id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT STEPS:
1. Connect Gmail at /credentials (select Gmail → Connect with Google)
2. Set LIVE_MODE: false → test sends to YOUR email first
3. Run manually once from /workflows/${workflow.id} to verify
4. Check your inbox — you should get a test email
5. Once it looks good, set LIVE_MODE: true and re-run

PIPELINE FLOW:
  [Trigger] → [Tavily Search] → [Extract Domain] → [Apollo Find Email]
                              ↘ [Extract Details] ↗ → [Claude Write Email] → [Gmail Send]
  `);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
