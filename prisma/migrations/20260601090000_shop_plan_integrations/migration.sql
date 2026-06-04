ALTER TABLE `Shop`
ADD COLUMN `shopifyPlanName` VARCHAR(191) NULL,
ADD COLUMN `isShopifyPlus` BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN `isPartnerDevelopment` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `LoyaltySetting`
ADD COLUMN `preferredIntegration` VARCHAR(191) NOT NULL DEFAULT 'theme';
