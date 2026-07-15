import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCheckoutReward, isPendingCheckoutReward } from "./checkout-reward.js";

test("normalizes gift card rewards from launcher-style payloads", () => {
  const reward = normalizeCheckoutReward({
    giftCardCode: "GIFT-1234",
    type: "giftcard",
    points: 500,
  });

  assert.equal(reward.rewardCode, "GIFT-1234");
  assert.equal(reward.rewardType, "gift_card");
  assert.equal(reward.pointsUsed, 500);
});

test("detects pending checkout rewards with a normalized reward code", () => {
  const reward = normalizeCheckoutReward({
    rewardCode: "SAVE10",
    rewardType: "discount",
    pointsUsed: 150,
  });

  assert.equal(isPendingCheckoutReward(reward), true);
  assert.equal(reward.rewardCode, "SAVE10");
});
