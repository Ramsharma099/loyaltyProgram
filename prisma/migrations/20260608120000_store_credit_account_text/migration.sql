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
MODIFY COLUMN `accountRedeemingText` TEXT NOT NULL,
MODIFY COLUMN `accountRedeemButtonText` TEXT NOT NULL,
MODIFY COLUMN `accountDisabledMsg` TEXT NOT NULL,
MODIFY COLUMN `accountNotEnoughPtsMsg` TEXT NOT NULL,
MODIFY COLUMN `accountGiftCardMsg` TEXT NOT NULL,
MODIFY COLUMN `accountErrorMsg` TEXT NOT NULL;
