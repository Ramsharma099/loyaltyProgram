import prisma from "../db.server";
import { DEFAULT_LOYALTY_SETTINGS } from "./loyalty-settings.shared";

export {
  DEFAULT_LOYALTY_SETTINGS,
  DEFAULT_REWARD_OPTIONS,
  SPECIAL_REWARD_OPTIONS,
  getRewardOptionsWithSpecials,
  normalizeRewardOptions,
} from "./loyalty-settings.shared";

export async function findOrCreateShop(shopDomain) {
  let shop = await prisma.shop.findUnique({
    where: {
      shopDomain,
    },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain,
      },
    });
  }

  return shop;
}

export async function getLoyaltySettings(shopDomain) {
  const shop = await findOrCreateShop(shopDomain);

  const settings = await prisma.loyaltySetting.upsert({
    where: {
      shopId: shop.id,
    },
    update: {},
    create: {
      shopId: shop.id,
      ...DEFAULT_LOYALTY_SETTINGS,
    },
  });

  return {
    shop,
    settings,
  };
}

export function calculateSpendPoints(amount, spendAmount, spendPoints) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || spendAmount <= 0 || spendPoints <= 0) {
    return 0;
  }

  return Math.floor(numericAmount / spendAmount) * spendPoints;
}
