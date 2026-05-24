# Design Document: Personal AI Agent System

## Overview

This design transforms Orcha from a visual workflow automation platform into a personal AI agent system. The system adds a conversational AI layer powered by Claude that can understand natural language commands, execute tasks autonomously, and create workflows programmatically while maintaining the existing Inngest-based workflow execution engine.

### Key Design Principles

1. **Separation of Concerns**: The agent layer (reasoning, tool selection) is separate from the execution layer (workflow engine)
2. **Incremental Enhancement**: Existing workflow infrastructure remains unchanged; new features are additive
3. **Security First**: All credentials encrypted at rest, OAuth tokens refreshed automatically, sensitive data never logged
4. **Extensibility**: Tool system designed for easy addition of new capabilities
5. **User Control**: Agent always confirms destructive actions; users can preview and edit before execution

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                      │
│  (Chat Interface, Workflow Editor, Credentials Management)   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Agent Reasoning Layer                      │
│     (Claude API, Tool Selection, Context Management)         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Tool Execution Layer                     │
│  (Memory, Web Search, Gmail, Workflow Generation)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Workflow Execution Layer                    │
│         (Inngest Functions, Node Executors, Cron)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Data Persistence Layer                   │
│              (PostgreSQL, Prisma, Encryption)                 │
└─────────────────────────────────────────────────────────────┘
```

## Architecture

### System Integration with Existing Infrastructure

The agent system integrates with Orcha's existing infrastructure through these key integration points:

1. **Database Layer**: Extends existing Prisma schema with new models (ChatSession, Message, UserProfile, ScheduledWorkflow)
2. **Authentication**: Uses existing Better Auth for user authentication and session management
3. **Workflow Engine**: Leverages existing Inngest functions and node executors
4. **API Layer**: Adds new tRPC routers for agent operations alongside existing workflow routers
5. **UI Layer**: Adds chat interface while preserving existing workflow editor

### Agent Reasoning Flow

```mermaid
sequenceDiagram
    participant User
    participant ChatUI
    participant AgentAPI
    participant Claude
    participant Tools
    participant WorkflowEngine
    
    User->>ChatUI: Send message
    ChatUI->>AgentAPI: POST /api/trpc/agent.sendMessage
    AgentAPI->>Claude: Stream request with system prompt + tools
    
    loop Agentic Loop
        Claude->>Claude: Analyze request
        Claude->>Tools: Execute tool (memory, search, gmail, etc)
        Tools-->>Claude: Return tool result
        Claude->>Claude: Process result, decide next action
    end
    
    Claude-->>AgentAPI: Final response
    AgentAPI->>WorkflowEngine: Trigger workflow (if created)
    AgentAPI-->>ChatUI: Stream response
    ChatUI-->>User: Display response
```

### Tool System Architecture

The tool system provides a modular way to extend agent capabilities:

```typescript
// Tool definition interface
interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  execute: (input: unknown, context: ToolContext) => Promise<unknown>;
}

// Tool context provides access to user data and services
interface ToolContext {
  userId: string;
  sessionId: string;
  db: PrismaClient;
  services: {
    gmail?: GmailService;
    search?: SearchService;
  };
}
```

Tools are registered in a central registry and automatically exposed to Claude through the system prompt.

### OAuth Integration Architecture

```mermaid
sequenceDiagram
    participant User
    participant OrchaUI
    participant OrchaAPI
    participant Google
    participant Database
    
    User->>OrchaUI: Click "Connect Gmail"
    OrchaUI->>OrchaAPI: GET /api/oauth/gmail/authorize
    OrchaAPI->>Google: Redirect to OAuth consent
    Google-->>User: Show consent screen
    User->>Google: Approve access
    Google->>OrchaAPI: Redirect to /api/oauth/gmail/callback?code=...
    OrchaAPI->>Google: Exchange code for tokens
    Google-->>OrchaAPI: Return access_token + refresh_token
    OrchaAPI->>Database: Store encrypted tokens as Credential
    OrchaAPI-->>OrchaUI: Redirect to credentials page
    OrchaUI-->>User: Show "Gmail connected"
```

## Components and Interfaces

### File Structure

```
src/
├── features/
│   ├── agent/
│   │   ├── api/
│   │   │   └── agent-router.ts          # tRPC router for agent operations
│   │   ├── lib/
│   │   │   ├── agent-service.ts         # Core agent logic
│   │   │   ├── system-prompt.ts         # System prompt template
│   │   │   └── tool-registry.ts         # Tool registration and execution
│   │   ├── tools/
│   │   │   ├── memory-tool.ts           # User profile and memory operations
│   │   │   ├── search-tool.ts           # Web search capability
│   │   │   ├── gmail-tool.ts            # Gmail send operations
│   │   │   └── workflow-tool.ts         # Workflow creation from NL
│   │   └── components/
│   │       ├── chat-interface.tsx       # Main chat UI
│   │       ├── message-list.tsx         # Message display
│   │       ├── message-input.tsx        # User input
│   │       └── tool-execution-card.tsx  # Tool result display
│   ├── oauth/
│   │   ├── api/
│   │   │   └── oauth-router.ts          # OAuth flow endpoints
│   │   ├── lib/
│   │   │   ├── gmail-oauth.ts           # Gmail OAuth implementation
│   │   │   └── oauth-service.ts         # Generic OAuth utilities
│   │   └── components/
│   │       └── connect-service-button.tsx
│   ├── scheduled-workflows/
│   │   ├── lib/
│   │   │   ├── cron-service.ts          # Cron job logic
│   │   │   └── schedule-parser.ts       # Natural language to cron
│   │   └── api/
│   │       └── scheduled-workflow-router.ts
│   └── executions/
│       └── lib/
│           ├── executor-registry.ts     # Existing executor registry
│           └── executors/
│               └── gmail-executor.ts    # NEW: Gmail node executor
├── inngest/
│   ├── functions.ts                     # Existing workflow execution
│   └── scheduled-workflows.ts           # NEW: Cron job function
└── lib/
    ├── db.ts                            # Existing Prisma client
    ├── encryption.ts                    # Existing encryption utilities
    └── gmail-client.ts                  # NEW: Gmail API wrapper
```

### Core Interfaces


#### Agent Service Interface

```typescript
// src/features/agent/lib/agent-service.ts

interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

interface ToolResult {
  toolCallId: string;
  output: unknown;
  error?: string;
}

interface AgentServiceConfig {
  userId: string;
  sessionId: string;
  systemPrompt: string;
  tools: Tool[];
  maxIterations?: number; // Default: 10
}

class AgentService {
  async sendMessage(
    message: string,
    config: AgentServiceConfig
  ): Promise<AsyncIterable<AgentStreamChunk>>;
  
  async executeToolCall(
    toolCall: ToolCall,
    context: ToolContext
  ): Promise<ToolResult>;
}

type AgentStreamChunk = 
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; result: ToolResult }
  | { type: 'done' };
```

#### Tool Registry Interface

```typescript
// src/features/agent/lib/tool-registry.ts

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  getAll(): Tool[];
  
  // Convert tools to Claude API format
  toClaudeTools(): Array<{
    name: string;
    description: string;
    input_schema: JSONSchema;
  }>;
}

// Global registry instance
export const toolRegistry = new ToolRegistry();
```

#### Gmail Service Interface

```typescript
// src/lib/gmail-client.ts

interface GmailMessage {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
}

interface GmailCredential {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

class GmailClient {
  constructor(private credential: GmailCredential) {}
  
  async sendEmail(message: GmailMessage): Promise<{ messageId: string }>;
  
  async refreshAccessToken(): Promise<{
    accessToken: string;
    expiresAt: Date;
  }>;
  
  static async fromUserId(userId: string): Promise<GmailClient>;
}
```

#### OAuth Service Interface

```typescript
// src/features/oauth/lib/oauth-service.ts

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

class OAuthService {
  constructor(private config: OAuthConfig) {}
  
  getAuthorizationUrl(state: string): string;
  
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens>;
  
  async refreshTokens(refreshToken: string): Promise<OAuthTokens>;
}
```

#### Schedule Parser Interface

```typescript
// src/features/scheduled-workflows/lib/schedule-parser.ts

interface ParsedSchedule {
  cronExpression: string;
  humanReadable: string;
  timezone: string;
  nextExecution: Date;
}

class ScheduleParser {
  parse(
    naturalLanguage: string,
    timezone?: string
  ): ParsedSchedule;
  
  // Examples:
  // "every Monday at 9am" -> "0 9 * * 1"
  // "daily at 3pm" -> "0 15 * * *"
  // "every 2 hours" -> "0 */2 * * *"
}
```

## Data Models

### Extended Prisma Schema

```prisma
// Add to existing prisma/schema.prisma

// ============================================
// Agent System Models
// ============================================

model ChatSession {
  id        String   @id @default(cuid())
  title     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  messages  Message[]
  
  @@index([userId, createdAt])
  @@map("chat_session")
}

model Message {
  id        String   @id @default(cuid())
  role      MessageRole
  content   String   @db.Text
  
  // Tool execution tracking
  toolCalls Json?    // Array of ToolCall objects
  toolResults Json?  // Array of ToolResult objects
  
  createdAt DateTime @default(now())
  
  sessionId String
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  @@index([sessionId, createdAt])
  @@map("message")
}

enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
}

model UserProfile {
  id        String   @id @default(cuid())
  
  // Structured fields
  occupation String?
  location   String?
  timezone   String?
  
  // Unstructured facts stored as JSON
  // Format: { "key": { "value": string, "timestamp": ISO8601 } }
  facts      Json     @default("{}")
  
  // Writing style preferences
  writingStyle Json?  // { "tone": string, "formality": string, "signature": string }
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("user_profile")
}

model ScheduledWorkflow {
  id        String   @id @default(cuid())
  
  // Cron expression (e.g., "0 9 * * 1" for every Monday at 9am)
  cronExpression String
  
  // Human-readable description
  description String
  
  // Timezone for execution
  timezone    String   @default("UTC")
  
  // Next scheduled execution time
  nextExecution DateTime
  
  // Last execution time and status
  lastExecution DateTime?
  lastStatus    ExecutionStatus?
  
  // Retry configuration
  retryCount    Int      @default(0)
  maxRetries    Int      @default(3)
  
  // Enable/disable without deleting
  isActive      Boolean  @default(true)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([nextExecution, isActive])
  @@index([userId])
  @@map("scheduled_workflow")
}

model UsageTracking {
  id        String   @id @default(cuid())
  
  // Usage type
  type      UsageType
  
  // Count for the current period
  count     Int      @default(0)
  
  // Period start (resets daily)
  periodStart DateTime @default(now())
  
  // Metadata (e.g., tool name, endpoint)
  metadata  Json?
  
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([userId, type, periodStart])
  @@index([userId, periodStart])
  @@map("usage_tracking")
}

enum UsageType {
  AGENT_MESSAGE
  GMAIL_SEND
  WEB_SEARCH
  WORKFLOW_EXECUTION
}

// ============================================
// Updates to Existing Models
// ============================================

// Add to User model:
model User {
  // ... existing fields ...
  
  chatSessions      ChatSession[]
  userProfile       UserProfile?
  scheduledWorkflows ScheduledWorkflow[]
  usageTracking     UsageTracking[]
}

// Add to Workflow model:
model Workflow {
  // ... existing fields ...
  
  scheduledWorkflows ScheduledWorkflow[]
}

// Add to Credential enum:
enum CredentialType {
  OPENAI
  ANTHROPIC
  GEMINI
  GMAIL        // NEW
  GOOGLE_CALENDAR  // NEW (future)
  WHATSAPP     // NEW (future)
  LINKEDIN     // NEW (future)
}

// Add to NodeType enum:
enum NodeType {
  INITIAL
  MANUAL_TRIGGER
  HTTP_REQUEST
  GOOGLE_FORM_TRIGGER
  ANTHROPIC
  GEMINI
  OPENAI
  DISCORD
  SLACK
  GMAIL        // NEW
}
```

### Database Relationships

```mermaid
erDiagram
    User ||--o{ ChatSession : has
    User ||--o| UserProfile : has
    User ||--o{ ScheduledWorkflow : creates
    User ||--o{ UsageTracking : tracks
    User ||--o{ Workflow : owns
    User ||--o{ Credential : stores
    
    ChatSession ||--o{ Message : contains
    
    Workflow ||--o{ ScheduledWorkflow : scheduled_as
    Workflow ||--o{ Node : contains
    Workflow ||--o{ Connection : defines
    Workflow ||--o{ Execution : runs
    
    Node }o--|| Credential : uses
    
    ScheduledWorkflow }o--|| Workflow : references
```

## API Design

### tRPC Router Structure



#### Agent Router

```typescript
// src/features/agent/api/agent-router.ts

import { z } from 'zod';
import { protectedProcedure, router } from '@/trpc/init';
import { AgentService } from '../lib/agent-service';
import { toolRegistry } from '../lib/tool-registry';
import { getSystemPrompt } from '../lib/system-prompt';

export const agentRouter = router({
  // Send a message and get streaming response
  sendMessage: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      message: z.string().min(1).max(10000),
    }))
    .mutation(async function* ({ ctx, input }) {
      const agentService = new AgentService();
      
      // Save user message
      await ctx.db.message.create({
        data: {
          sessionId: input.sessionId,
          role: 'USER',
          content: input.message,
        },
      });
      
      // Stream agent response
      const stream = await agentService.sendMessage(input.message, {
        userId: ctx.user.id,
        sessionId: input.sessionId,
        systemPrompt: getSystemPrompt(ctx.user.id),
        tools: toolRegistry.getAll(),
      });
      
      let fullResponse = '';
      let toolCalls: any[] = [];
      let toolResults: any[] = [];
      
      for await (const chunk of stream) {
        yield chunk;
        
        if (chunk.type === 'text') {
          fullResponse += chunk.content;
        } else if (chunk.type === 'tool_call') {
          toolCalls.push(chunk.toolCall);
        } else if (chunk.type === 'tool_result') {
          toolResults.push(chunk.result);
        }
      }
      
      // Save assistant message
      await ctx.db.message.create({
        data: {
          sessionId: input.sessionId,
          role: 'ASSISTANT',
          content: fullResponse,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
        },
      });
    }),
  
  // Create a new chat session
  createSession: protectedProcedure
    .input(z.object({
      title: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatSession.create({
        data: {
          userId: ctx.user.id,
          title: input.title,
        },
      });
    }),
  
  // List user's chat sessions
  listSessions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.db.chatSession.findMany({
        where: { userId: ctx.user.id },
        orderBy: { updatedAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      
      let nextCursor: string | undefined;
      if (sessions.length > input.limit) {
        const nextItem = sessions.pop();
        nextCursor = nextItem?.id;
      }
      
      return {
        sessions,
        nextCursor,
      };
    }),
  
  // Get session with messages
  getSession: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.chatSession.findUniqueOrThrow({
        where: {
          id: input.sessionId,
          userId: ctx.user.id,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    }),
  
  // Delete a session
  deleteSession: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatSession.delete({
        where: {
          id: input.sessionId,
          userId: ctx.user.id,
        },
      });
    }),
});
```

#### OAuth Router

```typescript
// src/features/oauth/api/oauth-router.ts

import { z } from 'zod';
import { protectedProcedure, router } from '@/trpc/init';
import { GmailOAuthService } from '../lib/gmail-oauth';
import { encrypt } from '@/lib/encryption';
import { CredentialType } from '@/generated/prisma';

export const oauthRouter = router({
  // Get Gmail OAuth authorization URL
  getGmailAuthUrl: protectedProcedure
    .query(async ({ ctx }) => {
      const gmailOAuth = new GmailOAuthService();
      const state = JSON.stringify({ userId: ctx.user.id });
      return {
        url: gmailOAuth.getAuthorizationUrl(state),
      };
    }),
  
  // List user's connected services
  listConnectedServices: protectedProcedure
    .query(async ({ ctx }) => {
      const credentials = await ctx.db.credential.findMany({
        where: {
          userId: ctx.user.id,
          type: {
            in: ['GMAIL', 'GOOGLE_CALENDAR', 'WHATSAPP', 'LINKEDIN'],
          },
        },
        select: {
          id: true,
          name: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      
      return credentials;
    }),
  
  // Revoke a connected service
  revokeService: protectedProcedure
    .input(z.object({
      credentialId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.credential.delete({
        where: {
          id: input.credentialId,
          userId: ctx.user.id,
        },
      });
    }),
});
```

#### Scheduled Workflow Router

```typescript
// src/features/scheduled-workflows/api/scheduled-workflow-router.ts

import { z } from 'zod';
import { protectedProcedure, router } from '@/trpc/init';
import { ScheduleParser } from '../lib/schedule-parser';

export const scheduledWorkflowRouter = router({
  // Create a scheduled workflow
  create: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
      schedule: z.string(), // Natural language or cron
      description: z.string(),
      timezone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const parser = new ScheduleParser();
      const parsed = parser.parse(input.schedule, input.timezone);
      
      return ctx.db.scheduledWorkflow.create({
        data: {
          workflowId: input.workflowId,
          userId: ctx.user.id,
          cronExpression: parsed.cronExpression,
          description: input.description,
          timezone: parsed.timezone,
          nextExecution: parsed.nextExecution,
        },
      });
    }),
  
  // List user's scheduled workflows
  list: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.scheduledWorkflow.findMany({
        where: { userId: ctx.user.id },
        include: {
          workflow: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { nextExecution: 'asc' },
      });
    }),
  
  // Toggle active status
  toggleActive: protectedProcedure
    .input(z.object({
      id: z.string(),
      isActive: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.scheduledWorkflow.update({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        data: {
          isActive: input.isActive,
        },
      });
    }),
  
  // Delete scheduled workflow
  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.scheduledWorkflow.delete({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });
    }),
});
```

#### User Profile Router

```typescript
// src/features/agent/api/user-profile-router.ts

import { z } from 'zod';
import { protectedProcedure, router } from '@/trpc/init';

export const userProfileRouter = router({
  // Get user profile
  get: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.userProfile.findUnique({
        where: { userId: ctx.user.id },
      });
    }),
  
  // Update user profile
  update: protectedProcedure
    .input(z.object({
      occupation: z.string().optional(),
      location: z.string().optional(),
      timezone: z.string().optional(),
      facts: z.record(z.any()).optional(),
      writingStyle: z.record(z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.userProfile.upsert({
        where: { userId: ctx.user.id },
        create: {
          userId: ctx.user.id,
          ...input,
        },
        update: input,
      });
    }),
  
  // Add a fact to user profile
  addFact: protectedProcedure
    .input(z.object({
      key: z.string(),
      value: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.userProfile.findUnique({
        where: { userId: ctx.user.id },
      });
      
      const facts = (profile?.facts as Record<string, any>) || {};
      facts[input.key] = {
        value: input.value,
        timestamp: new Date().toISOString(),
      };
      
      return ctx.db.userProfile.upsert({
        where: { userId: ctx.user.id },
        create: {
          userId: ctx.user.id,
          facts,
        },
        update: {
          facts,
        },
      });
    }),
  
  // Delete user profile and all data
  deleteAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      // This will cascade delete all related data
      return ctx.db.userProfile.delete({
        where: { userId: ctx.user.id },
      });
    }),
});
```

### REST API Endpoints

#### Gmail OAuth Callback

```typescript
// src/app/api/oauth/gmail/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { GmailOAuthService } from '@/features/oauth/lib/gmail-oauth';
import { encrypt } from '@/lib/encryption';
import prisma from '@/lib/db';
import { CredentialType } from '@/generated/prisma';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  // Handle OAuth errors
  if (error) {
    return NextResponse.redirect(
      new URL(`/credentials?error=${error}`, request.url)
    );
  }
  
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/credentials?error=missing_parameters', request.url)
    );
  }
  
  try {
    // Parse state to get userId
    const { userId } = JSON.parse(state);
    
    // Exchange code for tokens
    const gmailOAuth = new GmailOAuthService();
    const tokens = await gmailOAuth.exchangeCodeForTokens(code);
    
    // Store encrypted tokens
    await prisma.credential.create({
      data: {
        userId,
        name: 'Gmail',
        type: CredentialType.GMAIL,
        value: encrypt(JSON.stringify({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt.toISOString(),
          scope: tokens.scope,
        })),
      },
    });
    
    return NextResponse.redirect(
      new URL('/credentials?success=gmail_connected', request.url)
    );
  } catch (err) {
    console.error('Gmail OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/credentials?error=oauth_failed', request.url)
    );
  }
}
```

## Tool System Architecture

### Tool Registration



```typescript
// src/features/agent/lib/tool-registry.ts

import { z } from 'zod';

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  execute: (input: unknown, context: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
  userId: string;
  sessionId: string;
  db: PrismaClient;
}

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
  }
  
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  // Convert Zod schemas to Claude's JSON Schema format
  toClaudeTools(): Array<{
    name: string;
    description: string;
    input_schema: any;
  }> {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.inputSchema),
    }));
  }
}

export const toolRegistry = new ToolRegistry();

// Helper to convert Zod to JSON Schema
function zodToJsonSchema(schema: z.ZodSchema): any {
  // Implementation using zod-to-json-schema library
  // or manual conversion for common types
}
```

### Tool Implementations

#### Memory Tool

```typescript
// src/features/agent/tools/memory-tool.ts

import { z } from 'zod';
import { Tool, toolRegistry } from '../lib/tool-registry';

const memoryTool: Tool = {
  name: 'memory',
  description: 'Store or retrieve information about the user. Use this to remember user preferences, facts, or context.',
  inputSchema: z.object({
    action: z.enum(['store', 'retrieve', 'update']),
    key: z.string().describe('The key to store/retrieve (e.g., "favorite_color", "work_schedule")'),
    value: z.string().optional().describe('The value to store (required for store/update)'),
  }),
  
  async execute(input, context) {
    const { action, key, value } = input as z.infer<typeof memoryTool.inputSchema>;
    
    const profile = await context.db.userProfile.findUnique({
      where: { userId: context.userId },
    });
    
    const facts = (profile?.facts as Record<string, any>) || {};
    
    if (action === 'retrieve') {
      const fact = facts[key];
      return fact ? fact.value : null;
    }
    
    if (action === 'store' || action === 'update') {
      if (!value) {
        throw new Error('Value is required for store/update actions');
      }
      
      facts[key] = {
        value,
        timestamp: new Date().toISOString(),
      };
      
      await context.db.userProfile.upsert({
        where: { userId: context.userId },
        create: {
          userId: context.userId,
          facts,
        },
        update: { facts },
      });
      
      return { success: true, key, value };
    }
  },
};

toolRegistry.register(memoryTool);
```

#### Web Search Tool

```typescript
// src/features/agent/tools/search-tool.ts

import { z } from 'zod';
import { Tool, toolRegistry } from '../lib/tool-registry';
import ky from 'ky';

const searchTool: Tool = {
  name: 'web_search',
  description: 'Search the web for current information. Use this when you need up-to-date facts, news, or information beyond your training data.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    numResults: z.number().min(1).max(10).default(5).describe('Number of results to return'),
  }),
  
  async execute(input, context) {
    const { query, numResults } = input as z.infer<typeof searchTool.inputSchema>;
    
    // Check rate limit
    await checkRateLimit(context.userId, 'WEB_SEARCH', 20);
    
    // Use a search API (e.g., Brave Search, Serper, etc.)
    const response = await ky.get('https://api.search.brave.com/res/v1/web/search', {
      searchParams: {
        q: query,
        count: numResults,
      },
      headers: {
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY!,
      },
    }).json<any>();
    
    // Track usage
    await trackUsage(context.userId, 'WEB_SEARCH');
    
    return {
      results: response.web.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        description: r.description,
      })),
    };
  },
};

toolRegistry.register(searchTool);
```

#### Gmail Tool

```typescript
// src/features/agent/tools/gmail-tool.ts

import { z } from 'zod';
import { Tool, toolRegistry } from '../lib/tool-registry';
import { GmailClient } from '@/lib/gmail-client';

const gmailTool: Tool = {
  name: 'send_email',
  description: 'Send an email via Gmail. Always draft the email and show it to the user for approval before sending.',
  inputSchema: z.object({
    to: z.string().email().describe('Recipient email address'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body (can be HTML)'),
    isHtml: z.boolean().default(false).describe('Whether the body is HTML'),
  }),
  
  async execute(input, context) {
    const { to, subject, body, isHtml } = input as z.infer<typeof gmailTool.inputSchema>;
    
    // Check rate limit
    await checkRateLimit(context.userId, 'GMAIL_SEND', 50);
    
    // Get Gmail client for user
    const gmailClient = await GmailClient.fromUserId(context.userId);
    
    // Send email
    const result = await gmailClient.sendEmail({
      to,
      subject,
      body,
      isHtml,
    });
    
    // Track usage
    await trackUsage(context.userId, 'GMAIL_SEND');
    
    return {
      success: true,
      messageId: result.messageId,
      to,
      subject,
    };
  },
};

toolRegistry.register(gmailTool);
```

#### Workflow Creation Tool

```typescript
// src/features/agent/tools/workflow-tool.ts

import { z } from 'zod';
import { Tool, toolRegistry } from '../lib/tool-registry';
import { NodeType } from '@/generated/prisma';
import { createId } from '@paralleldrive/cuid2';

const workflowTool: Tool = {
  name: 'create_workflow',
  description: 'Create a workflow from a natural language description. Use this when the user wants to automate a recurring task.',
  inputSchema: z.object({
    name: z.string().describe('Workflow name'),
    description: z.string().describe('What the workflow does'),
    nodes: z.array(z.object({
      type: z.nativeEnum(NodeType),
      name: z.string(),
      data: z.record(z.any()),
      credentialType: z.string().optional(),
    })).describe('Array of workflow nodes'),
    schedule: z.string().optional().describe('Schedule in natural language (e.g., "every Monday at 9am")'),
  }),
  
  async execute(input, context) {
    const { name, description, nodes, schedule } = input as z.infer<typeof workflowTool.inputSchema>;
    
    // Validate credentials exist
    for (const node of nodes) {
      if (node.credentialType) {
        const credential = await context.db.credential.findFirst({
          where: {
            userId: context.userId,
            type: node.credentialType as any,
          },
        });
        
        if (!credential) {
          throw new Error(`Missing credential: ${node.credentialType}. Please connect this service first.`);
        }
      }
    }
    
    // Create workflow
    const workflow = await context.db.workflow.create({
      data: {
        userId: context.userId,
        name,
      },
    });
    
    // Create nodes
    const createdNodes = await Promise.all(
      nodes.map(async (node, index) => {
        const credential = node.credentialType
          ? await context.db.credential.findFirst({
              where: {
                userId: context.userId,
                type: node.credentialType as any,
              },
            })
          : null;
        
        return context.db.node.create({
          data: {
            workflowId: workflow.id,
            name: node.name,
            type: node.type,
            data: node.data,
            credentialId: credential?.id,
            position: { x: index * 300, y: 100 },
          },
        });
      })
    );
    
    // Create connections (sequential by default)
    for (let i = 0; i < createdNodes.length - 1; i++) {
      await context.db.connection.create({
        data: {
          workflowId: workflow.id,
          fromNodeId: createdNodes[i].id,
          toNodeId: createdNodes[i + 1].id,
        },
      });
    }
    
    // Create scheduled workflow if schedule provided
    if (schedule) {
      const parser = new ScheduleParser();
      const parsed = parser.parse(schedule);
      
      await context.db.scheduledWorkflow.create({
        data: {
          workflowId: workflow.id,
          userId: context.userId,
          cronExpression: parsed.cronExpression,
          description,
          timezone: parsed.timezone,
          nextExecution: parsed.nextExecution,
        },
      });
    }
    
    return {
      success: true,
      workflowId: workflow.id,
      name,
      nodeCount: createdNodes.length,
      scheduled: !!schedule,
    };
  },
};

toolRegistry.register(workflowTool);
```

### Rate Limiting Utilities

```typescript
// src/features/agent/lib/rate-limiting.ts

import prisma from '@/lib/db';
import { UsageType } from '@/generated/prisma';

const RATE_LIMITS: Record<UsageType, number> = {
  AGENT_MESSAGE: 100,
  GMAIL_SEND: 50,
  WEB_SEARCH: 20,
  WORKFLOW_EXECUTION: 200,
};

export async function checkRateLimit(
  userId: string,
  type: UsageType,
  limit?: number
): Promise<void> {
  const maxLimit = limit ?? RATE_LIMITS[type];
  const periodStart = new Date();
  periodStart.setHours(0, 0, 0, 0);
  
  const usage = await prisma.usageTracking.findUnique({
    where: {
      userId_type_periodStart: {
        userId,
        type,
        periodStart,
      },
    },
  });
  
  if (usage && usage.count >= maxLimit) {
    const resetTime = new Date(periodStart);
    resetTime.setDate(resetTime.getDate() + 1);
    throw new Error(
      `Rate limit exceeded for ${type}. Limit: ${maxLimit}/day. Resets at ${resetTime.toISOString()}`
    );
  }
}

export async function trackUsage(
  userId: string,
  type: UsageType,
  metadata?: Record<string, any>
): Promise<void> {
  const periodStart = new Date();
  periodStart.setHours(0, 0, 0, 0);
  
  await prisma.usageTracking.upsert({
    where: {
      userId_type_periodStart: {
        userId,
        type,
        periodStart,
      },
    },
    create: {
      userId,
      type,
      periodStart,
      count: 1,
      metadata,
    },
    update: {
      count: {
        increment: 1,
      },
      metadata,
    },
  });
}
```

## Agentic Loop Design

### Agent Service Implementation

```typescript
// src/features/agent/lib/agent-service.ts

import Anthropic from '@anthropic-ai/sdk';
import { toolRegistry } from './tool-registry';
import type { ToolContext } from './tool-registry';

export interface AgentServiceConfig {
  userId: string;
  sessionId: string;
  systemPrompt: string;
  tools: Tool[];
  maxIterations?: number;
}

export type AgentStreamChunk = 
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; result: ToolResult }
  | { type: 'done' };

interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

interface ToolResult {
  toolCallId: string;
  output: unknown;
  error?: string;
}

export class AgentService {
  private anthropic: Anthropic;
  
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }
  
  async *sendMessage(
    message: string,
    config: AgentServiceConfig
  ): AsyncIterable<AgentStreamChunk> {
    const maxIterations = config.maxIterations ?? 10;
    let iteration = 0;
    
    // Build conversation history
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: message },
    ];
    
    const toolContext: ToolContext = {
      userId: config.userId,
      sessionId: config.sessionId,
      db: prisma,
    };
    
    while (iteration < maxIterations) {
      iteration++;
      
      // Call Claude API
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: config.systemPrompt,
        messages,
        tools: toolRegistry.toClaudeTools(),
        stream: false,
      });
      
      // Process response
      if (response.stop_reason === 'end_turn') {
        // Agent is done, return final text
        for (const block of response.content) {
          if (block.type === 'text') {
            yield { type: 'text', content: block.text };
          }
        }
        yield { type: 'done' };
        break;
      }
      
      if (response.stop_reason === 'tool_use') {
        // Agent wants to use tools
        const toolCalls: ToolCall[] = [];
        const toolResults: ToolResult[] = [];
        
        // Extract tool calls
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              input: block.input,
            });
          }
        }
        
        // Execute tools
        for (const toolCall of toolCalls) {
          yield { type: 'tool_call', toolCall };
          
          try {
            const tool = toolRegistry.get(toolCall.name);
            if (!tool) {
              throw new Error(`Unknown tool: ${toolCall.name}`);
            }
            
            // Validate input
            const validatedInput = tool.inputSchema.parse(toolCall.input);
            
            // Execute tool
            const output = await tool.execute(validatedInput, toolContext);
            
            const result: ToolResult = {
              toolCallId: toolCall.id,
              output,
            };
            
            toolResults.push(result);
            yield { type: 'tool_result', result };
          } catch (error) {
            const result: ToolResult = {
              toolCallId: toolCall.id,
              output: null,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
            
            toolResults.push(result);
            yield { type: 'tool_result', result };
          }
        }
        
        // Add assistant message and tool results to conversation
        messages.push({
          role: 'assistant',
          content: response.content,
        });
        
        messages.push({
          role: 'user',
          content: toolResults.map(result => ({
            type: 'tool_result' as const,
            tool_use_id: result.toolCallId,
            content: result.error
              ? `Error: ${result.error}`
              : JSON.stringify(result.output),
          })),
        });
        
        // Continue loop to get next response
        continue;
      }
      
      // Unexpected stop reason
      throw new Error(`Unexpected stop reason: ${response.stop_reason}`);
    }
    
    if (iteration >= maxIterations) {
      yield {
        type: 'text',
        content: '\n\n[Maximum iterations reached. Please try breaking down your request into smaller steps.]',
      };
      yield { type: 'done' };
    }
  }
}
```

### System Prompt Template



```typescript
// src/features/agent/lib/system-prompt.ts

import prisma from '@/lib/db';

export async function getSystemPrompt(userId: string): Promise<string> {
  // Fetch user profile for context
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  });
  
  const userContext = profile ? `
User Profile:
- Name: ${profile.occupation || 'Not specified'}
- Location: ${profile.location || 'Not specified'}
- Timezone: ${profile.timezone || 'UTC'}
${Object.keys(profile.facts as any || {}).length > 0 ? `
Known Facts:
${Object.entries(profile.facts as any).map(([key, val]: [string, any]) => `- ${key}: ${val.value}`).join('\n')}
` : ''}
` : '';
  
  return `You are a helpful personal AI assistant integrated into Orcha, a workflow automation platform. Your role is to help users automate tasks, manage their workflows, and interact with connected services.

${userContext}

## Your Capabilities

You have access to the following tools:

1. **memory**: Store and retrieve information about the user
   - Use this to remember user preferences, facts, and context
   - Always check memory before asking the user for information they may have already provided

2. **web_search**: Search the web for current information
   - Use this when you need up-to-date facts, news, or information beyond your training data
   - Always cite sources when providing information from searches

3. **send_email**: Send emails via Gmail
   - IMPORTANT: Always draft the email and show it to the user for approval before sending
   - Apply the user's writing style if available in their profile
   - Ask for confirmation: "Would you like me to send this email?"

4. **create_workflow**: Create automated workflows
   - Use this when the user wants to automate a recurring task
   - Validate that all required credentials are connected before creating
   - Explain what the workflow will do and when it will run

## Behavior Guidelines

1. **Be Proactive**: Suggest automations and improvements based on user requests
2. **Be Concise**: Keep responses clear and to the point
3. **Confirm Actions**: Always confirm before taking destructive or irreversible actions
4. **Handle Errors Gracefully**: If a tool fails, explain the error and suggest alternatives
5. **Respect Privacy**: Never log or share sensitive information
6. **Learn Continuously**: Use the memory tool to remember user preferences and context

## Workflow Creation Guidelines

When creating workflows:
1. Start with a trigger node (MANUAL_TRIGGER, GOOGLE_FORM_TRIGGER, or scheduled)
2. Add processing nodes (HTTP_REQUEST, ANTHROPIC, GEMINI, OPENAI)
3. End with action nodes (GMAIL, DISCORD, SLACK)
4. Ensure all required credentials are available
5. Provide a clear description of what the workflow does

## Email Guidelines

When drafting emails:
1. Use the user's writing style from their profile if available
2. Match the formality level to the context
3. Include a clear subject line
4. Keep the body concise and well-structured
5. Always show the draft to the user before sending

## Error Handling

If a tool fails:
1. Explain what went wrong in user-friendly language
2. If a credential is missing, guide the user to connect the service
3. If a rate limit is hit, explain when it will reset
4. Suggest alternative approaches when possible

## Examples

User: "Send an email to john@example.com about the meeting tomorrow"
You: I'll draft an email for you. Let me check your profile for context...
[Use memory tool to get meeting details if available]
Here's the draft:

To: john@example.com
Subject: Tomorrow's Meeting

Hi John,

[Draft email body based on context]

Would you like me to send this email?

User: "Create a workflow that sends me a daily summary every morning"
You: I'll create a workflow that runs every morning. What time would you like to receive the summary, and what should it include?

Remember: You are helpful, proactive, and always prioritize user control and privacy.`;
}
```

## Workflow Generation from Natural Language

### Workflow Generation Strategy

The agent uses a structured approach to convert natural language descriptions into executable workflows:

1. **Intent Recognition**: Identify the automation goal (e.g., "send daily email", "process form submissions")
2. **Trigger Selection**: Determine the appropriate trigger type (manual, scheduled, webhook)
3. **Node Sequence Planning**: Map the workflow steps to available node types
4. **Credential Validation**: Verify all required credentials are connected
5. **Workflow Assembly**: Create nodes and connections in the database
6. **Schedule Configuration**: If recurring, parse the schedule and create ScheduledWorkflow

### Example Workflow Patterns

```typescript
// src/features/agent/lib/workflow-patterns.ts

export const workflowPatterns = {
  // Pattern: Daily email summary
  dailyEmailSummary: {
    trigger: 'MANUAL_TRIGGER', // Will be scheduled
    nodes: [
      { type: 'HTTP_REQUEST', purpose: 'Fetch data' },
      { type: 'ANTHROPIC', purpose: 'Summarize data' },
      { type: 'GMAIL', purpose: 'Send email' },
    ],
    requiredCredentials: ['ANTHROPIC', 'GMAIL'],
  },
  
  // Pattern: Form submission notification
  formNotification: {
    trigger: 'GOOGLE_FORM_TRIGGER',
    nodes: [
      { type: 'ANTHROPIC', purpose: 'Format response' },
      { type: 'DISCORD', purpose: 'Send notification' },
    ],
    requiredCredentials: ['ANTHROPIC', 'DISCORD'],
  },
  
  // Pattern: AI-powered email response
  aiEmailResponse: {
    trigger: 'MANUAL_TRIGGER',
    nodes: [
      { type: 'ANTHROPIC', purpose: 'Generate response' },
      { type: 'GMAIL', purpose: 'Send email' },
    ],
    requiredCredentials: ['ANTHROPIC', 'GMAIL'],
  },
};
```

## Scheduled Execution

### Cron Job Implementation

```typescript
// src/inngest/scheduled-workflows.ts

import { inngest } from './client';
import prisma from '@/lib/db';
import { sendWorkflowExecution } from './utils';
import { ExecutionStatus } from '@/generated/prisma';

export const checkScheduledWorkflows = inngest.createFunction(
  {
    id: 'check-scheduled-workflows',
    retries: 0,
  },
  {
    cron: '* * * * *', // Run every minute
  },
  async ({ step }) => {
    const now = new Date();
    
    // Find workflows due for execution
    const dueWorkflows = await step.run('find-due-workflows', async () => {
      return prisma.scheduledWorkflow.findMany({
        where: {
          isActive: true,
          nextExecution: {
            lte: now,
          },
        },
        include: {
          workflow: true,
        },
      });
    });
    
    if (dueWorkflows.length === 0) {
      return { message: 'No workflows due', count: 0 };
    }
    
    // Execute each workflow
    const results = await Promise.allSettled(
      dueWorkflows.map(async (scheduledWorkflow) => {
        return step.run(`execute-${scheduledWorkflow.id}`, async () => {
          try {
            // Trigger workflow execution
            await sendWorkflowExecution({
              workflowId: scheduledWorkflow.workflowId,
            });
            
            // Calculate next execution time
            const nextExecution = calculateNextExecution(
              scheduledWorkflow.cronExpression,
              scheduledWorkflow.timezone
            );
            
            // Update scheduled workflow
            await prisma.scheduledWorkflow.update({
              where: { id: scheduledWorkflow.id },
              data: {
                lastExecution: now,
                lastStatus: ExecutionStatus.SUCCESS,
                nextExecution,
                retryCount: 0,
              },
            });
            
            return { success: true, id: scheduledWorkflow.id };
          } catch (error) {
            // Handle execution failure
            const retryCount = scheduledWorkflow.retryCount + 1;
            const shouldRetry = retryCount < scheduledWorkflow.maxRetries;
            
            if (shouldRetry) {
              // Retry with exponential backoff
              const retryDelay = Math.pow(2, retryCount) * 60 * 1000; // 2^n minutes
              const nextExecution = new Date(now.getTime() + retryDelay);
              
              await prisma.scheduledWorkflow.update({
                where: { id: scheduledWorkflow.id },
                data: {
                  retryCount,
                  nextExecution,
                },
              });
            } else {
              // Max retries reached, calculate next regular execution
              const nextExecution = calculateNextExecution(
                scheduledWorkflow.cronExpression,
                scheduledWorkflow.timezone
              );
              
              await prisma.scheduledWorkflow.update({
                where: { id: scheduledWorkflow.id },
                data: {
                  lastExecution: now,
                  lastStatus: ExecutionStatus.FAILED,
                  nextExecution,
                  retryCount: 0,
                },
              });
              
              // Notify user of failure
              await notifyUserOfFailure(
                scheduledWorkflow.userId,
                scheduledWorkflow.workflow.name,
                error
              );
            }
            
            throw error;
          }
        });
      })
    );
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;
    
    return {
      message: 'Scheduled workflows processed',
      total: dueWorkflows.length,
      success: successCount,
      failed: failureCount,
    };
  }
);

function calculateNextExecution(cronExpression: string, timezone: string): Date {
  // Use a cron parser library (e.g., cron-parser)
  const parser = require('cron-parser');
  const interval = parser.parseExpression(cronExpression, {
    tz: timezone,
  });
  return interval.next().toDate();
}

async function notifyUserOfFailure(
  userId: string,
  workflowName: string,
  error: unknown
): Promise<void> {
  // Create a system message in the user's most recent chat session
  const session = await prisma.chatSession.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  
  if (session) {
    await prisma.message.create({
      data: {
        sessionId: session.id,
        role: 'SYSTEM',
        content: `⚠️ Scheduled workflow "${workflowName}" failed to execute. Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please check the workflow configuration.`,
      },
    });
  }
}
```

### Schedule Parser Implementation

```typescript
// src/features/scheduled-workflows/lib/schedule-parser.ts

import parser from 'cron-parser';

export interface ParsedSchedule {
  cronExpression: string;
  humanReadable: string;
  timezone: string;
  nextExecution: Date;
}

export class ScheduleParser {
  private patterns: Array<{
    regex: RegExp;
    toCron: (match: RegExpMatchArray) => string;
    description: (match: RegExpMatchArray) => string;
  }> = [
    // "every Monday at 9am"
    {
      regex: /every (monday|tuesday|wednesday|thursday|friday|saturday|sunday) at (\d{1,2})(am|pm)/i,
      toCron: (match) => {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const day = days.indexOf(match[1].toLowerCase());
        let hour = parseInt(match[2]);
        if (match[3].toLowerCase() === 'pm' && hour !== 12) hour += 12;
        if (match[3].toLowerCase() === 'am' && hour === 12) hour = 0;
        return `0 ${hour} * * ${day}`;
      },
      description: (match) => `Every ${match[1]} at ${match[2]}${match[3]}`,
    },
    
    // "daily at 3pm"
    {
      regex: /daily at (\d{1,2})(am|pm)/i,
      toCron: (match) => {
        let hour = parseInt(match[1]);
        if (match[2].toLowerCase() === 'pm' && hour !== 12) hour += 12;
        if (match[2].toLowerCase() === 'am' && hour === 12) hour = 0;
        return `0 ${hour} * * *`;
      },
      description: (match) => `Daily at ${match[1]}${match[2]}`,
    },
    
    // "every 2 hours"
    {
      regex: /every (\d+) hours?/i,
      toCron: (match) => `0 */${match[1]} * * *`,
      description: (match) => `Every ${match[1]} hour${match[1] === '1' ? '' : 's'}`,
    },
    
    // "every hour"
    {
      regex: /every hour/i,
      toCron: () => '0 * * * *',
      description: () => 'Every hour',
    },
    
    // "every weekday at 9am"
    {
      regex: /every weekday at (\d{1,2})(am|pm)/i,
      toCron: (match) => {
        let hour = parseInt(match[1]);
        if (match[2].toLowerCase() === 'pm' && hour !== 12) hour += 12;
        if (match[2].toLowerCase() === 'am' && hour === 12) hour = 0;
        return `0 ${hour} * * 1-5`;
      },
      description: (match) => `Every weekday at ${match[1]}${match[2]}`,
    },
  ];
  
  parse(naturalLanguage: string, timezone: string = 'UTC'): ParsedSchedule {
    const input = naturalLanguage.trim().toLowerCase();
    
    // Try to match against patterns
    for (const pattern of this.patterns) {
      const match = input.match(pattern.regex);
      if (match) {
        const cronExpression = pattern.toCron(match);
        const humanReadable = pattern.description(match);
        
        // Calculate next execution
        const interval = parser.parseExpression(cronExpression, { tz: timezone });
        const nextExecution = interval.next().toDate();
        
        return {
          cronExpression,
          humanReadable,
          timezone,
          nextExecution,
        };
      }
    }
    
    // If no pattern matches, try to parse as cron expression directly
    try {
      const interval = parser.parseExpression(input, { tz: timezone });
      const nextExecution = interval.next().toDate();
      
      return {
        cronExpression: input,
        humanReadable: 'Custom schedule',
        timezone,
        nextExecution,
      };
    } catch (error) {
      throw new Error(
        `Could not parse schedule: "${naturalLanguage}". Try formats like "every Monday at 9am" or "daily at 3pm".`
      );
    }
  }
}
```

## Gmail Integration

### Gmail Client Implementation

```typescript
// src/lib/gmail-client.ts

import { google } from 'googleapis';
import prisma from './db';
import { decrypt, encrypt } from './encryption';
import { CredentialType } from '@/generated/prisma';

export interface GmailMessage {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
}

interface GmailCredentialData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
}

export class GmailClient {
  private oauth2Client: any;
  private credentialId: string;
  
  constructor(
    private credential: GmailCredentialData,
    credentialId: string
  ) {
    this.credentialId = credentialId;
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      process.env.GOOGLE_REDIRECT_URI!
    );
    
    this.oauth2Client.setCredentials({
      access_token: credential.accessToken,
      refresh_token: credential.refreshToken,
    });
  }
  
  async sendEmail(message: GmailMessage): Promise<{ messageId: string }> {
    // Check if token is expired
    const expiresAt = new Date(this.credential.expiresAt);
    if (expiresAt < new Date()) {
      await this.refreshAccessToken();
    }
    
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    
    // Create email message
    const email = [
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      message.isHtml ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
      '',
      message.body,
    ].join('\n');
    
    // Encode email in base64
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // Send email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
      },
    });
    
    return {
      messageId: response.data.id!,
    };
  }
  
  async refreshAccessToken(): Promise<void> {
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    
    // Update stored credential
    const newCredentialData: GmailCredentialData = {
      accessToken: credentials.access_token!,
      refreshToken: this.credential.refreshToken,
      expiresAt: new Date(credentials.expiry_date!).toISOString(),
      scope: this.credential.scope,
    };
    
    await prisma.credential.update({
      where: { id: this.credentialId },
      data: {
        value: encrypt(JSON.stringify(newCredentialData)),
      },
    });
    
    // Update local credential
    this.credential = newCredentialData;
    this.oauth2Client.setCredentials({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
    });
  }
  
  static async fromUserId(userId: string): Promise<GmailClient> {
    const credential = await prisma.credential.findFirst({
      where: {
        userId,
        type: CredentialType.GMAIL,
      },
    });
    
    if (!credential) {
      throw new Error('Gmail credential not found. Please connect your Gmail account.');
    }
    
    const credentialData: GmailCredentialData = JSON.parse(decrypt(credential.value));
    
    return new GmailClient(credentialData, credential.id);
  }
}
```

### Gmail OAuth Service

```typescript
// src/features/oauth/lib/gmail-oauth.ts

import { google } from 'googleapis';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

export class GmailOAuthService {
  private oauth2Client: any;
  
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      process.env.GOOGLE_REDIRECT_URI!
    );
  }
  
  getAuthorizationUrl(state: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.send'],
      state,
      prompt: 'consent', // Force consent to get refresh token
    });
  }
  
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const { tokens } = await this.oauth2Client.getToken(code);
    
    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiresAt: new Date(tokens.expiry_date!),
      scope: tokens.scope!,
    };
  }
  
  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
    
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    
    return {
      accessToken: credentials.access_token!,
      refreshToken: refreshToken, // Refresh token doesn't change
      expiresAt: new Date(credentials.expiry_date!),
      scope: credentials.scope!,
    };
  }
}
```

### Gmail Node Executor



```typescript
// src/features/executions/lib/executors/gmail-executor.ts

import { GmailClient } from '@/lib/gmail-client';
import type { ExecutorFunction } from '../executor-registry';
import { z } from 'zod';

const gmailInputSchema = z.object({
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
  isHtml: z.boolean().optional().default(false),
});

export const gmailExecutor: ExecutorFunction = async ({
  data,
  userId,
  context,
  step,
}) => {
  return step.run('send-gmail', async () => {
    // Validate input
    const input = gmailInputSchema.parse(data);
    
    // Get Gmail client
    const gmailClient = await GmailClient.fromUserId(userId);
    
    // Send email
    const result = await gmailClient.sendEmail({
      to: input.to,
      subject: input.subject,
      body: input.body,
      isHtml: input.isHtml,
    });
    
    return {
      ...context,
      gmail: {
        messageId: result.messageId,
        to: input.to,
        subject: input.subject,
        sentAt: new Date().toISOString(),
      },
    };
  });
};
```

### Register Gmail Executor

```typescript
// src/features/executions/lib/executor-registry.ts

import { NodeType } from '@/generated/prisma';
import { gmailExecutor } from './executors/gmail-executor';
// ... other imports

const executors = new Map<NodeType, ExecutorFunction>();

// ... existing registrations

executors.set(NodeType.GMAIL, gmailExecutor);

export function getExecutor(type: NodeType): ExecutorFunction {
  const executor = executors.get(type);
  if (!executor) {
    throw new Error(`No executor found for node type: ${type}`);
  }
  return executor;
}
```

## Error Handling

### Error Handling Patterns

```typescript
// src/features/agent/lib/error-handler.ts

export class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public userMessage: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class CredentialMissingError extends AgentError {
  constructor(credentialType: string) {
    super(
      `Credential ${credentialType} not found`,
      'CREDENTIAL_MISSING',
      `Please connect your ${credentialType} account to use this feature. Go to Settings > Credentials to connect.`,
      false
    );
  }
}

export class RateLimitError extends AgentError {
  constructor(type: string, resetTime: Date) {
    super(
      `Rate limit exceeded for ${type}`,
      'RATE_LIMIT_EXCEEDED',
      `You've reached your daily limit for ${type}. Your limit will reset at ${resetTime.toLocaleString()}.`,
      false
    );
  }
}

export class ToolExecutionError extends AgentError {
  constructor(toolName: string, originalError: Error) {
    super(
      `Tool ${toolName} failed: ${originalError.message}`,
      'TOOL_EXECUTION_FAILED',
      `I encountered an error while using ${toolName}: ${originalError.message}. Please try again or rephrase your request.`,
      true
    );
  }
}

export class WorkflowValidationError extends AgentError {
  constructor(message: string) {
    super(
      `Workflow validation failed: ${message}`,
      'WORKFLOW_VALIDATION_FAILED',
      `I couldn't create the workflow: ${message}. Please check your request and try again.`,
      false
    );
  }
}

export function handleAgentError(error: unknown): string {
  if (error instanceof AgentError) {
    // Log for debugging
    console.error(`[${error.code}] ${error.message}`);
    
    // Return user-friendly message
    return error.userMessage;
  }
  
  if (error instanceof Error) {
    console.error('Unexpected error:', error);
    return 'I encountered an unexpected error. Please try again or contact support if the issue persists.';
  }
  
  console.error('Unknown error:', error);
  return 'An unknown error occurred. Please try again.';
}
```

### Error Recovery Strategies

```typescript
// src/features/agent/lib/error-recovery.ts

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    backoff?: 'linear' | 'exponential';
    initialDelay?: number;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const backoff = options.backoff ?? 'exponential';
  const initialDelay = options.initialDelay ?? 1000;
  
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = backoff === 'exponential'
          ? initialDelay * Math.pow(2, attempt)
          : initialDelay * (attempt + 1);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  key: string,
  options: {
    failureThreshold?: number;
    resetTimeout?: number;
  } = {}
): Promise<T> {
  // Simple in-memory circuit breaker
  // In production, use Redis or similar for distributed systems
  
  const failureThreshold = options.failureThreshold ?? 5;
  const resetTimeout = options.resetTimeout ?? 60000; // 1 minute
  
  const state = circuitBreakerState.get(key) || {
    failures: 0,
    lastFailure: null,
    state: 'closed',
  };
  
  // Check if circuit is open
  if (state.state === 'open') {
    const timeSinceLastFailure = Date.now() - (state.lastFailure || 0);
    if (timeSinceLastFailure < resetTimeout) {
      throw new Error(`Circuit breaker is open for ${key}`);
    }
    // Try to close circuit
    state.state = 'half-open';
  }
  
  try {
    const result = await fn();
    
    // Success - reset circuit
    state.failures = 0;
    state.state = 'closed';
    circuitBreakerState.set(key, state);
    
    return result;
  } catch (error) {
    // Failure - increment counter
    state.failures++;
    state.lastFailure = Date.now();
    
    if (state.failures >= failureThreshold) {
      state.state = 'open';
    }
    
    circuitBreakerState.set(key, state);
    throw error;
  }
}

const circuitBreakerState = new Map<string, {
  failures: number;
  lastFailure: number | null;
  state: 'open' | 'closed' | 'half-open';
}>();
```

## Security Design

### Encryption Strategy

All sensitive data is encrypted at rest using AES-256 encryption:

```typescript
// src/lib/encryption.ts (already exists, documented here)

import Cryptr from 'cryptr';

const cryptr = new Cryptr(process.env.ENCRYPTION_KEY!);

export const encrypt = (text: string): string => {
  return cryptr.encrypt(text);
};

export const decrypt = (text: string): string => {
  return cryptr.decrypt(text);
};

// Usage example:
// const encrypted = encrypt(JSON.stringify(tokens));
// const decrypted = JSON.parse(decrypt(encrypted));
```

**Encrypted Fields:**
- `Credential.value`: OAuth tokens, API keys
- Future: `Message.content` for sensitive conversations (optional)

### Token Management

```typescript
// src/lib/token-manager.ts

import prisma from './db';
import { decrypt, encrypt } from './encryption';
import { CredentialType } from '@/generated/prisma';

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
}

export class TokenManager {
  static async getToken(
    userId: string,
    type: CredentialType
  ): Promise<TokenData> {
    const credential = await prisma.credential.findFirst({
      where: { userId, type },
    });
    
    if (!credential) {
      throw new CredentialMissingError(type);
    }
    
    const tokenData: TokenData = JSON.parse(decrypt(credential.value));
    
    // Check if token is expired
    const expiresAt = new Date(tokenData.expiresAt);
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    
    if (expiresAt.getTime() - now.getTime() < bufferTime) {
      // Token is expired or about to expire, refresh it
      return this.refreshToken(credential.id, tokenData);
    }
    
    return tokenData;
  }
  
  static async refreshToken(
    credentialId: string,
    currentToken: TokenData
  ): Promise<TokenData> {
    // Refresh logic depends on the service
    // For Gmail, use GmailOAuthService
    const gmailOAuth = new GmailOAuthService();
    const newTokens = await gmailOAuth.refreshTokens(currentToken.refreshToken);
    
    const newTokenData: TokenData = {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt: newTokens.expiresAt.toISOString(),
      scope: newTokens.scope,
    };
    
    // Update in database
    await prisma.credential.update({
      where: { id: credentialId },
      data: {
        value: encrypt(JSON.stringify(newTokenData)),
      },
    });
    
    return newTokenData;
  }
  
  static async revokeToken(
    userId: string,
    type: CredentialType
  ): Promise<void> {
    await prisma.credential.deleteMany({
      where: { userId, type },
    });
  }
}
```

### Rate Limiting Middleware

```typescript
// src/lib/rate-limit-middleware.ts

import { TRPCError } from '@trpc/server';
import { checkRateLimit } from '@/features/agent/lib/rate-limiting';
import { UsageType } from '@/generated/prisma';

export function rateLimitMiddleware(type: UsageType, limit?: number) {
  return async (opts: any) => {
    const { ctx, next } = opts;
    
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in',
      });
    }
    
    try {
      await checkRateLimit(ctx.user.id, type, limit);
    } catch (error) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: error instanceof Error ? error.message : 'Rate limit exceeded',
      });
    }
    
    return next();
  };
}

// Usage in tRPC router:
// sendMessage: protectedProcedure
//   .use(rateLimitMiddleware('AGENT_MESSAGE', 100))
//   .input(...)
//   .mutation(...)
```

### Security Best Practices

1. **Environment Variables**: All secrets stored in `.env` file
   ```
   DATABASE_URL=postgresql://...
   ENCRYPTION_KEY=<32-byte-random-string>
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://yourdomain.com/api/oauth/gmail/callback
   BRAVE_SEARCH_API_KEY=...
   ```

2. **HTTPS Only**: All API communications use HTTPS in production

3. **Input Validation**: All user inputs validated with Zod schemas

4. **SQL Injection Prevention**: Prisma ORM prevents SQL injection

5. **XSS Prevention**: React automatically escapes content

6. **CSRF Protection**: Better Auth handles CSRF tokens

7. **Logging**: Never log sensitive data (tokens, passwords, email content)
   ```typescript
   // BAD
   console.log('Sending email:', { to, subject, body, token });
   
   // GOOD
   console.log('Sending email:', { to, subject });
   ```

8. **Data Deletion**: Cascade deletes ensure complete data removal
   ```prisma
   user User @relation(fields: [userId], references: [id], onDelete: Cascade)
   ```

## Testing Strategy

### Unit Tests

Focus on testing individual components in isolation:

1. **Tool Execution**: Test each tool's execute function with various inputs
2. **Schedule Parser**: Test natural language to cron conversion
3. **Token Manager**: Test token refresh logic
4. **Error Handlers**: Test error message generation

Example:
```typescript
// src/features/agent/tools/__tests__/memory-tool.test.ts

import { memoryTool } from '../memory-tool';
import { mockDeep } from 'jest-mock-extended';
import type { PrismaClient } from '@/generated/prisma';

describe('memoryTool', () => {
  it('should store a fact', async () => {
    const mockDb = mockDeep<PrismaClient>();
    const context = {
      userId: 'user-1',
      sessionId: 'session-1',
      db: mockDb,
    };
    
    const result = await memoryTool.execute(
      { action: 'store', key: 'favorite_color', value: 'blue' },
      context
    );
    
    expect(result).toEqual({
      success: true,
      key: 'favorite_color',
      value: 'blue',
    });
    
    expect(mockDb.userProfile.upsert).toHaveBeenCalled();
  });
  
  it('should retrieve a fact', async () => {
    const mockDb = mockDeep<PrismaClient>();
    mockDb.userProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      facts: {
        favorite_color: { value: 'blue', timestamp: '2024-01-01' },
      },
      // ... other fields
    });
    
    const context = {
      userId: 'user-1',
      sessionId: 'session-1',
      db: mockDb,
    };
    
    const result = await memoryTool.execute(
      { action: 'retrieve', key: 'favorite_color' },
      context
    );
    
    expect(result).toBe('blue');
  });
});
```

### Integration Tests

Test interactions between components:

1. **Agent Flow**: Test complete message → tool execution → response flow
2. **OAuth Flow**: Test authorization → callback → token storage
3. **Workflow Execution**: Test workflow creation → scheduling → execution
4. **Gmail Integration**: Test email sending with real Gmail API (sandbox)

Example:
```typescript
// src/features/agent/__tests__/agent-service.integration.test.ts

import { AgentService } from '../lib/agent-service';
import { toolRegistry } from '../lib/tool-registry';
import prisma from '@/lib/db';

describe('AgentService Integration', () => {
  it('should execute memory tool and respond', async () => {
    const agentService = new AgentService();
    
    const stream = await agentService.sendMessage(
      'Remember that my favorite color is blue',
      {
        userId: 'test-user',
        sessionId: 'test-session',
        systemPrompt: 'You are a helpful assistant.',
        tools: toolRegistry.getAll(),
      }
    );
    
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    // Verify tool was called
    const toolCalls = chunks.filter(c => c.type === 'tool_call');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].toolCall.name).toBe('memory');
    
    // Verify response was generated
    const textChunks = chunks.filter(c => c.type === 'text');
    expect(textChunks.length).toBeGreaterThan(0);
  });
});
```

### End-to-End Tests

Test complete user workflows:

1. **Onboarding**: New user → profile setup → service connection
2. **Email Workflow**: User request → draft → approval → send
3. **Scheduled Workflow**: Create workflow → schedule → automatic execution
4. **Error Recovery**: Failed tool → error message → retry

Example using Playwright:
```typescript
// e2e/agent-chat.spec.ts

import { test, expect } from '@playwright/test';

test('user can send message and get response', async ({ page }) => {
  await page.goto('/chat');
  
  // Type message
  await page.fill('[data-testid="message-input"]', 'Hello, what can you do?');
  await page.click('[data-testid="send-button"]');
  
  // Wait for response
  await page.waitForSelector('[data-testid="assistant-message"]');
  
  // Verify response contains capabilities
  const response = await page.textContent('[data-testid="assistant-message"]');
  expect(response).toContain('workflow');
  expect(response).toContain('email');
});
```

## Error Handling

### Comprehensive Error Scenarios



| Error Type | Cause | User Message | Recovery Action |
|------------|-------|--------------|-----------------|
| Credential Missing | User hasn't connected service | "Please connect your Gmail account to send emails. Go to Settings > Credentials." | Redirect to credentials page |
| Token Expired | OAuth token expired and refresh failed | "Your Gmail connection has expired. Please reconnect your account." | Prompt to reconnect |
| Rate Limit Exceeded | User exceeded daily quota | "You've reached your daily limit for email sends (50/day). Resets at midnight." | Show usage stats |
| Tool Execution Failed | API error, network issue | "I couldn't complete that action due to a temporary error. Please try again." | Retry with backoff |
| Workflow Validation Failed | Missing nodes, invalid connections | "I couldn't create the workflow: Missing required credential for Gmail node." | Request missing info |
| Schedule Parse Failed | Invalid schedule format | "I couldn't understand the schedule 'every blue moon'. Try 'every Monday at 9am'." | Provide examples |
| Max Iterations Reached | Agent stuck in loop | "I'm having trouble completing this request. Please try breaking it into smaller steps." | Suggest simplification |
| Database Error | Connection lost, constraint violation | "A database error occurred. Please try again or contact support." | Log error, retry |

### Error Logging

```typescript
// src/lib/logger.ts

import * as Sentry from '@sentry/nextjs';

export interface LogContext {
  userId?: string;
  sessionId?: string;
  toolName?: string;
  workflowId?: string;
  [key: string]: any;
}

export class Logger {
  static info(message: string, context?: LogContext): void {
    console.log(`[INFO] ${message}`, context);
  }
  
  static warn(message: string, context?: LogContext): void {
    console.warn(`[WARN] ${message}`, context);
    Sentry.captureMessage(message, {
      level: 'warning',
      extra: context,
    });
  }
  
  static error(message: string, error: Error, context?: LogContext): void {
    // Never log sensitive data
    const sanitizedContext = this.sanitizeContext(context);
    
    console.error(`[ERROR] ${message}`, error, sanitizedContext);
    
    Sentry.captureException(error, {
      extra: {
        message,
        ...sanitizedContext,
      },
    });
  }
  
  private static sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;
    
    const sanitized = { ...context };
    
    // Remove sensitive fields
    const sensitiveKeys = ['token', 'password', 'accessToken', 'refreshToken', 'apiKey'];
    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        delete sanitized[key];
      }
    }
    
    return sanitized;
  }
}
```

## Deployment Considerations

### Environment Variables

```bash
# .env.example

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/orcha

# Encryption
ENCRYPTION_KEY=<32-byte-random-string>

# Authentication
BETTER_AUTH_SECRET=<random-string>
BETTER_AUTH_URL=http://localhost:3000

# AI Services
ANTHROPIC_API_KEY=sk-ant-...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/oauth/gmail/callback

# Search
BRAVE_SEARCH_API_KEY=...

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Monitoring
SENTRY_DSN=...
```

### Database Migrations

```bash
# Generate migration
npx prisma migrate dev --name add_agent_tables

# Apply migration in production
npx prisma migrate deploy
```

### Deployment Checklist

1. **Environment Setup**
   - [ ] Set all environment variables
   - [ ] Generate secure ENCRYPTION_KEY
   - [ ] Configure Google OAuth redirect URI
   - [ ] Set up Sentry for error tracking

2. **Database**
   - [ ] Run migrations
   - [ ] Set up connection pooling
   - [ ] Configure backups

3. **Inngest**
   - [ ] Deploy Inngest functions
   - [ ] Configure cron job for scheduled workflows
   - [ ] Set up monitoring

4. **Security**
   - [ ] Enable HTTPS
   - [ ] Configure CORS
   - [ ] Set up rate limiting
   - [ ] Review security headers

5. **Monitoring**
   - [ ] Set up application monitoring
   - [ ] Configure error alerts
   - [ ] Set up usage tracking dashboard

## Performance Considerations

### Database Optimization

1. **Indexes**: Add indexes for common queries
   ```prisma
   @@index([userId, createdAt])
   @@index([nextExecution, isActive])
   ```

2. **Connection Pooling**: Configure Prisma connection pool
   ```typescript
   // prisma/schema.prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
     // Add connection pool settings
   }
   ```

3. **Query Optimization**: Use `select` to fetch only needed fields
   ```typescript
   const sessions = await prisma.chatSession.findMany({
     select: {
       id: true,
       title: true,
       updatedAt: true,
     },
   });
   ```

### Caching Strategy

```typescript
// src/lib/cache.ts

import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export class Cache {
  static async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  static async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await redis.setex(key, ttl, JSON.stringify(value));
  }
  
  static async delete(key: string): Promise<void> {
    await redis.del(key);
  }
}

// Usage: Cache user profiles
const cacheKey = `user-profile:${userId}`;
let profile = await Cache.get(cacheKey);

if (!profile) {
  profile = await prisma.userProfile.findUnique({ where: { userId } });
  await Cache.set(cacheKey, profile, 3600); // 1 hour TTL
}
```

### Streaming Optimization

```typescript
// Stream responses to reduce perceived latency
export async function* streamAgentResponse(
  message: string,
  config: AgentServiceConfig
): AsyncIterable<string> {
  const stream = await agentService.sendMessage(message, config);
  
  for await (const chunk of stream) {
    if (chunk.type === 'text') {
      yield chunk.content;
    }
  }
}
```

## Future Enhancements

### Phase 2: Additional Integrations

1. **Google Calendar**
   - OAuth flow similar to Gmail
   - Tools: create_event, check_availability, list_events
   - Node executor for calendar operations

2. **WhatsApp**
   - Integration with WhatsApp Business API
   - Tools: send_whatsapp_message
   - Support for message templates

3. **LinkedIn**
   - OAuth flow for LinkedIn API
   - Tools: create_post, send_message
   - Professional tone enforcement

### Phase 3: Advanced Features

1. **Voice Interface**
   - Speech-to-text for voice commands
   - Text-to-speech for responses
   - Integration with phone systems

2. **Multi-Agent Collaboration**
   - Specialized agents for different domains
   - Agent-to-agent communication
   - Coordinated task execution

3. **Learning and Personalization**
   - Feedback loop for improving responses
   - Style adaptation based on user corrections
   - Proactive suggestions based on patterns

4. **Advanced Workflow Features**
   - Conditional branching
   - Loops and iterations
   - Error handling and retries
   - Parallel execution

### Phase 4: Enterprise Features

1. **Team Collaboration**
   - Shared workflows
   - Team credentials
   - Role-based access control

2. **Audit Logging**
   - Complete action history
   - Compliance reporting
   - Data retention policies

3. **Custom Integrations**
   - SDK for building custom tools
   - Webhook support
   - API for external systems

## Migration Path

### Migrating Existing Users

For users with existing workflows:

1. **Database Migration**: Run Prisma migrations to add new tables
2. **No Breaking Changes**: Existing workflows continue to work
3. **Opt-in Features**: Users can start using agent features when ready
4. **Data Preservation**: All existing data remains intact

### Rollout Strategy

1. **Phase 1: Internal Testing** (Week 1-2)
   - Deploy to staging environment
   - Test with internal team
   - Fix critical bugs

2. **Phase 2: Beta Users** (Week 3-4)
   - Invite 10-20 beta users
   - Gather feedback
   - Iterate on UX

3. **Phase 3: Limited Release** (Week 5-6)
   - Release to 10% of users
   - Monitor performance and errors
   - Adjust rate limits

4. **Phase 4: Full Release** (Week 7+)
   - Release to all users
   - Announce new features
   - Provide documentation and tutorials

## Appendix

### Complete File Checklist

#### New Files to Create

**Agent Feature:**
- [ ] `src/features/agent/api/agent-router.ts`
- [ ] `src/features/agent/api/user-profile-router.ts`
- [ ] `src/features/agent/lib/agent-service.ts`
- [ ] `src/features/agent/lib/system-prompt.ts`
- [ ] `src/features/agent/lib/tool-registry.ts`
- [ ] `src/features/agent/lib/rate-limiting.ts`
- [ ] `src/features/agent/lib/error-handler.ts`
- [ ] `src/features/agent/lib/error-recovery.ts`
- [ ] `src/features/agent/tools/memory-tool.ts`
- [ ] `src/features/agent/tools/search-tool.ts`
- [ ] `src/features/agent/tools/gmail-tool.ts`
- [ ] `src/features/agent/tools/workflow-tool.ts`
- [ ] `src/features/agent/components/chat-interface.tsx`
- [ ] `src/features/agent/components/message-list.tsx`
- [ ] `src/features/agent/components/message-input.tsx`
- [ ] `src/features/agent/components/tool-execution-card.tsx`

**OAuth Feature:**
- [ ] `src/features/oauth/api/oauth-router.ts`
- [ ] `src/features/oauth/lib/gmail-oauth.ts`
- [ ] `src/features/oauth/lib/oauth-service.ts`
- [ ] `src/features/oauth/components/connect-service-button.tsx`
- [ ] `src/app/api/oauth/gmail/callback/route.ts`

**Scheduled Workflows:**
- [ ] `src/features/scheduled-workflows/api/scheduled-workflow-router.ts`
- [ ] `src/features/scheduled-workflows/lib/cron-service.ts`
- [ ] `src/features/scheduled-workflows/lib/schedule-parser.ts`
- [ ] `src/inngest/scheduled-workflows.ts`

**Gmail Integration:**
- [ ] `src/lib/gmail-client.ts`
- [ ] `src/features/executions/lib/executors/gmail-executor.ts`

**Utilities:**
- [ ] `src/lib/token-manager.ts`
- [ ] `src/lib/rate-limit-middleware.ts`
- [ ] `src/lib/logger.ts`
- [ ] `src/lib/cache.ts` (optional, if using Redis)

**UI Pages:**
- [ ] `src/app/(dashboard)/(chat)/page.tsx`
- [ ] `src/app/(dashboard)/(chat)/[sessionId]/page.tsx`

#### Files to Modify

- [ ] `prisma/schema.prisma` - Add new models
- [ ] `src/trpc/routers/index.ts` - Register new routers
- [ ] `src/features/executions/lib/executor-registry.ts` - Register Gmail executor
- [ ] `src/inngest/functions.ts` - Import scheduled workflow function
- [ ] `src/app/(dashboard)/layout.tsx` - Add chat navigation
- [ ] `.env.example` - Add new environment variables

### API Endpoint Summary

**tRPC Endpoints:**
- `agent.sendMessage` - Send message to agent (streaming)
- `agent.createSession` - Create new chat session
- `agent.listSessions` - List user's chat sessions
- `agent.getSession` - Get session with messages
- `agent.deleteSession` - Delete a session
- `oauth.getGmailAuthUrl` - Get Gmail OAuth URL
- `oauth.listConnectedServices` - List connected services
- `oauth.revokeService` - Revoke service access
- `scheduledWorkflow.create` - Create scheduled workflow
- `scheduledWorkflow.list` - List scheduled workflows
- `scheduledWorkflow.toggleActive` - Enable/disable workflow
- `scheduledWorkflow.delete` - Delete scheduled workflow
- `userProfile.get` - Get user profile
- `userProfile.update` - Update user profile
- `userProfile.addFact` - Add fact to profile
- `userProfile.deleteAll` - Delete all user data

**REST Endpoints:**
- `GET /api/oauth/gmail/callback` - Gmail OAuth callback

**Inngest Functions:**
- `execute-workflow` - Execute workflow (existing)
- `check-scheduled-workflows` - Check and trigger scheduled workflows (new)

### Database Schema Summary

**New Tables:**
- `ChatSession` - Chat conversation threads
- `Message` - Individual messages in conversations
- `UserProfile` - User context and preferences
- `ScheduledWorkflow` - Scheduled workflow executions
- `UsageTracking` - Rate limiting and usage tracking

**New Enums:**
- `MessageRole` - USER, ASSISTANT, SYSTEM
- `UsageType` - AGENT_MESSAGE, GMAIL_SEND, WEB_SEARCH, WORKFLOW_EXECUTION

**Updated Enums:**
- `CredentialType` - Add GMAIL, GOOGLE_CALENDAR, WHATSAPP, LINKEDIN
- `NodeType` - Add GMAIL

### Environment Variables Summary

```bash
# Required for Agent System
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/oauth/gmail/callback
BRAVE_SEARCH_API_KEY=...

# Optional for Enhanced Features
REDIS_URL=redis://localhost:6379
SENTRY_DSN=...
```

### Dependencies to Install

```bash
npm install @anthropic-ai/sdk googleapis cron-parser
```

### Key Design Decisions

1. **Why Claude?** - Best-in-class tool use, streaming support, large context window
2. **Why Inngest?** - Already integrated, handles retries and scheduling
3. **Why Prisma?** - Type-safe, migrations, already in use
4. **Why tRPC?** - Type-safe API, streaming support, already in use
5. **Why AES-256?** - Industry standard, fast, secure for at-rest encryption
6. **Why Cron?** - Simple, reliable, widely understood scheduling format

### Success Metrics

1. **User Engagement**
   - Daily active users using agent
   - Messages per session
   - Tool usage distribution

2. **Workflow Creation**
   - Workflows created via agent vs. manual
   - Scheduled workflows created
   - Workflow execution success rate

3. **Performance**
   - Average response time
   - Tool execution latency
   - Error rate

4. **User Satisfaction**
   - User feedback ratings
   - Feature adoption rate
   - Support ticket volume



## Testing Strategy

### Why Property-Based Testing Is Not Applicable

This feature is **not suitable for property-based testing** because it primarily consists of:

1. **Infrastructure as Code**: OAuth flows, API integrations, database operations
2. **External Service Interactions**: Claude API, Gmail API, search APIs, Inngest
3. **UI Components**: Chat interface, message rendering
4. **Side-Effect Operations**: Sending emails, creating workflows, storing credentials
5. **Orchestration Logic**: Workflow execution, scheduling, error handling

Property-based testing works best for pure functions with clear input/output behavior and universal properties. This system is inherently stateful, side-effect heavy, and dependent on external services.

### Recommended Testing Approach

#### 1. Unit Tests

Test individual components in isolation with mocked dependencies:

**Tool Execution Tests:**
```typescript
describe('memoryTool', () => {
  it('stores a fact in user profile', async () => {
    const mockDb = mockDeep<PrismaClient>();
    const result = await memoryTool.execute(
      { action: 'store', key: 'favorite_color', value: 'blue' },
      { userId: 'user-1', sessionId: 'session-1', db: mockDb }
    );
    expect(result.success).toBe(true);
    expect(mockDb.userProfile.upsert).toHaveBeenCalled();
  });
  
  it('retrieves a stored fact', async () => {
    const mockDb = mockDeep<PrismaClient>();
    mockDb.userProfile.findUnique.mockResolvedValue({
      facts: { favorite_color: { value: 'blue' } }
    });
    const result = await memoryTool.execute(
      { action: 'retrieve', key: 'favorite_color' },
      { userId: 'user-1', sessionId: 'session-1', db: mockDb }
    );
    expect(result).toBe('blue');
  });
});
```

**Schedule Parser Tests:**
```typescript
describe('ScheduleParser', () => {
  it('parses "every Monday at 9am"', () => {
    const parser = new ScheduleParser();
    const result = parser.parse('every Monday at 9am');
    expect(result.cronExpression).toBe('0 9 * * 1');
    expect(result.humanReadable).toBe('Every Monday at 9am');
  });
  
  it('parses "daily at 3pm"', () => {
    const parser = new ScheduleParser();
    const result = parser.parse('daily at 3pm');
    expect(result.cronExpression).toBe('0 15 * * *');
  });
  
  it('throws error for invalid schedule', () => {
    const parser = new ScheduleParser();
    expect(() => parser.parse('every blue moon')).toThrow();
  });
});
```

**Rate Limiting Tests:**
```typescript
describe('checkRateLimit', () => {
  it('allows request under limit', async () => {
    const mockDb = mockDeep<PrismaClient>();
    mockDb.usageTracking.findUnique.mockResolvedValue({
      count: 50,
      // ... other fields
    });
    await expect(
      checkRateLimit('user-1', 'AGENT_MESSAGE', 100)
    ).resolves.not.toThrow();
  });
  
  it('throws error when limit exceeded', async () => {
    const mockDb = mockDeep<PrismaClient>();
    mockDb.usageTracking.findUnique.mockResolvedValue({
      count: 100,
      // ... other fields
    });
    await expect(
      checkRateLimit('user-1', 'AGENT_MESSAGE', 100)
    ).rejects.toThrow('Rate limit exceeded');
  });
});
```

**Error Handler Tests:**
```typescript
describe('handleAgentError', () => {
  it('returns user-friendly message for CredentialMissingError', () => {
    const error = new CredentialMissingError('GMAIL');
    const message = handleAgentError(error);
    expect(message).toContain('connect your GMAIL account');
  });
  
  it('returns generic message for unknown errors', () => {
    const error = new Error('Database connection failed');
    const message = handleAgentError(error);
    expect(message).toContain('unexpected error');
  });
});
```

#### 2. Integration Tests

Test interactions between components with real database (test environment):

**Agent Service Integration:**
```typescript
describe('AgentService Integration', () => {
  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "message" CASCADE`;
    await prisma.$executeRaw`TRUNCATE TABLE "chat_session" CASCADE`;
  });
  
  it('executes memory tool and stores fact', async () => {
    const agentService = new AgentService();
    const stream = await agentService.sendMessage(
      'Remember that my favorite color is blue',
      {
        userId: 'test-user',
        sessionId: 'test-session',
        systemPrompt: getSystemPrompt('test-user'),
        tools: toolRegistry.getAll(),
      }
    );
    
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    // Verify tool was called
    const toolCalls = chunks.filter(c => c.type === 'tool_call');
    expect(toolCalls.some(tc => tc.toolCall.name === 'memory')).toBe(true);
    
    // Verify fact was stored
    const profile = await prisma.userProfile.findUnique({
      where: { userId: 'test-user' }
    });
    expect(profile?.facts).toHaveProperty('favorite_color');
  });
});
```

**OAuth Flow Integration:**
```typescript
describe('Gmail OAuth Flow', () => {
  it('exchanges code for tokens and stores credential', async () => {
    const gmailOAuth = new GmailOAuthService();
    
    // Mock Google OAuth response
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(200, {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.send',
      });
    
    const tokens = await gmailOAuth.exchangeCodeForTokens('mock-code');
    
    expect(tokens.accessToken).toBe('mock-access-token');
    expect(tokens.refreshToken).toBe('mock-refresh-token');
  });
});
```

**Scheduled Workflow Execution:**
```typescript
describe('Scheduled Workflow Execution', () => {
  it('triggers workflow when due', async () => {
    // Create a scheduled workflow due now
    const workflow = await prisma.workflow.create({
      data: {
        name: 'Test Workflow',
        userId: 'test-user',
      },
    });
    
    await prisma.scheduledWorkflow.create({
      data: {
        workflowId: workflow.id,
        userId: 'test-user',
        cronExpression: '* * * * *',
        description: 'Test',
        timezone: 'UTC',
        nextExecution: new Date(Date.now() - 1000), // 1 second ago
      },
    });
    
    // Run cron job
    const result = await checkScheduledWorkflows.invoke({});
    
    expect(result.success).toBeGreaterThan(0);
    
    // Verify workflow was triggered
    const execution = await prisma.execution.findFirst({
      where: { workflowId: workflow.id },
    });
    expect(execution).toBeTruthy();
  });
});
```

#### 3. End-to-End Tests

Test complete user workflows using Playwright:

**Chat Flow:**
```typescript
test('user can send message and receive response', async ({ page }) => {
  await page.goto('/chat');
  
  // Send message
  await page.fill('[data-testid="message-input"]', 'Hello, what can you do?');
  await page.click('[data-testid="send-button"]');
  
  // Wait for response
  await page.waitForSelector('[data-testid="assistant-message"]');
  
  // Verify response
  const response = await page.textContent('[data-testid="assistant-message"]');
  expect(response).toContain('workflow');
});

test('user can connect Gmail account', async ({ page }) => {
  await page.goto('/credentials');
  
  // Click connect Gmail
  await page.click('[data-testid="connect-gmail"]');
  
  // Should redirect to Google OAuth
  await page.waitForURL(/accounts\.google\.com/);
  
  // Mock OAuth flow (in test environment)
  // ... complete OAuth flow ...
  
  // Verify credential was added
  await page.goto('/credentials');
  await expect(page.locator('text=Gmail')).toBeVisible();
});

test('user can create workflow via agent', async ({ page }) => {
  await page.goto('/chat');
  
  // Request workflow creation
  await page.fill(
    '[data-testid="message-input"]',
    'Create a workflow that sends me a daily email summary at 9am'
  );
  await page.click('[data-testid="send-button"]');
  
  // Wait for agent response
  await page.waitForSelector('text=workflow');
  
  // Verify workflow was created
  await page.goto('/workflows');
  await expect(page.locator('text=daily email summary')).toBeVisible();
});
```

#### 4. API Tests

Test API endpoints directly:

**tRPC Endpoint Tests:**
```typescript
describe('Agent Router', () => {
  it('creates chat session', async () => {
    const caller = appRouter.createCaller({
      user: { id: 'test-user' },
      db: prisma,
    });
    
    const session = await caller.agent.createSession({
      title: 'Test Session',
    });
    
    expect(session.id).toBeDefined();
    expect(session.title).toBe('Test Session');
  });
  
  it('lists user sessions', async () => {
    const caller = appRouter.createCaller({
      user: { id: 'test-user' },
      db: prisma,
    });
    
    // Create sessions
    await caller.agent.createSession({ title: 'Session 1' });
    await caller.agent.createSession({ title: 'Session 2' });
    
    const result = await caller.agent.listSessions({ limit: 10 });
    
    expect(result.sessions).toHaveLength(2);
  });
});
```

#### 5. Mock-Based Tests for External Services

Test external service integrations with mocks:

**Gmail API Tests:**
```typescript
describe('GmailClient', () => {
  it('sends email successfully', async () => {
    const mockGmail = {
      users: {
        messages: {
          send: jest.fn().mockResolvedValue({
            data: { id: 'message-123' },
          }),
        },
      },
    };
    
    // Mock googleapis
    jest.mock('googleapis', () => ({
      google: {
        gmail: () => mockGmail,
        auth: {
          OAuth2: jest.fn(),
        },
      },
    }));
    
    const client = new GmailClient(mockCredential, 'cred-1');
    const result = await client.sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Hello',
    });
    
    expect(result.messageId).toBe('message-123');
    expect(mockGmail.users.messages.send).toHaveBeenCalled();
  });
  
  it('refreshes expired token', async () => {
    const expiredCredential = {
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      scope: 'gmail.send',
    };
    
    // Mock token refresh
    const mockOAuth = {
      refreshAccessToken: jest.fn().mockResolvedValue({
        credentials: {
          access_token: 'new-token',
          expiry_date: Date.now() + 3600000,
        },
      }),
    };
    
    const client = new GmailClient(expiredCredential, 'cred-1');
    await client.refreshAccessToken();
    
    expect(mockOAuth.refreshAccessToken).toHaveBeenCalled();
  });
});
```

**Claude API Tests:**
```typescript
describe('AgentService with Claude', () => {
  it('handles tool use correctly', async () => {
    const mockAnthropic = {
      messages: {
        create: jest.fn()
          .mockResolvedValueOnce({
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'memory',
                input: { action: 'store', key: 'test', value: 'value' },
              },
            ],
            stop_reason: 'tool_use',
          })
          .mockResolvedValueOnce({
            content: [
              { type: 'text', text: 'I stored that information.' },
            ],
            stop_reason: 'end_turn',
          }),
      },
    };
    
    const agentService = new AgentService();
    // ... test tool execution flow ...
  });
});
```

### Test Coverage Goals

- **Unit Tests**: 80%+ coverage for business logic
- **Integration Tests**: Cover all critical paths (OAuth, workflow creation, tool execution)
- **E2E Tests**: Cover main user journeys (chat, workflow creation, service connection)
- **API Tests**: 100% coverage of tRPC endpoints

### Continuous Integration

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      
      - name: Run E2E tests
        run: npm run test:e2e
```

## Conclusion

This design provides a comprehensive blueprint for transforming Orcha into a personal AI agent system. The architecture maintains separation of concerns, leverages existing infrastructure, and provides a clear path for implementation.

### Key Takeaways

1. **Modular Design**: Tool system allows easy extension of agent capabilities
2. **Security First**: All credentials encrypted, tokens auto-refreshed, sensitive data never logged
3. **User Control**: Agent always confirms before taking actions
4. **Scalable**: Rate limiting, caching, and connection pooling for production readiness
5. **Testable**: Comprehensive testing strategy with unit, integration, and E2E tests

### Implementation Priority

**Phase 1 (Weeks 1-2): Core Agent System**
1. Database schema and migrations
2. Agent service with Claude integration
3. Tool registry and basic tools (memory, search)
4. Chat interface UI
5. Basic error handling

**Phase 2 (Weeks 3-4): Gmail Integration**
1. OAuth flow implementation
2. Gmail client and API wrapper
3. Gmail tool and node executor
4. Email drafting and approval flow

**Phase 3 (Weeks 5-6): Workflow Automation**
1. Workflow creation tool
2. Schedule parser
3. Scheduled workflow cron job
4. Workflow validation

**Phase 4 (Weeks 7-8): Polish and Launch**
1. Rate limiting and usage tracking
2. Error recovery and retry logic
3. Comprehensive testing
4. Documentation and tutorials
5. Beta release

### Success Criteria

The implementation will be considered successful when:

1. ✅ Users can chat with the agent and get helpful responses
2. ✅ Agent can remember user context across sessions
3. ✅ Users can connect Gmail and send emails via agent
4. ✅ Agent can create and schedule workflows from natural language
5. ✅ All credentials are encrypted and securely stored
6. ✅ Rate limits prevent abuse and control costs
7. ✅ Error messages are clear and actionable
8. ✅ System is stable with <1% error rate
9. ✅ Average response time <2 seconds
10. ✅ 80%+ test coverage

This design is ready for implementation. All components are well-defined with clear interfaces, file paths, and implementation details.
