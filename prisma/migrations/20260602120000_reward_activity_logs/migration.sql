-- AlterTable
ALTER TABLE `Reward`
ADD COLUMN `rewardType` VARCHAR(191) NOT NULL DEFAULT 'discount',
ADD COLUMN `shopifyRewardId` VARCHAR(191),
ADD COLUMN `orderId` VARCHAR(191),
ADD COLUMN `appliedAt` DATETIME(3),
ADD COLUMN `failedReason` TEXT,
ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable
CREATE TABLE `RewardActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customerId` INTEGER,
    `rewardId` INTEGER,
    `rewardCode` VARCHAR(191),
    `activityType` VARCHAR(191) NOT NULL,
    `message` TEXT,
    `metadata` JSON,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RewardActivityLog_customerId_idx`(`customerId`),
    INDEX `RewardActivityLog_rewardId_idx`(`rewardId`),
    INDEX `RewardActivityLog_rewardCode_idx`(`rewardCode`),
    INDEX `RewardActivityLog_activityType_idx`(`activityType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RewardActivityLog` ADD CONSTRAINT `RewardActivityLog_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardActivityLog` ADD CONSTRAINT `RewardActivityLog_rewardId_fkey` FOREIGN KEY (`rewardId`) REFERENCES `Reward`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
