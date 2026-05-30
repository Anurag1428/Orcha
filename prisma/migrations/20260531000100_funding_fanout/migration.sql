-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'FOR_EACH_STARTUP';

-- AlterTable
ALTER TABLE "Execution" ADD COLUMN "parentExecutionId" TEXT,
ADD COLUMN "startupLeadId" TEXT;

-- CreateTable
CREATE TABLE "funding_post" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "parentExecutionId" TEXT,
    "sourceUrl" TEXT,
    "postText" TEXT,
    "imageUrl" TEXT,
    "rawInput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "startup_lead" (
    "id" TEXT NOT NULL,
    "fundingPostId" TEXT NOT NULL,
    "startup" TEXT NOT NULL,
    "startupKey" TEXT NOT NULL,
    "funding" TEXT,
    "sector" TEXT,
    "rank" INTEGER,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "state" JSONB NOT NULL DEFAULT '{}',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "startup_lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_attempt" (
    "id" TEXT NOT NULL,
    "fundingPostId" TEXT NOT NULL,
    "startupLeadId" TEXT NOT NULL,
    "executionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "founder" TEXT,
    "linkedin" TEXT,
    "domain" TEXT,
    "email" TEXT,
    "verified" BOOLEAN,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funding_post_workflowId_idx" ON "funding_post"("workflowId");

-- CreateIndex
CREATE INDEX "funding_post_parentExecutionId_idx" ON "funding_post"("parentExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "startup_lead_fundingPostId_startupKey_key" ON "startup_lead"("fundingPostId", "startupKey");

-- CreateIndex
CREATE INDEX "startup_lead_startupKey_idx" ON "startup_lead"("startupKey");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_attempt_executionId_key" ON "outreach_attempt"("executionId");

-- CreateIndex
CREATE INDEX "outreach_attempt_fundingPostId_idx" ON "outreach_attempt"("fundingPostId");

-- CreateIndex
CREATE INDEX "outreach_attempt_startupLeadId_idx" ON "outreach_attempt"("startupLeadId");

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_parentExecutionId_fkey" FOREIGN KEY ("parentExecutionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_startupLeadId_fkey" FOREIGN KEY ("startupLeadId") REFERENCES "startup_lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_post" ADD CONSTRAINT "funding_post_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_post" ADD CONSTRAINT "funding_post_parentExecutionId_fkey" FOREIGN KEY ("parentExecutionId") REFERENCES "Execution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "startup_lead" ADD CONSTRAINT "startup_lead_fundingPostId_fkey" FOREIGN KEY ("fundingPostId") REFERENCES "funding_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_attempt" ADD CONSTRAINT "outreach_attempt_fundingPostId_fkey" FOREIGN KEY ("fundingPostId") REFERENCES "funding_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_attempt" ADD CONSTRAINT "outreach_attempt_startupLeadId_fkey" FOREIGN KEY ("startupLeadId") REFERENCES "startup_lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_attempt" ADD CONSTRAINT "outreach_attempt_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
