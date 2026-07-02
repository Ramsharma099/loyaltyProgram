import prisma from "../db.server";
import {
  DEFAULT_LOYALTY_SETTINGS,
  getRewardOptionsForPreference,
  getRewardTypePreferenceFromSettings,
  normalizeCheckoutRewardLimit,
} from "../services/loyalty-settings.server";
import {
  getEffectiveIntegration,
  getShopPlanSelect,
  isRewardsRedemptionEnabled,
} from "../services/shop-plan.server";
import { logError } from "../services/errors.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
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

function buildProgramResponse(shop) {
  const settings = shop?.loyaltySetting || DEFAULT_LOYALTY_SETTINGS;
  const rewardTypePreference = getRewardTypePreferenceFromSettings(
    settings.redemptionRewards,
  );
  const rewardOptions = getRewardOptionsForPreference(
    settings.redemptionRewards,
    rewardTypePreference,
  );

  return {
    success: true,
    shop: shop?.shopDomain || null,
    earningRules: {
      signupBonusPoints: settings.signupBonusPoints,
      orderSpendAmount: settings.orderSpendAmount,
      orderSpendPoints: settings.orderSpendPoints,
      refundSpendAmount: settings.refundSpendAmount,
      refundSpendPoints: settings.refundSpendPoints,
    },
    redemption: {
      enabled: isRewardsRedemptionEnabled(settings),
      activeIntegration: getEffectiveIntegration(shop, settings),
      rewardTypePreference,
      checkoutRewardLimit: normalizeCheckoutRewardLimit(
        settings.checkoutRewardLimit,
      ),
      rewardOptions,
    },
  };
}

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  try {
    const url = new URL(request.url);
    const shopDomain = normalizeShopDomain(url.searchParams.get("shop"));

    if (!shopDomain) {
      return json(
        {
          success: false,
          message: "Shop domain is required.",
        },
        { status: 400 },
      );
    }

    const shop = await prisma.shop.findUnique({
      where: {
        shopDomain,
      },
      select: {
        shopDomain: true,
        ...getShopPlanSelect(),
        loyaltySetting: true,
      },
    });

    return json(buildProgramResponse(shop || { shopDomain }));
  } catch (error) {
    logError("loyalty-program", error, {
      requestUrl: request.url,
    });

    return json(
      {
        success: false,
        message: "Could not load loyalty program data.",
      },
      { status: 500 },
    );
  }
};

export const headers = () => CORS_HEADERS;
