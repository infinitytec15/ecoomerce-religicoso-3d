-- AlterTable
ALTER TABLE "StoryHighlight" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'stories';

-- AlterTable
ALTER TABLE "StoryVideo" ADD COLUMN "impressions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "completes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "carts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "storyVideoId" TEXT;

-- CreateIndex
CREATE INDEX "OrderItem_storyVideoId_idx" ON "OrderItem"("storyVideoId");

-- Data: the single home place becomes the top home slot (every existing highlight is a stories
-- row); the product page place is now a store setting, so it leaves the placements.
UPDATE "StoryHighlight"
SET "placements" = array_remove(array_replace("placements", 'home', 'home_top'), 'product')
WHERE 'home' = ANY("placements") OR 'product' = ANY("placements");
