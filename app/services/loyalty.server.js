import prisma from "../db.server";

export async function addSignupBonus(shopDomain, customerData) {
  try {
    // find shop
    let shop = await prisma.shop.findUnique({
      where: {
        shopDomain,
      },
    });

    // create shop if not exists
    if (!shop) {
      shop = await prisma.shop.create({
        data: {
          shopDomain,
        },
      });
    }

    // check customer exists
    let customer = await prisma.customer.findFirst({
      where: {
        shopId: shop.id,
        shopifyCustomerId: String(customerData.id),
      },
    });

    if (customer) {
      console.log("Customer already exists");
      return customer;
    }

    // create customer
    customer = await prisma.customer.create({
      data: {
        shopId: shop.id,
        shopifyCustomerId: String(customerData.id),
        name: `${customerData.first_name || ""} ${customerData.last_name || ""}`.trim(),
        email: customerData.email,
        loyaltyPoints: 100,
      },
    });

    // create transaction
    await prisma.pointTransaction.create({
      data: {
        customerId: customer.id,
        points: 100,
        transactionType: "credit",
        reason: "Signup Bonus",
      },
    });

    console.log("Signup bonus added");

    return customer;
  } catch (error) {
    console.error(error);
  }
}