CREATE TABLE "HttpMonitor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "HttpCheck" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "monitorId" TEXT NOT NULL,
  "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "success" BOOLEAN NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "statusCode" INTEGER,
  "error" TEXT,
  CONSTRAINT "HttpCheck_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "HttpMonitor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HttpCheck_monitorId_checkedAt_idx" ON "HttpCheck"("monitorId", "checkedAt");
