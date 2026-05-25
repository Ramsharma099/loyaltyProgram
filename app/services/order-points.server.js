import prisma from "../db.server";
import {
  calculateSpendPoints,
  getLoyaltySettings,
} from "./loyalty-settings.server";

function getOrderId(payload) {
  return String(payload?.admin_graphql_api_id || payload?.id || "");
}

function getOrderTotal(payload) {
  return Number(
    payload?.current_total_price ||
      payload?.total_price ||
      payload?.subtotal_price ||
      0,
  );
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
