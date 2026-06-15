UPDATE `LoyaltySetting`
SET `accountRedeemingText` = 'Converting...'
WHERE `accountRedeemingText` = 'Redeeming...';

UPDATE `LoyaltySetting`
SET `accountRedeemButtonText` = 'Convert to store credit'
WHERE `accountRedeemButtonText` = 'Redeem gift card';

UPDATE `LoyaltySetting`
SET `accountDisabledMsg` = 'Store credit conversion is currently disabled.'
WHERE `accountDisabledMsg` = 'Rewards redemption is currently disabled.';

UPDATE `LoyaltySetting`
SET `accountNotEnoughPtsMsg` = 'Earn {remaining_points} more points to convert this amount.'
WHERE `accountNotEnoughPtsMsg` = 'Earn {remaining_points} more points to redeem a gift card.';

UPDATE `LoyaltySetting`
SET `accountGiftCardMsg` = 'Store credit added: ${amount}'
WHERE `accountGiftCardMsg` = 'Gift card created: {rewardCode}';

UPDATE `LoyaltySetting`
SET `accountErrorMsg` = 'Could not convert points to store credit'
WHERE `accountErrorMsg` = 'Could not redeem gift card';

ALTER TABLE `LoyaltySetting`
MODIFY COLUMN `accountRedeemingText` VARCHAR(500) NOT NULL DEFAULT 'Converting...',
MODIFY COLUMN `accountRedeemButtonText` VARCHAR(500) NOT NULL DEFAULT 'Convert to store credit',
MODIFY COLUMN `accountDisabledMsg` VARCHAR(500) NOT NULL DEFAULT 'Store credit conversion is currently disabled.',
MODIFY COLUMN `accountNotEnoughPtsMsg` VARCHAR(500) NOT NULL DEFAULT 'Earn {remaining_points} more points to convert this amount.',
MODIFY COLUMN `accountGiftCardMsg` VARCHAR(500) NOT NULL DEFAULT 'Store credit added: ${amount}',
MODIFY COLUMN `accountErrorMsg` VARCHAR(500) NOT NULL DEFAULT 'Could not convert points to store credit';
