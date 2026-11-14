-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "groupBuyId" TEXT;

-- CreateTable
CREATE TABLE "GroupBuy" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "productId" TEXT NOT NULL,
    "sizeIndex" INTEGER NOT NULL,
    "groupPriceCents" INTEGER NOT NULL,
    "goal" INTEGER NOT NULL,
    "maxParticipants" INTEGER,
    "perPersonLimit" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Aberta',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "goalReachedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupBuy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupBuy_status_endsAt_idx" ON "GroupBuy"("status", "endsAt");

-- CreateIndex
CREATE INDEX "GroupBuy_productId_status_idx" ON "GroupBuy"("productId", "status");

-- CreateIndex
CREATE INDEX "Order_groupBuyId_idx" ON "Order"("groupBuyId");

-- AddForeignKey
ALTER TABLE "GroupBuy" ADD CONSTRAINT "GroupBuy_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
