ALTER TABLE "LoyaltySetting"
ADD COLUMN "redemptionRewards" TEXT NOT NULL DEFAULT '[{"points":100,"discount":2},{"points":250,"discount":5},{"points":500,"discount":10}]';
