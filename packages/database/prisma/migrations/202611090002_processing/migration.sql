-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN     "firstAttemptAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PaymentPart" ADD COLUMN     "feeCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PaymentException" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "refundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentException_providerId_key" ON "PaymentException"("providerId");
