/*
  Warnings:

  - You are about to drop the column `active` on the `Reward` table. All the data in the column will be lost.
  - You are about to drop the column `pointsRequired` on the `Reward` table. All the data in the column will be lost.
  - You are about to drop the column `rewardName` on the `Reward` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[rewardCode]` on the table `Reward` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `customerId` to the `Reward` table without a default value. This is not possible if the table is not empty.
  - Added the required column `discountAmount` to the `Reward` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pointsUsed` to the `Reward` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rewardCode` to the `Reward` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Reward" DROP COLUMN "active",
DROP COLUMN "pointsRequired",
DROP COLUMN "rewardName",
ADD COLUMN     "customerId" INTEGER NOT NULL,
ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "pointsUsed" INTEGER NOT NULL,
ADD COLUMN     "rewardCode" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE UNIQUE INDEX "Reward_rewardCode_key" ON "Reward"("rewardCode");

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
