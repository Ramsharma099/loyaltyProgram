/*
  Warnings:

  - A unique constraint covering the columns `[shopId,shopifyCustomerId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `shopId` to the `Customer` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `Customer_email_key` ON `Customer`;

-- DropIndex
DROP INDEX `Customer_shopifyCustomerId_key` ON `Customer`;

-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `shopId` INTEGER NOT NULL;

-- CreateTable
CREATE TABLE `Shop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopDomain` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
);

-- CreateIndex
CREATE UNIQUE INDEX `Shop_shopDomain_key` ON `Shop`(`shopDomain`);

-- CreateIndex
CREATE UNIQUE INDEX `Customer_shopId_shopifyCustomerId_key` ON `Customer`(`shopId`, `shopifyCustomerId`);

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
