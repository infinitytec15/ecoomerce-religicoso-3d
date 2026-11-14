-- CreateTable
CREATE TABLE "MarketingContact" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "legalBasis" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "consentSource" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "unsubscribedCampaignId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "previewText" TEXT NOT NULL DEFAULT '',
    "blocks" JSONB NOT NULL,
    "segment" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Rascunho',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "preparedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "audienceCount" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingContact_email_key" ON "MarketingContact"("email");

-- CreateIndex
CREATE INDEX "MarketingContact_unsubscribedCampaignId_idx" ON "MarketingContact"("unsubscribedCampaignId");

-- CreateIndex
CREATE INDEX "MarketingContact_tags_idx" ON "MarketingContact" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "MarketingCampaign_state_scheduledAt_idx" ON "MarketingCampaign"("state", "scheduledAt");
