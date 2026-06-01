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

export const SPECIAL_REWARD_OPTIONS = [
  {
    type: "gift_card",
    points: 1500,
    amount: 15,
    title: "$15 Gift Card",
    description: "Redeem 1,500 points to get for free",
  },
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
  redemptionRewards: JSON.stringify(DEFAULT_REWARD_OPTIONS),
};

export function normalizeRewardOptions(value) {
  let parsed = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const rewards = parsed
    .map((reward) => {
      const points = Number(reward?.points);
      const discount = Number(reward?.discount);

      if (
        !Number.isInteger(points) ||
        points < 1 ||
        !Number.isFinite(discount) ||
        discount <= 0
      ) {
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
  const discountRewards = normalizeRewardOptions(value) || DEFAULT_REWARD_OPTIONS;

  return [...discountRewards, ...SPECIAL_REWARD_OPTIONS].sort(
    (a, b) => a.points - b.points,
  );
}
