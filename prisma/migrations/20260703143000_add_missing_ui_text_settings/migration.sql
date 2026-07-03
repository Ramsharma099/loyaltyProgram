SET @missing_ui_columns = (
  SELECT GROUP_CONCAT(
    CONCAT('ADD COLUMN `', desired.column_name, '` TEXT NULL')
    ORDER BY desired.position
    SEPARATOR ', '
  )
  FROM (
    SELECT 1 AS position, 'checkoutLoginMessage' AS column_name UNION ALL
    SELECT 2, 'checkoutDescription' UNION ALL
    SELECT 3, 'checkoutRewardPrompt' UNION ALL
    SELECT 4, 'checkoutRedeemButtonText' UNION ALL
    SELECT 5, 'checkoutRedeemingText' UNION ALL
    SELECT 6, 'checkoutPointsLabel' UNION ALL
    SELECT 7, 'checkoutSelectRewardMsg' UNION ALL
    SELECT 8, 'checkoutNotEnoughPtsMsg' UNION ALL
    SELECT 9, 'checkoutDisabledMsg' UNION ALL
    SELECT 10, 'checkoutRedemptionTitle' UNION ALL
    SELECT 11, 'checkoutGiftCardMsg' UNION ALL
    SELECT 12, 'checkoutDiscountMsg' UNION ALL
    SELECT 13, 'checkoutErrorMsg' UNION ALL
    SELECT 14, 'checkoutLoadingMsg' UNION ALL
    SELECT 15, 'checkoutAvailableRewardsMsg' UNION ALL
    SELECT 16, 'accountLoginMessage' UNION ALL
    SELECT 17, 'accountBalanceTitle' UNION ALL
    SELECT 18, 'accountAvailableLabel' UNION ALL
    SELECT 19, 'accountCurrentBalance' UNION ALL
    SELECT 20, 'accountLoadingText' UNION ALL
    SELECT 21, 'accountRedeemingText' UNION ALL
    SELECT 22, 'accountRedeemButtonText' UNION ALL
    SELECT 23, 'accountDisabledMsg' UNION ALL
    SELECT 24, 'accountNotEnoughPtsMsg' UNION ALL
    SELECT 25, 'accountGiftCardMsg' UNION ALL
    SELECT 26, 'accountErrorMsg' UNION ALL
    SELECT 27, 'accountConfigErrorMsg'
  ) AS desired
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns existing
    WHERE existing.table_schema = DATABASE()
      AND existing.table_name = 'LoyaltySetting'
      AND existing.column_name = desired.column_name
  )
);

SET @add_ui_columns_sql = IF(
  @missing_ui_columns IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `LoyaltySetting` ', @missing_ui_columns)
);
PREPARE add_ui_columns_statement FROM @add_ui_columns_sql;
EXECUTE add_ui_columns_statement;
DEALLOCATE PREPARE add_ui_columns_statement;

UPDATE `LoyaltySetting`
SET
  `checkoutLoginMessage` = COALESCE(`checkoutLoginMessage`, 'Sign in to use loyalty points.'),
  `checkoutDescription` = COALESCE(`checkoutDescription`, 'You have {coupon_amount} available {reward_label}'),
  `checkoutRewardPrompt` = COALESCE(`checkoutRewardPrompt`, 'Choose a {reward_singular}'),
  `checkoutRedeemButtonText` = COALESCE(`checkoutRedeemButtonText`, 'Redeem'),
  `checkoutRedeemingText` = COALESCE(`checkoutRedeemingText`, 'Redeeming...'),
  `checkoutPointsLabel` = COALESCE(`checkoutPointsLabel`, 'Available points'),
  `checkoutSelectRewardMsg` = COALESCE(`checkoutSelectRewardMsg`, 'Please select a reward.'),
  `checkoutNotEnoughPtsMsg` = COALESCE(`checkoutNotEnoughPtsMsg`, 'Not enough points for this reward.'),
  `checkoutDisabledMsg` = COALESCE(`checkoutDisabledMsg`, 'Rewards redemption is disabled in checkout.'),
  `checkoutRedemptionTitle` = COALESCE(`checkoutRedemptionTitle`, 'Redeem your Points'),
  `checkoutGiftCardMsg` = COALESCE(`checkoutGiftCardMsg`, 'Gift card created: {rewardCode}'),
  `checkoutDiscountMsg` = COALESCE(`checkoutDiscountMsg`, 'Discount code created: {rewardCode}. Points will be deducted after payment.'),
  `checkoutErrorMsg` = COALESCE(`checkoutErrorMsg`, 'Could not redeem points'),
  `checkoutLoadingMsg` = COALESCE(`checkoutLoadingMsg`, 'Available points loading...'),
  `checkoutAvailableRewardsMsg` = COALESCE(`checkoutAvailableRewardsMsg`, '{reward_count} available {reward_label}'),
  `accountLoginMessage` = COALESCE(`accountLoginMessage`, 'Sign in to view loyalty points.'),
  `accountBalanceTitle` = COALESCE(`accountBalanceTitle`, 'Loyalty balance'),
  `accountAvailableLabel` = COALESCE(`accountAvailableLabel`, 'Available points'),
  `accountCurrentBalance` = COALESCE(`accountCurrentBalance`, 'Current balance'),
  `accountLoadingText` = COALESCE(`accountLoadingText`, 'Loading...'),
  `accountRedeemingText` = COALESCE(`accountRedeemingText`, 'Converting...'),
  `accountRedeemButtonText` = COALESCE(`accountRedeemButtonText`, 'Convert to store credit'),
  `accountDisabledMsg` = COALESCE(`accountDisabledMsg`, 'Store credit conversion is currently disabled.'),
  `accountNotEnoughPtsMsg` = COALESCE(`accountNotEnoughPtsMsg`, 'Earn {remaining_points} more points to convert this amount.'),
  `accountGiftCardMsg` = COALESCE(`accountGiftCardMsg`, 'Store credit added: ${amount}'),
  `accountErrorMsg` = COALESCE(`accountErrorMsg`, 'Could not convert points to store credit'),
  `accountConfigErrorMsg` = COALESCE(`accountConfigErrorMsg`, 'Loyalty API URL is not configured.');

ALTER TABLE `LoyaltySetting`
MODIFY COLUMN `checkoutLoginMessage` TEXT NOT NULL,
MODIFY COLUMN `checkoutDescription` TEXT NOT NULL,
MODIFY COLUMN `checkoutRewardPrompt` TEXT NOT NULL,
MODIFY COLUMN `checkoutRedeemButtonText` TEXT NOT NULL,
MODIFY COLUMN `checkoutRedeemingText` TEXT NOT NULL,
MODIFY COLUMN `checkoutPointsLabel` TEXT NOT NULL,
MODIFY COLUMN `checkoutSelectRewardMsg` TEXT NOT NULL,
MODIFY COLUMN `checkoutNotEnoughPtsMsg` TEXT NOT NULL,
MODIFY COLUMN `checkoutDisabledMsg` TEXT NOT NULL,
MODIFY COLUMN `checkoutRedemptionTitle` TEXT NOT NULL,
MODIFY COLUMN `checkoutGiftCardMsg` TEXT NOT NULL,
MODIFY COLUMN `checkoutDiscountMsg` TEXT NOT NULL,
MODIFY COLUMN `checkoutErrorMsg` TEXT NOT NULL,
MODIFY COLUMN `checkoutLoadingMsg` TEXT NOT NULL,
MODIFY COLUMN `checkoutAvailableRewardsMsg` TEXT NOT NULL,
MODIFY COLUMN `accountLoginMessage` TEXT NOT NULL,
MODIFY COLUMN `accountBalanceTitle` TEXT NOT NULL,
MODIFY COLUMN `accountAvailableLabel` TEXT NOT NULL,
MODIFY COLUMN `accountCurrentBalance` TEXT NOT NULL,
MODIFY COLUMN `accountLoadingText` TEXT NOT NULL,
MODIFY COLUMN `accountRedeemingText` TEXT NOT NULL,
MODIFY COLUMN `accountRedeemButtonText` TEXT NOT NULL,
MODIFY COLUMN `accountDisabledMsg` TEXT NOT NULL,
MODIFY COLUMN `accountNotEnoughPtsMsg` TEXT NOT NULL,
MODIFY COLUMN `accountGiftCardMsg` TEXT NOT NULL,
MODIFY COLUMN `accountErrorMsg` TEXT NOT NULL,
MODIFY COLUMN `accountConfigErrorMsg` TEXT NOT NULL;
