import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  DEFAULT_LOYALTY_SETTINGS,
  DEFAULT_REWARD_OPTIONS,
  SPECIAL_REWARD_OPTIONS,
  getRewardTypePreferenceFromSettings,
  getRewardOptionsForPreference,
} from "../services/loyalty-settings.server";
import {
  getEffectiveIntegration,
  getShopPlanSelect,
  isCheckoutRedemptionAvailable,
  isRewardsRedemptionEnabled,
} from "../services/shop-plan.server";
import {
  ensureOrderWebhookSubscriptions,
  getPublicRequestOrigin,
} from "../services/webhook-subscriptions.server";
import {
  logError,
  parseJsonRequest,
  runShopifyGraphql,
} from "../services/errors.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const checkedWebhookSubscriptions = new Set();
const storeCreditReward = SPECIAL_REWARD_OPTIONS.find(
  (reward) => reward.type === "store_credit",
);

const TEXT_SETTINGS_FIELDS = [
  "checkoutLoginMessage",
  "checkoutDescription",
  "checkoutRewardPrompt",
  "checkoutRedeemButtonText",
  "checkoutRedeemingText",
  "checkoutPointsLabel",
  "checkoutSelectRewardMsg",
  "checkoutNotEnoughPtsMsg",
  "checkoutDisabledMsg",
  "checkoutRedemptionTitle",
  "checkoutGiftCardMsg",
  "checkoutDiscountMsg",
  "checkoutErrorMsg",
  "checkoutLoadingMsg",
  "checkoutAvailableRewardsMsg",
  "accountLoginMessage",
  "accountBalanceTitle",
  "accountAvailableLabel",
  "accountCurrentBalance",
  "accountLoadingText",
  "accountRedeemingText",
  "accountRedeemButtonText",
  "accountDisabledMsg",
  "accountNotEnoughPtsMsg",
  "accountGiftCardMsg",
  "accountErrorMsg",
  "accountConfigErrorMsg",
];

function getTextSettingsSelect() {
  return TEXT_SETTINGS_FIELDS.reduce((select, field) => {
    if (hasLoyaltySettingField(field)) {
      select[field] = true;
    }
    return select;
  }, {});
}

function buildTextSettingsResponse(loyaltySetting) {
  const response = {};
  TEXT_SETTINGS_FIELDS.forEach((field) => {
    const value = loyaltySetting?.[field];
    if (value !== undefined && value !== null) {
      response[field] = value;
    }
  });
  return response;
}

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
}

function getShopifyCustomerId(customerId) {
  if (!customerId) {
    return null;
  }

  return String(customerId).split("/").pop();
}

function normalizeShopDomain(shop) {
  if (!shop) {
    return null;
  }

  try {
    return new URL(shop).hostname;
  } catch {
    return String(shop).trim() || null;
  }
}

async function getStoreCreditBalance(shopDomain, shopifyCustomerId) {
  if (!shopDomain || !shopifyCustomerId) {
    return null;
  }

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    const data = await runShopifyGraphql(
      admin,
      `#graphql
        query CustomerStoreCreditBalance($id: ID!) {
          customer(id: $id) {
            storeCreditAccounts(first: 10) {
              nodes {
                balance {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      `,
      {
        variables: {
          id: `gid://shopify/Customer/${shopifyCustomerId}`,
        },
        operation: "Load Shopify store credit balance",
      },
    );

    const balances =
      data.customer?.storeCreditAccounts?.nodes
        ?.map((account) => account.balance)
        .filter(Boolean) || [];

    if (balances.length === 0) {
      return { amount: 0, currencyCode: null };
    }

    const currencyCode = balances[0].currencyCode;
    const amount = balances
      .filter((balance) => balance.currencyCode === currencyCode)
      .reduce((total, balance) => total + Number(balance.amount || 0), 0);

    return { amount, currencyCode };
  } catch (error) {
    logError("loyalty-balance:store-credit", error, {
      shopDomain,
      shopifyCustomerId,
    });
    return null;
  }
}

function isMissingLoyaltySettingFieldError(error) {
  const message = String(error?.message || "");

  return (
    error?.code === "P2022" ||
    message.includes("redemptionRewards") ||
    message.includes("checkoutRedemptionEnabled") ||
    message.includes("preferredIntegration") ||
    message.includes("isShopifyPlus") ||
    message.includes("isPartnerDevelopment") ||
    message.includes("Unknown field")
  );
}

function hasLoyaltySettingField(fieldName) {
  const fields = prisma._runtimeDataModel?.models?.LoyaltySetting?.fields || [];

  return fields.some((field) => field.name === fieldName);
}

function findCustomer(shopifyCustomerId, shopDomain) {
  return prisma.customer.findFirst({
    where: {
      shopifyCustomerId,
      ...(shopDomain
        ? {
            shop: {
              shopDomain,
            },
          }
        : {}),
    },
    select: {
      id: true,
      loyaltyPoints: true,
    },
  });
}

async function findCustomerWithRewards(shopifyCustomerId, shopDomain) {
  if (!hasLoyaltySettingField("redemptionRewards")) {
    return findCustomer(shopifyCustomerId, shopDomain);
  }

  const loyaltySettingSelect = {
    redemptionRewards: true,
    ...(hasLoyaltySettingField("checkoutRedemptionEnabled")
      ? {
          checkoutRedemptionEnabled: true,
        }
      : {}),
    ...(hasLoyaltySettingField("preferredIntegration")
      ? {
          preferredIntegration: true,
        }
      : {}),
    ...getTextSettingsSelect(),
  };

  try {
    return await prisma.customer.findFirst({
      where: {
        shopifyCustomerId,
        ...(shopDomain
          ? {
              shop: {
                shopDomain,
              },
            }
          : {}),
      },
      select: {
        id: true,
        loyaltyPoints: true,
        shop: {
          select: {
            ...getShopPlanSelect(),
            loyaltySetting: {
              select: loyaltySettingSelect,
            },
          },
        },
      },
    });
  } catch (error) {
    if (!isMissingLoyaltySettingFieldError(error)) {
      throw error;
    }

    return findCustomer(shopifyCustomerId, shopDomain);
  }
}

async function getShopIntegrationStatus(shopDomain) {
  if (!shopDomain || !hasLoyaltySettingField("checkoutRedemptionEnabled")) {
    return {
      checkoutRedemptionEnabled:
        DEFAULT_LOYALTY_SETTINGS.checkoutRedemptionEnabled,
      checkoutIntegrationEnabled:
        DEFAULT_LOYALTY_SETTINGS.checkoutRedemptionEnabled,
      effectiveIntegration: DEFAULT_LOYALTY_SETTINGS.preferredIntegration,
      rewardOptions: getRewardOptionsForPreference(
        DEFAULT_LOYALTY_SETTINGS.redemptionRewards,
      ),
      rewardTypePreference: getRewardTypePreferenceFromSettings(
        DEFAULT_LOYALTY_SETTINGS.redemptionRewards,
      ),
      loyaltySetting: DEFAULT_LOYALTY_SETTINGS,
    };
  }

  try {
    const shop = await prisma.shop.findUnique({
      where: {
        shopDomain,
      },
      select: {
        ...getShopPlanSelect(),
        loyaltySetting: {
          select: {
            redemptionRewards: true,
            checkoutRedemptionEnabled: true,
            ...(hasLoyaltySettingField("preferredIntegration")
              ? {
                  preferredIntegration: true,
                }
              : {}),
            ...getTextSettingsSelect(),
          },
        },
      },
    });

    return {
      checkoutRedemptionEnabled: isRewardsRedemptionEnabled(
        shop?.loyaltySetting,
      ),
      checkoutIntegrationEnabled: isCheckoutRedemptionAvailable(
        shop,
        shop?.loyaltySetting,
      ),
      effectiveIntegration: getEffectiveIntegration(shop, shop?.loyaltySetting),
      rewardOptions: getRewardOptionsForPreference(
        shop?.loyaltySetting?.redemptionRewards,
      ),
      rewardTypePreference: getRewardTypePreferenceFromSettings(
        shop?.loyaltySetting?.redemptionRewards,
      ),
      loyaltySetting: shop?.loyaltySetting,
    };
  } catch (error) {
    if (!isMissingLoyaltySettingFieldError(error)) {
      throw error;
    }

    return {
      checkoutRedemptionEnabled:
        DEFAULT_LOYALTY_SETTINGS.checkoutRedemptionEnabled,
      checkoutIntegrationEnabled:
        DEFAULT_LOYALTY_SETTINGS.checkoutRedemptionEnabled,
      effectiveIntegration: DEFAULT_LOYALTY_SETTINGS.preferredIntegration,
      rewardOptions: getRewardOptionsForPreference(
        DEFAULT_LOYALTY_SETTINGS.redemptionRewards,
      ),
      rewardTypePreference: getRewardTypePreferenceFromSettings(
        DEFAULT_LOYALTY_SETTINGS.redemptionRewards,
      ),
      loyaltySetting: DEFAULT_LOYALTY_SETTINGS,
    };
  }
}

async function getLoyaltyBalance(customerId, shop) {
  const shopifyCustomerId = getShopifyCustomerId(customerId);
  const shopDomain = normalizeShopDomain(shop);

  if (!shopifyCustomerId) {
    return json(
      {
        success: false,
        message: "Customer is not available",
      },
      { status: 400 },
    );
  }

  const customer = await findCustomerWithRewards(shopifyCustomerId, shopDomain);

  if (!customer) {
    const integrationStatus = await getShopIntegrationStatus(shopDomain);
    const textSettings = buildTextSettingsResponse(
      integrationStatus.loyaltySetting,
    );

    return json({
      success: true,
      customerId: null,
      loyaltyPoints: 0,
      storeCreditReward,
      ...integrationStatus,
      ...textSettings,
    });
  }
  const rewardOptions =
    getRewardOptionsForPreference(
      customer.shop?.loyaltySetting?.redemptionRewards,
    ) || DEFAULT_REWARD_OPTIONS;
  const checkoutRedemptionEnabled = isCheckoutRedemptionAvailable(
    customer.shop,
    customer.shop?.loyaltySetting,
  );
  const rewardsRedemptionEnabled = isRewardsRedemptionEnabled(
    customer.shop?.loyaltySetting,
  );
  const effectiveIntegration = getEffectiveIntegration(
    customer.shop,
    customer.shop?.loyaltySetting,
  );
  const textSettings = buildTextSettingsResponse(
    customer.shop?.loyaltySetting,
  );
  const storeCreditBalance = await getStoreCreditBalance(
    customer.shop?.shopDomain || shopDomain,
    shopifyCustomerId,
  );

  return json({
    success: true,
    customerId: customer.id,
    loyaltyPoints: customer.loyaltyPoints,
    rewardOptions,
    storeCreditReward,
    storeCreditBalance,
    checkoutRedemptionEnabled: rewardsRedemptionEnabled,
    checkoutIntegrationEnabled: checkoutRedemptionEnabled,
    effectiveIntegration,
    rewardTypePreference: getRewardTypePreferenceFromSettings(
      customer.shop?.loyaltySetting?.redemptionRewards,
    ),
    ...textSettings,
  });
}

async function ensureWebhooksFromPublicRequest(shopDomain, origin) {
  if (!shopDomain || !origin) {
    return;
  }

  const cacheKey = `${shopDomain}:${origin}`;

  if (checkedWebhookSubscriptions.has(cacheKey)) {
    return;
  }

  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    await ensureOrderWebhookSubscriptions(admin, origin);
    checkedWebhookSubscriptions.add(cacheKey);
  } catch (error) {
    logError("loyalty-balance:webhook-subscriptions", error, {
      shopDomain,
      origin,
    });
  }
}

export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const shopDomain = normalizeShopDomain(shop);
    const origin = getPublicRequestOrigin(request);

    await ensureWebhooksFromPublicRequest(shopDomain, origin);

    return getLoyaltyBalance(url.searchParams.get("customerId"), shop);
  } catch (error) {
    logError("loyalty-balance:loader", error);

    return json(
      {
        success: false,
        message: "Could not load points",
        rewardOptions: DEFAULT_REWARD_OPTIONS,
      },
      { status: 500 },
    );
  }
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: CORS_HEADERS,
    });
  }

  try {
    const body = await parseJsonRequest(request, "loyalty balance");
    const shopDomain = normalizeShopDomain(body.shop);
    const origin = getPublicRequestOrigin(request);

    await ensureWebhooksFromPublicRequest(shopDomain, origin);

    return getLoyaltyBalance(body.customerId, body.shop);
  } catch (error) {
    logError("loyalty-balance:action", error);

    return json(
      {
        success: false,
        message: "Could not load points",
        rewardOptions: DEFAULT_REWARD_OPTIONS,
      },
      { status: error?.status === 400 ? 400 : 500 },
    );
  }
};

export const headers = () => CORS_HEADERS;
