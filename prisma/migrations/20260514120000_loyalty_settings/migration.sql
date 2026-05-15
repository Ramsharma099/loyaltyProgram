-- CreateTable
CREATE TABLE "LoyaltySetting" (
    "id" SERIAL NOT NULL,
    "shopId" INTEGER NOT NULL,
    "signupBonusPoints" INTEGER NOT NULL DEFAULT 100,
    "orderSpendAmount" INTEGER NOT NULL DEFAULT 100,
    "orderSpendPoints" INTEGER NOT NULL DEFAULT 10,
    "refundSpendAmount" INTEGER NOT NULL DEFAULT 100,
    "refundSpendPoints" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltySetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltySetting_shopId_key" ON "LoyaltySetting"("shopId");

-- AddForeignKey
ALTER TABLE "LoyaltySetting" ADD CONSTRAINT "LoyaltySetting_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
