export const DEFAULT_REWARD_OPTIONS = [
  {
    type: "discount",
    points: 100,
    discount: 2,
  },
  {
    type: "discount",
    points: 250,
    discount: 5,
  },
  {
    type: "discount",
    points: 500,
    discount: 10,
  },
];

export const DEFAULT_GIFT_CARD_REWARD_OPTIONS = [
  {
    type: "gift_card",
    points: 1500,
    amount: 15,
    title: "$15 Gift Card",
    description: "Redeem 1,500 points to get for free",
  },
];

export const SPECIAL_REWARD_OPTIONS = [
  {
    type: "store_credit",
    points: 100,
    amount: 1,
    title: "Store Credit Reward",
    description: "Redeem 100 points to get $1 store credits",
  },
];

export const DEFAULT_LOYALTY_SETTINGS = {
  signupBonusPoints: 100,
  orderSpendAmount: 100,
  orderSpendPoints: 10,
  refundSpendAmount: 100,
  refundSpendPoints: 10,
  checkoutRedemptionEnabled: true,
  preferredIntegration: "theme",
  redemptionRewards: JSON.stringify(DEFAULT_REWARD_OPTIONS),
  // Checkout UI Text Settings
  checkoutLoginMessage: "Sign in to use loyalty points.",
  checkoutDescription: "You have {coupon_amount} available {reward_label}",
  checkoutRewardPrompt: "Choose a {reward_singular}",
  checkoutRedeemButtonText: "Redeem",
  checkoutRedeemingText: "Redeeming...",
  checkoutPointsLabel: "Available points",
  checkoutSelectRewardMsg: "Please select a reward.",
  checkoutNotEnoughPtsMsg: "Not enough points for this reward.",
  checkoutDisabledMsg: "Rewards redemption is disabled in checkout.",
  checkoutRedemptionTitle: "Redeem your Points",
  checkoutGiftCardMsg: "Gift card created: {rewardCode}",
  checkoutDiscountMsg:
    "Discount code created: {rewardCode}. Points will be deducted after payment.",
  checkoutErrorMsg: "Could not redeem points",
  checkoutLoadingMsg: "Available points loading...",
  checkoutAvailableRewardsMsg: "{reward_count} available {reward_label}",
  // Customer Account UI Text Settings
  accountLoginMessage: "Sign in to view loyalty points.",
  accountBalanceTitle: "Loyalty balance",
  accountAvailableLabel: "Available points",
  accountCurrentBalance: "Current balance",
  accountLoadingText: "Loading...",
  accountRedeemingText: "Converting...",
  accountRedeemButtonText: "Convert to store credit",
  accountDisabledMsg: "Store credit conversion is currently disabled.",
  accountNotEnoughPtsMsg:
    "Earn {remaining_points} more points to convert this amount.",
  accountGiftCardMsg: "Store credit added: ${amount}",
  accountErrorMsg: "Could not convert points to store credit",
  accountConfigErrorMsg: "Loyalty API URL is not configured.",
};

export const REWARD_TYPE_PREFERENCES = ["gift_card", "discount", "both"];

export function normalizeRewardTypePreference(value) {
  return REWARD_TYPE_PREFERENCES.includes(value) ? value : "both";
}

export function parseRewardSettings(value) {
  let parsed = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {
        rewardTypePreference: "both",
        rewards: null,
      };
    }
  }

  if (Array.isArray(parsed)) {
    return {
      rewardTypePreference: "both",
      rewards: parsed,
    };
  }

  if (parsed && typeof parsed === "object" && Array.isArray(parsed.rewards)) {
    return {
      rewardTypePreference: normalizeRewardTypePreference(
        parsed.rewardTypePreference,
      ),
      rewards: parsed.rewards,
    };
  }

  return {
    rewardTypePreference: "both",
    rewards: null,
  };
}

export function serializeRewardSettings(rewards, rewardTypePreference) {
  return JSON.stringify({
    rewardTypePreference: normalizeRewardTypePreference(rewardTypePreference),
    rewards,
  });
}

export function getRewardTypePreferenceFromSettings(value) {
  return parseRewardSettings(value).rewardTypePreference;
}

export function normalizeRewardOptions(value) {
  const parsedSettings = parseRewardSettings(value);

  if (!Array.isArray(parsedSettings.rewards)) {
    return null;
  }

  const rewards = parsedSettings.rewards
    .map((reward) => {
      const points = Number(reward?.points);
      const type = reward?.type || "discount";
      const discount = Number(reward?.discount);
      const amount = Number(reward?.amount);

      if (!Number.isInteger(points) || points < 1) {
        return null;
      }

      if (type === "gift_card") {
        if (!Number.isFinite(amount) || amount <= 0) {
          return null;
        }

        return {
          type: "gift_card",
          points,
          amount,
          title: reward?.title || `$${amount} Gift Card`,
          description:
            reward?.description ||
            `Redeem ${points.toLocaleString("en")} points for a $${amount} gift card`,
        };
      }

      if (!Number.isFinite(discount) || discount <= 0) {
        return null;
      }

      return {
        type: "discount",
        points,
        discount,
      };
    })
    .filter(Boolean);

  if (rewards.length === 0) {
    return null;
  }

  return rewards.sort((a, b) => a.points - b.points);
}

export function getRewardOptionsWithSpecials(value) {
  const configuredRewards = normalizeRewardOptions(value) || [];
  const discountRewards = configuredRewards.filter(
    (reward) => (reward.type || "discount") === "discount",
  );
  const giftCardRewards = configuredRewards.filter(
    (reward) => reward.type === "gift_card",
  );
  const rewards = [
    ...(discountRewards.length > 0 ? discountRewards : DEFAULT_REWARD_OPTIONS),
    ...(giftCardRewards.length > 0
      ? giftCardRewards
      : DEFAULT_GIFT_CARD_REWARD_OPTIONS),
    ...SPECIAL_REWARD_OPTIONS,
  ];

  return rewards.sort((a, b) => a.points - b.points);
}

export function filterRewardOptionsByPreference(rewards, preference) {
  const normalizedPreference = normalizeRewardTypePreference(preference);

  if (normalizedPreference === "both") {
    return rewards.filter((reward) =>
      ["discount", "gift_card"].includes(reward.type || "discount"),
    );
  }

  return rewards.filter(
    (reward) => (reward.type || "discount") === normalizedPreference,
  );
}

export function getRewardOptionsForPreference(value, preference) {
  const effectivePreference =
    preference ?? getRewardTypePreferenceFromSettings(value);

  return filterRewardOptionsByPreference(
    getRewardOptionsWithSpecials(value),
    effectivePreference,
  );
}
