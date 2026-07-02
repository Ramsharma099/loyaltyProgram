const CART_DISCOUNT_CODES_UPDATE = `#graphql
  mutation CartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart {
        id
        checkoutUrl
        discountCodes {
          code
          applicable
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CART_GIFT_CARD_CODES_UPDATE = `#graphql
  mutation CartGiftCardCodesUpdate($cartId: ID!, $giftCardCodes: [String!]!) {
    cartGiftCardCodesUpdate(cartId: $cartId, giftCardCodes: $giftCardCodes) {
      cart {
        id
        checkoutUrl
        appliedGiftCards {
          lastCharacters
          amountUsed {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function getLoyaltyConfig(context) {
  const apiBaseUrl = context.env.LOYALTY_APP_URL?.replace(/\/$/, "");
  const apiToken = context.env.HYDROGEN_LOYALTY_API_TOKEN;
  const shopDomain = context.env.PUBLIC_STORE_DOMAIN;

  if (!apiBaseUrl || !apiToken || !shopDomain) {
    throw new Error("Hydrogen loyalty environment variables are not configured.");
  }

  return { apiBaseUrl, apiToken, shopDomain };
}

async function fetchLoyaltyJson(context, path, init = {}) {
  const { apiBaseUrl, apiToken } = getLoyaltyConfig(context);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(data?.message || "Loyalty request failed.");
  }

  return data;
}

export async function loadLoyaltyBalance(context, customerId) {
  const { shopDomain } = getLoyaltyConfig(context);
  const params = new URLSearchParams({
    customerId,
    shop: shopDomain,
  });

  return fetchLoyaltyJson(
    context,
    `/api/hydrogen/loyalty-balance?${params}`,
  );
}

export async function redeemLoyaltyReward(context, customerId, reward) {
  const { shopDomain } = getLoyaltyConfig(context);

  return fetchLoyaltyJson(context, "/api/hydrogen/redeem-points", {
    method: "POST",
    body: JSON.stringify({
      customerId,
      shop: shopDomain,
      pointsToRedeem: Number(reward.points),
      rewardType: reward.type || "discount",
    }),
  });
}

export async function applyLoyaltyRewardToCart(context, cartId, reward) {
  const mutation =
    reward.rewardType === "gift_card"
      ? CART_GIFT_CARD_CODES_UPDATE
      : CART_DISCOUNT_CODES_UPDATE;
  const variables =
    reward.rewardType === "gift_card"
      ? { cartId, giftCardCodes: [reward.rewardCode] }
      : { cartId, discountCodes: [reward.rewardCode] };

  const result = await context.storefront.mutate(mutation, { variables });
  const payload =
    reward.rewardType === "gift_card"
      ? result.cartGiftCardCodesUpdate
      : result.cartDiscountCodesUpdate;
  const userError = payload?.userErrors?.[0];

  if (userError) {
    throw new Error(userError.message || "Could not apply loyalty reward.");
  }

  return payload.cart;
}

export async function redeemAndApplyLoyaltyReward({
  context,
  cartId,
  customerId,
  reward,
}) {
  const redemption = await redeemLoyaltyReward(context, customerId, reward);
  const cart = await applyLoyaltyRewardToCart(
    context,
    cartId,
    redemption.reward,
  );

  return {
    cart,
    reward: redemption.reward,
    checkoutUrl: cart?.checkoutUrl,
  };
}
