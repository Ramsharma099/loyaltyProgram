-- AlterTable
ALTER TABLE `LoyaltySetting`
ADD COLUMN `iframeEyebrow` TEXT NULL,
ADD COLUMN `iframeHeading` TEXT NULL,
ADD COLUMN `iframeLoggedOutMessage` TEXT NULL,
ADD COLUMN `iframeLoginLabel` TEXT NULL,
ADD COLUMN `iframePointsTemplate` TEXT NULL,
ADD COLUMN `iframeRewardsHeading` TEXT NULL,
ADD COLUMN `iframeNoRewardsMessage` TEXT NULL,
ADD COLUMN `iframeRedeemButtonText` TEXT NULL,
ADD COLUMN `iframeAccentColor` VARCHAR(20) NOT NULL DEFAULT '#008060',
ADD COLUMN `iframeBackgroundColor` VARCHAR(20) NOT NULL DEFAULT '#ffffff',
ADD COLUMN `iframeForegroundColor` VARCHAR(20) NOT NULL DEFAULT '#202223',
ADD COLUMN `iframeBorderColor` VARCHAR(20) NOT NULL DEFAULT '#e3e5e8';

UPDATE `LoyaltySetting`
SET
  `iframeEyebrow` = 'Rewards',
  `iframeHeading` = 'Your loyalty points',
  `iframeLoggedOutMessage` = 'Sign in to view and use your loyalty points.',
  `iframeLoginLabel` = 'Sign in',
  `iframePointsTemplate` = 'You have {points} points.',
  `iframeRewardsHeading` = 'Available rewards',
  `iframeNoRewardsMessage` = 'Keep earning points to unlock rewards.',
  `iframeRedeemButtonText` = 'Redeem and checkout';

ALTER TABLE `LoyaltySetting`
MODIFY COLUMN `iframeEyebrow` TEXT NOT NULL,
MODIFY COLUMN `iframeHeading` TEXT NOT NULL,
MODIFY COLUMN `iframeLoggedOutMessage` TEXT NOT NULL,
MODIFY COLUMN `iframeLoginLabel` TEXT NOT NULL,
MODIFY COLUMN `iframePointsTemplate` TEXT NOT NULL,
MODIFY COLUMN `iframeRewardsHeading` TEXT NOT NULL,
MODIFY COLUMN `iframeNoRewardsMessage` TEXT NOT NULL,
MODIFY COLUMN `iframeRedeemButtonText` TEXT NOT NULL;
