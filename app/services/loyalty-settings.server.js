import prisma from "../db.server";

export const DEFAULT_LOYALTY_SETTINGS = {
  signupBonusPoints: 100,
  orderSpendAmount: 100,
  orderSpendPoints: 10,
  refundSpendAmount: 100,
  refundSpendPoints: 10,
};

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
