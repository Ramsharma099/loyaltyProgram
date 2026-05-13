import prisma from "../db.server";

export const loader = async () => {
  try {
    const shopDomain = "hydrogen-jey.myshopify.com";

    // find or create shop
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

    // sample order data
    const order = {
      customerId: "123456",
      name: "Ashwanth",
      email: "ashwanth@test.com",
      totalPrice: 1250,
    };

    // calculate points
    const points = Math.floor(order.totalPrice / 100) * 10;

    // find customer
    let customer = await prisma.customer.findFirst({
      where: {
        shopId: shop.id,
        shopifyCustomerId: order.customerId,
      },
    });

    // create customer if not exists
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          shopId: shop.id,
          shopifyCustomerId: order.customerId,
          name: order.name,
          email: order.email,
          loyaltyPoints: points,
        },
      });
    } else {
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

    // create transaction
    await prisma.pointTransaction.create({
      data: {
        customerId: customer.id,
        points,
        transactionType: "credit",
        reason: "Order Reward",
      },
    });

    return Response.json({
      success: true,
      pointsAdded: points,
      customer,
    });
  } catch (error) {
    console.error(error);

    return Response.json({
      success: false,
      error,
    });
  }
};