CREATE TABLE "RemediationDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "incidentId" TEXT NOT NULL,
  "actionId" TEXT,
  "actionTitle" TEXT,
  "decidedBy" TEXT NOT NULL DEFAULT 'SRE Operator',
  "decision" TEXT NOT NULL,
  "category" TEXT,
  "reason" TEXT,
  "originalPlan" TEXT,
  "editedPlan" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RemediationDecision_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RemediationDecision_incidentId_createdAt_idx" ON "RemediationDecision"("incidentId", "createdAt");
CREATE INDEX "RemediationDecision_decision_category_idx" ON "RemediationDecision"("decision", "category");
