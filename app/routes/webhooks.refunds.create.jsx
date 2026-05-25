import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  calculateSpendPoints,
  getLoyaltySettings,
} from "../services/loyalty-settings.server";

export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);

  try {
    const customerData = payload.order.customer;

    if (!customerData) {
      return new Response("No customer");
    }

    const refundAmount = Number(payload.order.total_price);

    const { settings } = await getLoyaltySettings(shop);
    const pointsToDeduct = calculateSpendPoints(
      refundAmount,
      settings.refundSpendAmount,
      settings.refundSpendPoints,
    );

    const customer = await prisma.customer.findFirst({
      where: {
        shopifyCustomerId: String(customerData.id),
      },
    });

    if (!customer) {
      return new Response("Customer not found");
    }

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

    return new Response("Refund processed");
  } catch (error) {
    console.error(error);

    return new Response("Error", {
      status: 500,
    });
  }
};
