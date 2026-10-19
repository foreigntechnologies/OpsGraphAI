-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "version" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "sloAvailability" REAL NOT NULL DEFAULT 99.9,
    "sloLatencyP95" INTEGER NOT NULL DEFAULT 500,
    "sloErrorRate" REAL NOT NULL DEFAULT 1.0,
    "status" TEXT NOT NULL DEFAULT 'HEALTHY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'SEV-2',
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "category" TEXT,
    "serviceId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "mttdSeconds" INTEGER,
    "mttaSeconds" INTEGER,
    "mttrSeconds" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Incident_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncidentTimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agent" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" TEXT,
    CONSTRAINT "IncidentTimelineEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Hypothesis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "evidence" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Hypothesis_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RemediationAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RemediationAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Postmortem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL,
    "timelineMarkdown" TEXT NOT NULL,
    "contributingFactors" TEXT NOT NULL,
    "correctiveActions" TEXT NOT NULL,
    "lessonsLearned" TEXT NOT NULL,
    "sloImpactSummary" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ragIndexed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Postmortem_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelemetrySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latencyP50" INTEGER NOT NULL,
    "latencyP95" INTEGER NOT NULL,
    "latencyP99" INTEGER NOT NULL,
    "errorRate" REAL NOT NULL,
    "requestsSec" INTEGER NOT NULL,
    "cpuUsage" REAL NOT NULL,
    "memoryUsage" REAL NOT NULL,
    "phase" TEXT NOT NULL,
    "availabilityWindow" TEXT NOT NULL,
    "burnRateWindow" TEXT NOT NULL,
    "budgetWindow" TEXT NOT NULL,
    "errorRateWindowSeconds" INTEGER NOT NULL DEFAULT 60,
    CONSTRAINT "TelemetrySnapshot_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commitHash" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "configDiff" TEXT,
    CONSTRAINT "Deployment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "llmCalls" INTEGER NOT NULL,
    "tokensUsed" INTEGER NOT NULL,
    "estimatedCost" REAL NOT NULL,
    "toolCalls" INTEGER NOT NULL,
    "ragQueries" INTEGER NOT NULL,
    "docsRetrieved" INTEGER NOT NULL,
    "nodesExecuted" INTEGER NOT NULL DEFAULT 0,
    "traceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "AgentExecution_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_name_key" ON "Service"("name");

-- CreateIndex
CREATE INDEX "Incident_serviceId_startedAt_idx" ON "Incident"("serviceId", "startedAt");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "IncidentTimelineEvent_incidentId_timestamp_idx" ON "IncidentTimelineEvent"("incidentId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Postmortem_incidentId_key" ON "Postmortem"("incidentId");

-- CreateIndex
CREATE INDEX "TelemetrySnapshot_incidentId_timestamp_idx" ON "TelemetrySnapshot"("incidentId", "timestamp");

-- CreateIndex
CREATE INDEX "Deployment_serviceId_deployedAt_idx" ON "Deployment"("serviceId", "deployedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecution_executionId_key" ON "AgentExecution"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocument_slug_key" ON "KnowledgeDocument"("slug");
