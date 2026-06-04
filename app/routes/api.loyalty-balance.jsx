import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  DEFAULT_LOYALTY_SETTINGS,
  DEFAULT_REWARD_OPTIONS,
  getRewardOptionsWithSpecials,
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const checkedWebhookSubscriptions = new Set();

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
            checkoutRedemptionEnabled: true,
            ...(hasLoyaltySettingField("preferredIntegration")
              ? {
                  preferredIntegration: true,
                }
              : {}),
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

    return json({
      success: true,
      customerId: null,
      loyaltyPoints: 0,
      rewardOptions: getRewardOptionsWithSpecials(),
      ...integrationStatus,
    });
  }
  const rewardOptions =
    getRewardOptionsWithSpecials(
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

  return json({
    success: true,
    customerId: customer.id,
    loyaltyPoints: customer.loyaltyPoints,
    rewardOptions,
    checkoutRedemptionEnabled: rewardsRedemptionEnabled,
    checkoutIntegrationEnabled: checkoutRedemptionEnabled,
    effectiveIntegration,
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
    console.error("[loyalty-balance] Webhook subscription check failed", {
      shopDomain,
      origin,
      message: error.message,
      stack: error.stack,
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
    console.error("Loyalty balance error:", error);

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
    const body = await request.json();
    const shopDomain = normalizeShopDomain(body.shop);
    const origin = getPublicRequestOrigin(request);

    await ensureWebhooksFromPublicRequest(shopDomain, origin);

    return getLoyaltyBalance(body.customerId, body.shop);
  } catch (error) {
    console.error("Loyalty balance error:", error);

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

export const headers = () => CORS_HEADERS;
