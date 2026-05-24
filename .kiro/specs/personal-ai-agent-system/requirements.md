# Requirements Document

## Introduction

This document specifies the requirements for transforming Orcha from a visual workflow automation platform into a personal AI agent system. The system will enable users to interact with an AI assistant through natural language, which can understand context, remember user preferences, execute tasks autonomously across connected applications (Gmail, WhatsApp, LinkedIn, Calendar), and create both one-time actions and recurring workflows on behalf of the user.

The transformation maintains the existing workflow execution engine while adding a conversational AI layer that can generate and execute workflows programmatically based on natural language commands.

## Glossary

- **Agent**: The AI assistant powered by Claude that interprets user commands and executes tasks
- **Chat_Session**: A conversation thread between the user and the Agent
- **User_Profile**: Persistent storage of user context, preferences, and personal information
- **Tool**: A capability the Agent can invoke (web search, memory retrieval, Gmail operations, workflow creation)
- **Credential**: OAuth tokens or API keys stored securely for third-party service access
- **Scheduled_Workflow**: A recurring automation created by the Agent that executes on a defined schedule
- **One_Shot_Action**: An immediate task executed by the Agent without creating a persistent workflow
- **Agentic_Loop**: The iterative process where the Agent reasons, selects tools, executes them, and continues until task completion
- **System_Prompt**: Instructions that define the Agent's behavior, capabilities, and personality
- **Memory_System**: The Agent's ability to store and retrieve user context across sessions
- **OAuth_Flow**: The authentication process for connecting third-party services
- **Workflow_Engine**: The existing Inngest-based execution system that runs workflow nodes

## Requirements

### Requirement 1: User Profile Management

**User Story:** As a user, I want the Agent to remember information about me, so that it can personalize responses and execute tasks with proper context.

#### Acceptance Criteria

1. THE User_Profile SHALL store user context including name, occupation, location, preferences, and custom facts
2. WHEN a user shares personal information during conversation, THE Agent SHALL extract and store relevant facts in the User_Profile
3. WHEN the Agent needs context to execute a task, THE Agent SHALL retrieve relevant information from the User_Profile
4. THE User_Profile SHALL support structured fields (name, email, occupation) and unstructured key-value pairs for custom facts
5. WHEN a user updates personal information, THE Agent SHALL update the User_Profile with the new information

### Requirement 2: Conversational Chat Interface

**User Story:** As a user, I want to interact with the Agent through natural language, so that I can request tasks without learning technical syntax.

#### Acceptance Criteria

1. THE Chat_Interface SHALL display messages in chronological order with clear sender identification
2. WHEN a user submits a message, THE Chat_Interface SHALL send it to the Agent and display the response
3. THE Chat_Interface SHALL support markdown formatting in Agent responses
4. THE Chat_Interface SHALL display typing indicators while the Agent is processing
5. WHEN the Agent executes a tool, THE Chat_Interface SHALL display the tool name and result
6. THE Chat_Session SHALL persist message history for future reference
7. THE Chat_Interface SHALL support creating new chat sessions and viewing past sessions

### Requirement 3: Agent Core Reasoning

**User Story:** As a user, I want the Agent to understand my requests and determine the appropriate actions, so that I don't have to specify implementation details.

#### Acceptance Criteria

1. WHEN a user sends a message, THE Agent SHALL analyze the request using the System_Prompt and available tools
2. THE Agent SHALL determine whether to respond directly, execute a one-shot action, or create a workflow
3. WHEN multiple tools are needed, THE Agent SHALL execute them in the Agentic_Loop until the task is complete
4. THE Agent SHALL provide clear explanations of actions taken and results achieved
5. IF a request is ambiguous, THEN THE Agent SHALL ask clarifying questions before proceeding
6. THE Agent SHALL maintain conversation context within a Chat_Session

### Requirement 4: Memory and Context Retrieval

**User Story:** As a user, I want the Agent to remember past conversations and facts about me, so that I don't have to repeat information.

#### Acceptance Criteria

1. THE Memory_System SHALL store user facts, preferences, and important conversation details
2. WHEN the Agent needs context, THE Memory_System SHALL retrieve relevant facts based on semantic similarity
3. THE Memory_System SHALL support querying by keywords or natural language descriptions
4. WHEN a user references past information, THE Agent SHALL retrieve it from the Memory_System
5. THE Memory_System SHALL store facts with timestamps for temporal context

### Requirement 5: Web Search Capability

**User Story:** As a user, I want the Agent to search the web for current information, so that I can get answers beyond its training data.

#### Acceptance Criteria

1. WHEN the Agent needs current information, THE Agent SHALL execute a web search using the search tool
2. THE Agent SHALL synthesize search results into coherent answers
3. THE Agent SHALL cite sources when providing information from web searches
4. THE Agent SHALL handle search failures gracefully and inform the user

### Requirement 6: Gmail Integration

**User Story:** As a user, I want the Agent to send emails on my behalf, so that I can communicate without leaving the chat interface.

#### Acceptance Criteria

1. THE System SHALL provide an OAuth_Flow for users to connect their Gmail account
2. WHEN a user requests to send an email, THE Agent SHALL compose the email using context from the User_Profile
3. THE Agent SHALL use the Gmail API to send emails with proper authentication
4. THE Agent SHALL confirm successful email delivery to the user
5. IF Gmail authentication fails, THEN THE Agent SHALL prompt the user to reconnect their account
6. THE Agent SHALL draft emails in the user's writing style based on past examples stored in the User_Profile

### Requirement 7: Credential Management

**User Story:** As a developer, I want OAuth tokens and API keys stored securely, so that user data is protected.

#### Acceptance Criteria

1. THE System SHALL encrypt all Credential values using AES-256 encryption before database storage
2. THE System SHALL store OAuth refresh tokens for long-term access to third-party services
3. WHEN an access token expires, THE System SHALL automatically refresh it using the refresh token
4. THE System SHALL provide a UI for users to view connected services and revoke access
5. THE Credential SHALL be associated with a specific user and service type

### Requirement 8: Workflow Creation from Natural Language

**User Story:** As a user, I want the Agent to create workflows from my descriptions, so that I can automate tasks without manual configuration.

#### Acceptance Criteria

1. WHEN a user describes a recurring automation, THE Agent SHALL generate a workflow with appropriate nodes and connections
2. THE Agent SHALL use the existing Workflow_Engine schema (Node, Connection, Workflow tables)
3. THE Agent SHALL validate that all required credentials are available before creating the workflow
4. THE Agent SHALL provide a summary of the created workflow to the user
5. THE Agent SHALL store the workflow in the database for execution by the Workflow_Engine

### Requirement 9: Scheduled Workflow Execution

**User Story:** As a user, I want workflows to run automatically on a schedule, so that I don't have to manually trigger them.

#### Acceptance Criteria

1. THE Scheduled_Workflow SHALL store the workflow ID, schedule expression (cron format), and next execution time
2. THE System SHALL run a cron job that checks for due Scheduled_Workflows every minute
3. WHEN a Scheduled_Workflow is due, THE System SHALL trigger the associated workflow using the Workflow_Engine
4. WHEN a Scheduled_Workflow completes, THE System SHALL calculate and update the next execution time
5. THE System SHALL handle execution failures and retry with exponential backoff

### Requirement 10: One-Shot Action Execution

**User Story:** As a user, I want the Agent to execute immediate tasks without creating persistent workflows, so that simple requests are handled quickly.

#### Acceptance Criteria

1. WHEN a user requests a one-time action, THE Agent SHALL execute it directly using available tools
2. THE Agent SHALL not create a workflow entry in the database for one-shot actions
3. THE Agent SHALL provide immediate feedback on the action result
4. WHEN a one-shot action fails, THE Agent SHALL explain the error and suggest alternatives

### Requirement 11: Gmail OAuth Flow

**User Story:** As a user, I want to securely connect my Gmail account, so that the Agent can send emails on my behalf.

#### Acceptance Criteria

1. THE System SHALL provide a "Connect Gmail" button in the credentials UI
2. WHEN a user clicks "Connect Gmail", THE System SHALL redirect to Google's OAuth consent screen
3. THE System SHALL request Gmail send permissions (gmail.send scope)
4. WHEN OAuth succeeds, THE System SHALL store the access token and refresh token as a Credential
5. THE System SHALL encrypt the tokens before database storage
6. THE System SHALL handle OAuth errors and display user-friendly error messages

### Requirement 12: Gmail Node Executor

**User Story:** As a developer, I want a Gmail node executor in the workflow engine, so that workflows can send emails.

#### Acceptance Criteria

1. THE Gmail_Node_Executor SHALL accept recipient, subject, and body as input parameters
2. THE Gmail_Node_Executor SHALL retrieve the user's Gmail Credential from the database
3. THE Gmail_Node_Executor SHALL use the Gmail API to send the email
4. WHEN the access token is expired, THE Gmail_Node_Executor SHALL refresh it using the refresh token
5. THE Gmail_Node_Executor SHALL return success or failure status to the Workflow_Engine
6. THE Gmail_Node_Executor SHALL support HTML email bodies

### Requirement 13: Agent Tool System

**User Story:** As a developer, I want a modular tool system, so that new capabilities can be added to the Agent easily.

#### Acceptance Criteria

1. THE Tool_System SHALL define tools with name, description, and input schema
2. THE Agent SHALL receive the list of available tools in the System_Prompt
3. WHEN the Agent selects a tool, THE Tool_System SHALL validate input parameters against the schema
4. THE Tool_System SHALL execute the tool and return results to the Agent
5. THE Tool_System SHALL handle tool execution errors and provide error messages to the Agent

### Requirement 14: Session Management

**User Story:** As a user, I want to create multiple chat sessions, so that I can organize conversations by topic.

#### Acceptance Criteria

1. THE System SHALL allow users to create new Chat_Sessions
2. THE Chat_Session SHALL store a title, creation timestamp, and associated messages
3. THE System SHALL display a list of past Chat_Sessions in the sidebar
4. WHEN a user selects a Chat_Session, THE System SHALL load and display its message history
5. THE System SHALL automatically generate a title for new Chat_Sessions based on the first user message

### Requirement 15: Agent System Prompt

**User Story:** As a developer, I want a comprehensive system prompt, so that the Agent behaves consistently and effectively.

#### Acceptance Criteria

1. THE System_Prompt SHALL define the Agent's role as a personal assistant
2. THE System_Prompt SHALL list all available tools with descriptions and input schemas
3. THE System_Prompt SHALL instruct the Agent to use the Memory_System for context retrieval
4. THE System_Prompt SHALL define the Agent's personality as helpful, concise, and proactive
5. THE System_Prompt SHALL include examples of tool usage for common scenarios

### Requirement 16: Error Handling and User Feedback

**User Story:** As a user, I want clear error messages when something goes wrong, so that I understand what happened and how to fix it.

#### Acceptance Criteria

1. WHEN a tool execution fails, THE Agent SHALL explain the error in user-friendly language
2. WHEN a credential is missing, THE Agent SHALL prompt the user to connect the required service
3. WHEN an OAuth token is expired and refresh fails, THE Agent SHALL ask the user to reconnect
4. THE System SHALL log all errors with stack traces for debugging
5. THE Agent SHALL suggest alternative approaches when a requested action cannot be completed

### Requirement 17: Rate Limiting and Cost Control

**User Story:** As a system administrator, I want rate limiting on API calls, so that costs are controlled and abuse is prevented.

#### Acceptance Criteria

1. THE System SHALL limit users to 100 Agent messages per day
2. THE System SHALL limit Gmail sends to 50 per day per user
3. THE System SHALL limit web searches to 20 per day per user
4. WHEN a rate limit is exceeded, THE System SHALL return a clear error message with reset time
5. THE System SHALL track usage in the database for monitoring and billing

### Requirement 18: Privacy and Data Security

**User Story:** As a user, I want my data to be secure and private, so that I can trust the system with sensitive information.

#### Acceptance Criteria

1. THE System SHALL encrypt all Credential values at rest using AES-256
2. THE System SHALL not log sensitive information (passwords, tokens, email content)
3. THE System SHALL allow users to delete their User_Profile and all associated data
4. THE System SHALL use HTTPS for all API communications
5. THE System SHALL comply with GDPR data retention and deletion requirements

### Requirement 19: Onboarding Flow

**User Story:** As a new user, I want a guided onboarding experience, so that I understand how to use the Agent effectively.

#### Acceptance Criteria

1. WHEN a user first logs in, THE System SHALL display a welcome message explaining the Agent's capabilities
2. THE System SHALL prompt the user to share basic information (name, occupation, preferences)
3. THE System SHALL suggest connecting services (Gmail, Calendar) with clear benefits
4. THE System SHALL provide example commands the user can try
5. THE System SHALL allow users to skip onboarding and explore independently

### Requirement 20: Workflow Execution Monitoring

**User Story:** As a user, I want to see the status of my scheduled workflows, so that I know they are running correctly.

#### Acceptance Criteria

1. THE System SHALL display a list of Scheduled_Workflows with their next execution time
2. THE System SHALL show execution history for each Scheduled_Workflow
3. WHEN a Scheduled_Workflow fails, THE System SHALL notify the user via the chat interface
4. THE System SHALL allow users to pause or delete Scheduled_Workflows
5. THE System SHALL display execution logs for debugging failed workflows

### Requirement 21: Multi-Turn Conversation Context

**User Story:** As a user, I want the Agent to remember context within a conversation, so that I can have natural back-and-forth exchanges.

#### Acceptance Criteria

1. THE Agent SHALL maintain conversation history within a Chat_Session
2. WHEN a user references "it", "that", or "the email", THE Agent SHALL resolve references using conversation context
3. THE Agent SHALL remember decisions made earlier in the conversation
4. THE Agent SHALL support follow-up questions without requiring full context repetition
5. THE Chat_Session SHALL include up to 50 messages in the Agent's context window

### Requirement 22: Workflow Validation

**User Story:** As a user, I want the Agent to validate workflows before execution, so that I don't waste time on broken automations.

#### Acceptance Criteria

1. WHEN the Agent creates a workflow, THE Agent SHALL validate that all required credentials exist
2. THE Agent SHALL validate that node connections form a valid directed acyclic graph
3. THE Agent SHALL validate that all node input parameters are provided or can be derived
4. IF validation fails, THEN THE Agent SHALL explain the issue and request missing information
5. THE Agent SHALL test workflows with sample data before scheduling them

### Requirement 23: Natural Language Schedule Parsing

**User Story:** As a user, I want to specify schedules in natural language, so that I don't have to learn cron syntax.

#### Acceptance Criteria

1. WHEN a user says "every Monday at 9am", THE Agent SHALL convert it to a cron expression
2. THE Agent SHALL support common schedule patterns (daily, weekly, monthly, hourly)
3. THE Agent SHALL handle time zones based on the User_Profile location
4. THE Agent SHALL confirm the schedule with the user before creating the Scheduled_Workflow
5. THE Agent SHALL explain the schedule in natural language for user confirmation

### Requirement 24: Email Draft Preview

**User Story:** As a user, I want to preview emails before they are sent, so that I can verify the content is correct.

#### Acceptance Criteria

1. WHEN the Agent drafts an email, THE Agent SHALL display the full email content (recipient, subject, body) to the user
2. THE Agent SHALL ask for user confirmation before sending the email
3. THE User SHALL be able to request edits to the draft
4. THE Agent SHALL apply requested edits and show the updated draft
5. THE Agent SHALL only send the email after explicit user approval

### Requirement 25: Writing Style Learning

**User Story:** As a user, I want the Agent to learn my writing style, so that emails sound like they came from me.

#### Acceptance Criteria

1. THE Agent SHALL analyze past emails or writing samples provided by the user
2. THE Agent SHALL extract style characteristics (formality, tone, common phrases, signature)
3. THE Agent SHALL store writing style preferences in the User_Profile
4. WHEN drafting emails, THE Agent SHALL apply the user's writing style
5. THE User SHALL be able to provide feedback on drafts to improve style matching

### Requirement 26: Calendar Integration (Future)

**User Story:** As a user, I want the Agent to access my calendar, so that it can schedule meetings and avoid conflicts.

#### Acceptance Criteria

1. THE System SHALL provide an OAuth_Flow for Google Calendar
2. THE Agent SHALL retrieve calendar events to check availability
3. THE Agent SHALL create calendar events when requested
4. THE Agent SHALL respect calendar privacy settings
5. THE Agent SHALL handle calendar conflicts and suggest alternative times

### Requirement 27: WhatsApp Integration (Future)

**User Story:** As a user, I want the Agent to send WhatsApp messages, so that I can communicate on my preferred platform.

#### Acceptance Criteria

1. THE System SHALL integrate with WhatsApp Business API or a third-party service
2. THE Agent SHALL send WhatsApp messages when requested
3. THE Agent SHALL handle WhatsApp rate limits and delivery status
4. THE System SHALL store WhatsApp credentials securely
5. THE Agent SHALL support WhatsApp message templates for compliance

### Requirement 28: LinkedIn Integration (Future)

**User Story:** As a user, I want the Agent to create LinkedIn posts, so that I can maintain my professional presence.

#### Acceptance Criteria

1. THE System SHALL provide an OAuth_Flow for LinkedIn
2. THE Agent SHALL create LinkedIn posts with text and optional media
3. THE Agent SHALL draft posts in a professional tone appropriate for LinkedIn
4. THE Agent SHALL preview posts before publishing
5. THE Agent SHALL handle LinkedIn API rate limits

### Requirement 29: Workflow Template Library

**User Story:** As a user, I want to browse pre-built workflow templates, so that I can quickly set up common automations.

#### Acceptance Criteria

1. THE System SHALL provide a library of workflow templates (email reminders, daily summaries, form notifications)
2. THE Agent SHALL suggest relevant templates based on user requests
3. THE User SHALL be able to customize template parameters before activation
4. THE Agent SHALL instantiate templates as Scheduled_Workflows
5. THE System SHALL allow users to save their own workflows as templates

### Requirement 30: Execution Rollback

**User Story:** As a user, I want to undo actions taken by the Agent, so that I can correct mistakes.

#### Acceptance Criteria

1. THE System SHALL track reversible actions (email sends cannot be undone, but workflow creation can)
2. WHEN a user requests to undo an action, THE Agent SHALL check if it is reversible
3. THE Agent SHALL delete created workflows or scheduled tasks when requested
4. THE Agent SHALL explain which actions cannot be undone and why
5. THE System SHALL maintain an audit log of all Agent actions for accountability
