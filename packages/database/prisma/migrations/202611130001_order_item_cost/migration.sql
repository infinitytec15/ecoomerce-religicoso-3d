-- Production cost per order line, frozen at sale time so later cost changes do not
-- rewrite past profit. Existing lines are backfilled with the current product cost.
ALTER TABLE "OrderItem" ADD COLUMN "costCents" INTEGER NOT NULL DEFAULT 0;

UPDATE "OrderItem" AS oi
SET "costCents" = oi."quantity" * p."costCents"
FROM "Product" AS p
WHERE p."id" = oi."productId";
