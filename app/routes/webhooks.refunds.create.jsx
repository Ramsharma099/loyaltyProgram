import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  calculateSpendPoints,
  getLoyaltySettings,
} from "../services/loyalty-settings.server";
import {
  createRewardActivityLog,
  REWARD_ACTIVITY_TYPES,
} from "../services/reward-activity.server";
import {
  webhookAuthenticationError,
  webhookProcessingError,
} from "../services/errors.server";

function getOrderId(payload) {
  return String(
    payload?.order?.admin_graphql_api_id || payload?.order?.id || "",
  );
}

function getOrderName(payload) {
  return String(
    payload?.order?.name || payload?.order?.order_number || "",
  ).trim();
}

export const action = async ({ request }) => {
  let webhook;

  try {
    webhook = await authenticate.webhook(request);
  } catch (error) {
    return webhookAuthenticationError("refunds/create", error);
  }

  const { payload, shop } = webhook;

  try {
    const customerData = payload?.order?.customer;

    if (!customerData) {
      return new Response("No customer");
    }

    const refundAmount = Number(payload.order.total_price);

    const { shop: loyaltyShop, settings } = await getLoyaltySettings(shop);
    const pointsToDeduct = calculateSpendPoints(
      refundAmount,
      settings.refundSpendAmount,
      settings.refundSpendPoints,
    );

    const customer = await prisma.customer.findFirst({
      where: {
        shopId: loyaltyShop.id,
        shopifyCustomerId: String(customerData.id),
      },
    });

    if (!customer) {
      return new Response("Customer not found");
    }

    if (pointsToDeduct > 0) {
      // deduct points
      await prisma.customer.update({
        where: {
          id: customer.id,
        },
        data: {
          loyaltyPoints: {
            decrement: pointsToDeduct,
          },
        },
      });

      // transaction log
      await prisma.pointTransaction.create({
        data: {
          customerId: customer.id,
          points: pointsToDeduct,
          transactionType: "debit",
          reason: "Refund Deduction",
        },
      });
    }

    const orderId = getOrderId(payload);
    const orderName = getOrderName(payload);

    if (orderId) {
      const redeemedRewards = await prisma.reward.findMany({
        where: {
          customerId: customer.id,
          rewardType: "discount",
          status: "redeemed",
          orderId,
        },
      });

      for (const reward of redeemedRewards) {
        await prisma.$transaction(async (tx) => {
          const updatedReward = await tx.reward.updateMany({
            where: {
              id: reward.id,
              status: "redeemed",
            },
            data: {
              status: "refunded",
            },
          });

          if (updatedReward.count === 0) {
            return;
          }

          await tx.customer.update({
            where: {
              id: customer.id,
            },
            data: {
              loyaltyPoints: {
                increment: reward.pointsUsed,
              },
            },
          });

          await tx.pointTransaction.create({
            data: {
              customerId: customer.id,
              points: reward.pointsUsed,
              transactionType: "credit",
              reason: `Reward Points Refunded:${orderId}:${reward.rewardCode}`,
            },
          });

          await createRewardActivityLog(tx, {
            customerId: customer.id,
            rewardId: reward.id,
            rewardCode: reward.rewardCode,
            activityType: REWARD_ACTIVITY_TYPES.POINTS_REFUNDED,
            message: "Points refunded for a refunded loyalty discount order.",
            metadata: {
              orderId,
              orderName,
              pointsRefunded: reward.pointsUsed,
              discountAmount: reward.discountAmount,
            },
          });
        });
      }
    }

    return new Response("Refund processed");
  } catch (error) {
    return webhookProcessingError("refunds/create", error, { shop });
  }
};
