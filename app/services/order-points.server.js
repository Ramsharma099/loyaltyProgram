import prisma from "../db.server";
import {
  calculateSpendPoints,
  getLoyaltySettings,
} from "./loyalty-settings.server";
import {
  createRewardActivityLog,
  expirePendingDiscountRedemptions,
  REWARD_ACTIVITY_TYPES,
  tryCreateRewardActivityLog,
} from "./reward-activity.server";

function getOrderId(payload) {
  return String(payload?.admin_graphql_api_id || payload?.id || "");
}

function getOrderName(payload) {
  return String(payload?.name || payload?.order_number || "").trim();
}

function getOrderTotal(payload) {
  return Number(
    payload?.current_total_price ||
      payload?.total_price ||
      payload?.subtotal_price ||
      0,
  );
}

function getDiscountCodes(payload) {
  const codes = new Set();
  const addCode = (code) => {
    if (typeof code === "string" && code.trim()) {
      codes.add(code.trim());
    }
  };

  for (const discount of payload?.discount_codes || []) {
    addCode(discount?.code);
  }

  for (const discount of payload?.current_discount_codes || []) {
    addCode(discount?.code);
  }

  for (const application of payload?.discount_applications || []) {
    addCode(application?.code);
    addCode(application?.title);
  }

  return Array.from(codes);
}

function getCustomerName(customerData) {
  return `${customerData?.first_name || ""} ${customerData?.last_name || ""}`.trim();
}

export async function addOrderRewardPoints(shopDomain, payload) {
  const customerData = payload?.customer;
  const orderId = getOrderId(payload);
  const orderTotal = getOrderTotal(payload);

  if (!customerData?.id) {
    return {
      status: "skipped",
      message: "No customer found",
    };
  }

  const { shop, settings } = await getLoyaltySettings(shopDomain);
  const points = calculateSpendPoints(
    orderTotal,
    settings.orderSpendAmount,
    settings.orderSpendPoints,
  );

  const reason = orderId ? `Order Reward:${orderId}` : "Order Reward";

  let customer = await prisma.customer.findFirst({
    where: {
      shopId: shop.id,
      shopifyCustomerId: String(customerData.id),
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        shopId: shop.id,
        shopifyCustomerId: String(customerData.id),
        name: getCustomerName(customerData),
        email: customerData.email,
        loyaltyPoints: 0,
      },
    });
  }

  if (orderId) {
    const existingTransaction = await prisma.pointTransaction.findFirst({
      where: {
        customerId: customer.id,
        transactionType: "credit",
        reason,
      },
    });

    if (existingTransaction) {
      return {
        status: "skipped",
        message: "Order already rewarded",
        customer,
        points,
      };
    }
  }

  if (points <= 0) {
    return {
      status: "skipped",
      message: "Order total did not meet the points threshold",
      customer,
      points,
      orderTotal,
    };
  }

  const updatedCustomer = await prisma.$transaction(async (tx) => {
    const nextCustomer = await tx.customer.update({
      where: {
        id: customer.id,
      },
      data: {
        loyaltyPoints: {
          increment: points,
        },
      },
    });

    await tx.pointTransaction.create({
      data: {
        customerId: customer.id,
        points,
        transactionType: "credit",
        reason,
      },
    });

    return nextCustomer;
  });

  return {
    status: "credited",
    customer: updatedCustomer,
    points,
    orderTotal,
  };
}

export async function settleOrderRedemptions(shopDomain, payload) {
  const orderId = getOrderId(payload);
  const orderName = getOrderName(payload);
  const discountCodes = getDiscountCodes(payload);

  await expirePendingDiscountRedemptions();

  if (!orderId || discountCodes.length === 0) {
    return {
      status: "skipped",
      message: "No loyalty discount codes found",
      settled: 0,
    };
  }

  const shop = await prisma.shop.findUnique({
    where: {
      shopDomain,
    },
  });

  if (!shop) {
    return {
      status: "skipped",
      message: "Shop not found",
      settled: 0,
    };
  }

  const pendingRewards = await prisma.reward.findMany({
    where: {
      rewardCode: {
        in: discountCodes,
      },
      status: "pending",
      customer: {
        shopId: shop.id,
      },
    },
    include: {
      customer: true,
    },
  });

  if (pendingRewards.length === 0) {
    return {
      status: "skipped",
      message: "No pending loyalty redemptions found",
      settled: 0,
    };
  }

  const settledRewards = [];

  for (const reward of pendingRewards) {
    const reason = `Reward Redemption:${orderId}:${reward.rewardCode}`;
    const appliedAt = new Date();

    let settled;

    try {
      settled = await prisma.$transaction(async (tx) => {
        const updatedReward = await tx.reward.updateMany({
          where: {
            id: reward.id,
            status: "pending",
          },
          data: {
            status: "redeemed",
            orderId,
            appliedAt,
          },
        });

        if (updatedReward.count === 0) {
          return null;
        }

        await tx.customer.update({
          where: {
            id: reward.customerId,
          },
          data: {
            loyaltyPoints: {
              decrement: reward.pointsUsed,
            },
          },
        });

        await tx.pointTransaction.create({
          data: {
            customerId: reward.customerId,
            points: reward.pointsUsed,
            transactionType: "debit",
            reason,
          },
        });

        await createRewardActivityLog(tx, {
          customerId: reward.customerId,
          rewardId: reward.id,
          rewardCode: reward.rewardCode,
          activityType: REWARD_ACTIVITY_TYPES.DISCOUNT_APPLIED,
          message: "Discount applied to a paid order.",
          metadata: {
            orderId,
            orderName,
            pointsUsed: reward.pointsUsed,
            discountAmount: reward.discountAmount,
            appliedAt,
          },
        });

        return reward;
      });
    } catch (error) {
      await tryCreateRewardActivityLog({
        customerId: reward.customerId,
        rewardId: reward.id,
        rewardCode: reward.rewardCode,
        activityType: REWARD_ACTIVITY_TYPES.DISCOUNT_FAILED,
        message: error?.message || "Could not apply discount redemption.",
        metadata: {
          orderId,
          orderName,
          pointsUsed: reward.pointsUsed,
        },
      });

      throw error;
    }

    if (settled) {
      settledRewards.push(settled);
    }
  }

  return {
    status: settledRewards.length > 0 ? "settled" : "skipped",
    settled: settledRewards.length,
    rewards: settledRewards,
  };
}
