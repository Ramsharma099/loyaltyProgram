import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log("Webhook received:", topic);
  console.log("Shop:", shop);

  try {
    const customerData = payload.customer;

    if (!customerData) {
      console.log("No customer found");

      return new Response("No customer", {
        status: 200,
      });
    }

    const orderAmount = Number(payload.total_price);

    // loyalty formula
    const points = Math.floor(orderAmount / 100) * 10;

    // find or create shop
    let shopRecord = await prisma.shop.findUnique({
      where: {
        shopDomain: shop,
      },
    });

    if (!shopRecord) {
      shopRecord = await prisma.shop.create({
        data: {
          shopDomain: shop,
        },
      });
    }

    // find customer
    let customer = await prisma.customer.findFirst({
      where: {
        shopId: shopRecord.id,
        shopifyCustomerId: String(customerData.id),
      },
    });

    // create customer
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          shopId: shopRecord.id,
          shopifyCustomerId: String(customerData.id),
          name: `${customerData.first_name || ""} ${customerData.last_name || ""}`,
          email: customerData.email,
          loyaltyPoints: points,
        },
      });
    } else {
      // update existing points
      customer = await prisma.customer.update({
        where: {
          id: customer.id,
        },
        data: {
          loyaltyPoints: {
            increment: points,
          },
        },
      });
    }

    // transaction log
    await prisma.pointTransaction.create({
      data: {
        customerId: customer.id,
        points,
        transactionType: "credit",
        reason: "Order Reward",
      },
    });

    console.log("Points added:", points);

    return new Response("Webhook processed", {
      status: 200,
    });
  } catch (error) {
    console.error(error);

    return new Response("Webhook Error", {
      status: 500,
    });
  }
};