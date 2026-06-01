import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  DEFAULT_LOYALTY_SETTINGS,
  getRewardOptionsWithSpecials,
} from "../services/loyalty-settings.server";

// CORS HEADERS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function isMissingLoyaltySettingFieldError(error) {
  const message = String(error?.message || "");

  return (
    error?.code === "P2022" ||
    message.includes("redemptionRewards") ||
    message.includes("checkoutRedemptionEnabled") ||
    message.includes("Unknown field")
  );
}

function hasLoyaltySettingField(fieldName) {
  const fields = prisma._runtimeDataModel?.models?.LoyaltySetting?.fields || [];

  return fields.some((field) => field.name === fieldName);
}

function isStoreCreditPermissionError(error) {
  const message = String(error?.message || "");

  return (
    message.includes("store_credit") ||
    message.includes("store credit") ||
    message.includes("customers permission") ||
    message.includes("Customer permission")
  );
}

async function getRewardOptions(shopId) {
  if (!hasLoyaltySettingField("redemptionRewards")) {
    return getRewardOptionsWithSpecials();
  }

  try {
    const settings = await prisma.loyaltySetting.findUnique({
      where: {
        shopId,
      },
      select: {
        redemptionRewards: true,
      },
    });

    return getRewardOptionsWithSpecials(settings?.redemptionRewards);
  } catch (error) {
    if (!isMissingLoyaltySettingFieldError(error)) {
      throw error;
    }

    return getRewardOptionsWithSpecials();
  }
}

async function isCheckoutRedemptionEnabled(shopId) {
  if (!hasLoyaltySettingField("checkoutRedemptionEnabled")) {
    return DEFAULT_LOYALTY_SETTINGS.checkoutRedemptionEnabled;
  }

  try {
    const settings = await prisma.loyaltySetting.findUnique({
      where: {
        shopId,
      },
      select: {
        checkoutRedemptionEnabled: true,
      },
    });

    return (
      settings?.checkoutRedemptionEnabled ??
      DEFAULT_LOYALTY_SETTINGS.checkoutRedemptionEnabled
    );
  } catch (error) {
    if (!isMissingLoyaltySettingFieldError(error)) {
      throw error;
    }

    return DEFAULT_LOYALTY_SETTINGS.checkoutRedemptionEnabled;
  }
}

async function runAdminGraphql(admin, mutation, variables) {
  const response = await admin.graphql(mutation, {
    variables,
  });

  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(JSON.stringify(result.errors));
  }

  return result.data;
}

async function getShopCurrencyCode(admin) {
  const data = await runAdminGraphql(
    admin,
    `#graphql
      query ShopCurrency {
        shop {
          currencyCode
        }
      }
    `,
  );

  return data.shop.currencyCode;
}

// OPTIONS HANDLER
export const loader = async () => {
  return Response.json(
    {},
    {
      headers: corsHeaders,
    },
  );
};

export const action = async ({ request }) => {
  // HANDLE PREFLIGHT REQUEST
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const body = await request.json();

    const { customerId, pointsToRedeem, rewardType = "discount" } = body;

    const redeemPoints = Number(pointsToRedeem);

    if (!customerId || !Number.isInteger(redeemPoints) || redeemPoints <= 0) {
      return Response.json(
        {
          success: false,
          message: "Invalid redemption request",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // FIND CUSTOMER
    const customer = await prisma.customer.findUnique({
      where: {
        id: Number(customerId),
      },

      include: {
        shop: true,
      },
    });

    if (!customer) {
      return Response.json(
        {
          success: false,
          message: "Customer not found",
        },
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    if (!(await isCheckoutRedemptionEnabled(customer.shop.id))) {
      return Response.json(
        {
          success: false,
          message: "Rewards redemption is disabled in checkout",
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      );
    }

    const { admin } = await unauthenticated.admin(customer.shop.shopDomain);

    // VALIDATE POINTS
    if (customer.loyaltyPoints < redeemPoints) {
      return Response.json(
        {
          success: false,
          message: "Insufficient points",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    const rewardOptions = await getRewardOptions(customer.shop.id);

    const selectedReward = rewardOptions.find(
      (reward) =>
        reward.points === redeemPoints &&
        (reward.type || "discount") === rewardType,
    );

    if (!selectedReward) {
      return Response.json(
        {
          success: false,
          message: "Selected reward is not available",
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    const issuedReward = await issueShopifyReward({
      admin,
      customer,
      selectedReward,
    });

    // DATABASE TRANSACTION
    const reward = await prisma.$transaction(async (tx) => {
      // DEDUCT POINTS
      await tx.customer.update({
        where: {
          id: customer.id,
        },

        data: {
          loyaltyPoints: {
            decrement: redeemPoints,
          },
        },
      });

      // TRANSACTION HISTORY
      await tx.pointTransaction.create({
        data: {
          customerId: customer.id,

          points: redeemPoints,

          transactionType: "debit",

          reason: "Reward Redemption",
        },
      });

      // SAVE REWARD
      return tx.reward.create({
        data: {
          customerId: customer.id,

          rewardCode: issuedReward.rewardCode,

          discountAmount: issuedReward.amount,

          pointsUsed: redeemPoints,
        },
      });
    });

    return Response.json(
      {
        success: true,
        reward: {
          ...reward,
          rewardType,
          rewardCode: issuedReward.rewardCode,
          amount: issuedReward.amount,
        },
      },
      {
        headers: corsHeaders,
      },
    );
  } catch (error) {
    if (error instanceof Response) {
      return Response.json(
        {
          success: false,
          message:
            "Shopify session unavailable. Open embedded app once and retry.",
        },
        {
          status: error.status === 410 ? 401 : error.status || 500,

          headers: corsHeaders,
        },
      );
    }

    console.error("Redeem error:", error, error?.stack);

    if (isStoreCreditPermissionError(error)) {
      return Response.json(
        {
          success: false,
          message:
            "Store credit redemption needs updated app permissions. Reauthorize the app, then try again.",
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      );
    }

    return Response.json(
      {
        success: false,
        message: error?.message || "Could not redeem points",
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
};

async function issueShopifyReward({ admin, customer, selectedReward }) {
  const rewardType = selectedReward.type || "discount";

  if (rewardType === "gift_card") {
    return createGiftCardReward({ admin, customer, selectedReward });
  }

  if (rewardType === "store_credit") {
    return createStoreCreditReward({ admin, customer, selectedReward });
  }

  return createDiscountReward({ admin, customer, selectedReward });
}

async function createDiscountReward({ admin, customer, selectedReward }) {
  const rewardCode =
    "LOYALTY-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const discountTags = [
    "loyalty",
    "reward-redemption",
    `points-${selectedReward.points}`,
    `discount-${selectedReward.discount}`,
  ];

  const data = await runAdminGraphql(
    admin,
    `#graphql
      mutation discountCodeBasicCreate(
        $basicCodeDiscount: DiscountCodeBasicInput!
      ) {
        discountCodeBasicCreate(
          basicCodeDiscount: $basicCodeDiscount
        ) {
          codeDiscountNode {
            id
          }
          userErrors {
            field
            code
            message
          }
        }
      }
    `,
    {
      basicCodeDiscount: {
        title: rewardCode,
        code: rewardCode,
        startsAt: new Date().toISOString(),
        tags: discountTags,
        customerSelection: {
          customers: {
            add: [`gid://shopify/Customer/${customer.shopifyCustomerId}`],
          },
        },
        customerGets: {
          value: {
            discountAmount: {
              amount: selectedReward.discount.toString(),
              appliesOnEachItem: false,
            },
          },
          items: {
            all: true,
          },
        },
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: true,
          shippingDiscounts: true,
        },
        appliesOncePerCustomer: true,
        usageLimit: 1,
      },
    },
  );

  const result = data.discountCodeBasicCreate;
  const userErrors = result?.userErrors ?? [];

  if (userErrors.length) {
    throw new Error(userErrors[0]?.message || "Could not create discount code");
  }

  if (!result?.codeDiscountNode?.id) {
    throw new Error("Shopify did not return a discount code");
  }

  return {
    rewardCode,
    amount: selectedReward.discount,
    discountTags,
  };
}

async function createGiftCardReward({ admin, customer, selectedReward }) {
  const data = await runAdminGraphql(
    admin,
    `#graphql
      mutation GiftCardCreate($input: GiftCardCreateInput!) {
        giftCardCreate(input: $input) {
          giftCard {
            id
          }
          giftCardCode
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: {
        initialValue: selectedReward.amount.toString(),
        customerId: `gid://shopify/Customer/${customer.shopifyCustomerId}`,
        note: "Loyalty reward redemption",
      },
    },
  );

  const result = data.giftCardCreate;
  const userErrors = result?.userErrors ?? [];

  if (userErrors.length) {
    throw new Error(userErrors[0]?.message || "Could not create gift card");
  }

  if (!result?.giftCardCode) {
    throw new Error("Shopify did not return a gift card code");
  }

  return {
    rewardCode: result.giftCardCode,
    amount: selectedReward.amount,
  };
}

async function createStoreCreditReward({ admin, customer, selectedReward }) {
  const currencyCode = await getShopCurrencyCode(admin);

  const data = await runAdminGraphql(
    admin,
    `#graphql
      mutation StoreCreditAccountCredit(
        $id: ID!
        $creditInput: StoreCreditAccountCreditInput!
      ) {
        storeCreditAccountCredit(
          id: $id
          creditInput: $creditInput
        ) {
          storeCreditAccountTransaction {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id: `gid://shopify/Customer/${customer.shopifyCustomerId}`,
      creditInput: {
        creditAmount: {
          amount: selectedReward.amount.toString(),
          currencyCode,
        },
      },
    },
  );

  const result = data.storeCreditAccountCredit;
  const userErrors = result?.userErrors ?? [];

  if (userErrors.length) {
    throw new Error(userErrors[0]?.message || "Could not create store credit");
  }

  if (!result?.storeCreditAccountTransaction?.id) {
    throw new Error("Shopify did not return a store credit transaction");
  }

  return {
    rewardCode: result.storeCreditAccountTransaction.id,
    amount: selectedReward.amount,
  };
}
