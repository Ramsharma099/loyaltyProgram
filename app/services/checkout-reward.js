export function normalizeCheckoutReward(reward) {
  if (!reward || typeof reward !== "object") {
    return null;
  }

  const rewardType = String(
    reward.rewardType || reward.type || "discount",
  )
    .trim()
    .toLowerCase();

  const normalizedRewardType =
    rewardType === "giftcard"
      ? "gift_card"
      : rewardType === "storecredit"
        ? "store_credit"
        : rewardType === "discount"
          ? "discount"
          : rewardType;

  return {
    ...reward,
    rewardCode:
      reward.rewardCode ||
      reward.code ||
      reward.discountCode ||
      reward.giftCardCode ||
      "",
    rewardType: normalizedRewardType,
    pointsUsed:
      reward.pointsUsed ?? reward.pointsToRedeem ?? reward.points ?? null,
    discountAmount: reward.discountAmount ?? reward.amount ?? null,
    expiresAt: reward.expiresAt ?? null,
  };
}

export function isPendingCheckoutReward(reward) {
  const normalizedReward = normalizeCheckoutReward(reward);

  return Boolean(
    normalizedReward?.rewardCode &&
      ["discount", "gift_card"].includes(normalizedReward.rewardType),
  );
}
