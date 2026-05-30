import type Anthropic from "@anthropic-ai/sdk";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Search the internet for current information, news, facts, or anything time-sensitive.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "send_email",
    description: "Send an email from the user's Gmail account on their behalf.",
    input_schema: {
      type: "object" as const,
      properties: {
        credentialId: {
          type: "string",
          description: "The Gmail credential ID from get_credentials",
        },
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body text" },
      },
      required: ["credentialId", "to", "subject", "body"],
    },
  },
  {
    name: "remember",
    description:
      "Save an important fact about the user to memory. Use this during onboarding and whenever the user shares info you should not forget.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: {
          type: "string",
          description:
            "Label for the info e.g. university, professorEmail, studentId",
        },
        value: {
          type: "string",
          description: "The value to store",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "get_profile",
    description: "Read all stored information about the user from memory.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_credentials",
    description:
      "List the user's connected credentials. Always call this before using Gmail or any AI tool in a workflow.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["ANTHROPIC", "OPENAI", "GEMINI", "GMAIL", "SLACK", "TAVILY"],
          description: "Filter by credential type",
        },
      },
      required: [],
    },
  },
  {
    name: "create_workflow",
    description: `Create and save an automation workflow that runs automatically.
Call this when: user wants recurring automation, multi-step pipeline,
or uses words like every, whenever, schedule, automatically.
The workflow is saved to DB and registered with the execution engine.`,
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Short descriptive name e.g. Monday JEE Summary Email",
        },
        trigger: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["MANUAL_TRIGGER", "GOOGLE_FORM_TRIGGER", "SCHEDULE"],
            },
            cron: {
              type: "string",
              description:
                "Cron expression for SCHEDULE trigger e.g. 0 9 * * MON",
            },
            formId: {
              type: "string",
              description: "Google Form ID for GOOGLE_FORM_TRIGGER",
            },
          },
          required: ["type"],
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique step ID e.g. step_1, step_2",
              },
              type: {
                type: "string",
                enum: [
                  "ANTHROPIC",
                  "OPENAI",
                  "GEMINI",
                  "SLACK",
                  "DISCORD",
                  "HTTP_REQUEST",
                  "GMAIL",
                  "FOR_EACH_STARTUP",
                ],
              },
              dependsOn: {
                type: "array",
                items: { type: "string" },
                description:
                  "Step IDs that must complete before this step runs",
              },
              config: {
                type: "object",
                description: `Step configuration. Fields by type:
ANTHROPIC/OPENAI/GEMINI: { variableName, credentialId, systemPrompt, userPrompt }
userPrompt can use {{prevStep.text}} to reference previous step outputs
SLACK: { variableName, webhookUrl, content }
content can use {{prevStep.text}}
GMAIL: { variableName, credentialId, to, subject, body }
body can use {{prevStep.text}}
HTTP_REQUEST: { variableName, url, method, body }
FOR_EACH_STARTUP: { variableName, startupsPath, startupsJson?, sourceUrl?, postText?, imageUrl?, openaiCredentialId?, gmailCredentialId, senderName?, senderContext?, testEmail?, liveMode? }`,
              },
            },
            required: ["id", "type", "config"],
          },
        },
        runNow: {
          type: "boolean",
          description:
            "true = execute immediately after saving. false = wait for trigger.",
        },
      },
      required: ["name", "trigger", "steps"],
    },
  },
];
