import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import {
  DEFAULT_REWARD_OPTIONS,
  getRewardOptionsWithSpecials,
  normalizeRewardOptions,
} from "../services/loyalty-settings.server";
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

function isMissingRedemptionRewardsError(error) {
  const message = String(error?.message || "");

  return (
    error?.code === "P2022" ||
    message.includes("redemptionRewards") ||
    message.includes("Unknown field")
  );
}

function hasRedemptionRewardsField() {
  const fields = prisma._runtimeDataModel?.models?.LoyaltySetting?.fields || [];

  return fields.some((field) => field.name === "redemptionRewards");
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
  if (!hasRedemptionRewardsField()) {
    return findCustomer(shopifyCustomerId, shopDomain);
  }

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
            loyaltySetting: {
              select: {
                redemptionRewards: true,
              },
            },
          },
        },
      },
    });
  } catch (error) {
    if (!isMissingRedemptionRewardsError(error)) {
      throw error;
    }

    return findCustomer(shopifyCustomerId, shopDomain);
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
    return json({
      success: true,
      customerId: null,
      loyaltyPoints: 0,
      rewardOptions: getRewardOptionsWithSpecials(),
    });
  }
  const rewardOptions =
    getRewardOptionsWithSpecials(
      customer.shop?.loyaltySetting?.redemptionRewards,
    ) || DEFAULT_REWARD_OPTIONS;

  return json({
    success: true,
    customerId: customer.id,
    loyaltyPoints: customer.loyaltyPoints,
    rewardOptions,
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

    return getLoyaltyBalance(
      url.searchParams.get("customerId"),
      shop,
    );
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
