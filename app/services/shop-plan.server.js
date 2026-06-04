import prisma from "../db.server";
import { INTEGRATION_OPTIONS } from "./integrations.shared";

export function canUseCheckoutIntegration(shop) {
  return Boolean(shop?.isShopifyPlus || shop?.isPartnerDevelopment);
}

export function getEffectiveIntegration(shop) {
  return canUseCheckoutIntegration(shop)
    ? INTEGRATION_OPTIONS.CHECKOUT
    : INTEGRATION_OPTIONS.THEME;
}

export function isCheckoutRedemptionAvailable(shop, settings) {
  return (
    getEffectiveIntegration(shop) === INTEGRATION_OPTIONS.CHECKOUT &&
    settings?.checkoutRedemptionEnabled !== false
  );
}

export function isRewardsRedemptionEnabled(settings) {
  return settings?.checkoutRedemptionEnabled !== false;
}

export function hasShopPlanField(fieldName) {
  const fields = prisma._runtimeDataModel?.models?.Shop?.fields || [];

  return fields.some((field) => field.name === fieldName);
}

export function isMissingShopPlanFieldError(error) {
  const message = String(error?.message || "");

  return (
    error?.code === "P2022" ||
    message.includes("shopifyPlanName") ||
    message.includes("isShopifyPlus") ||
    message.includes("isPartnerDevelopment") ||
    message.includes("preferredIntegration") ||
    message.includes("Unknown field")
  );
}

export function getShopPlanSelect() {
  return {
    id: true,
    shopDomain: true,
    ...(hasShopPlanField("shopifyPlanName")
      ? {
          shopifyPlanName: true,
        }
      : {}),
    ...(hasShopPlanField("isShopifyPlus")
      ? {
          isShopifyPlus: true,
        }
      : {}),
    ...(hasShopPlanField("isPartnerDevelopment")
      ? {
          isPartnerDevelopment: true,
        }
      : {}),
  };
}

export async function fetchShopPlan(admin) {
  const response = await admin.graphql(
    `#graphql
      query ShopPlan {
        shop {
          plan {
            publicDisplayName
            shopifyPlus
            partnerDevelopment
          }
        }
      }
    `,
  );
  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(JSON.stringify(result.errors));
  }

  return result.data.shop.plan;
}

export async function syncShopPlan(shopDomain, admin) {
  const plan = await fetchShopPlan(admin);
  const data = {
    shopifyPlanName: plan.publicDisplayName,
    isShopifyPlus: Boolean(plan.shopifyPlus),
    isPartnerDevelopment: Boolean(plan.partnerDevelopment),
  };

  try {
    return await prisma.shop.upsert({
      where: {
        shopDomain,
      },
      update: data,
      create: {
        shopDomain,
        ...data,
      },
      select: getShopPlanSelect(),
    });
  } catch (error) {
    if (!isMissingShopPlanFieldError(error)) {
      throw error;
    }

    return prisma.shop.upsert({
      where: {
        shopDomain,
      },
      update: {},
      create: {
        shopDomain,
      },
      select: {
        id: true,
        shopDomain: true,
      },
    });
  }
}
