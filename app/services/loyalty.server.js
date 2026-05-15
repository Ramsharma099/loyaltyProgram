import prisma from "../db.server";
import { getLoyaltySettings } from "./loyalty-settings.server";

export async function addSignupBonus(shopDomain, customerData) {
  try {
    const { shop, settings } = await getLoyaltySettings(shopDomain);

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
        loyaltyPoints: settings.signupBonusPoints,
      },
    });

    // create transaction
    await prisma.pointTransaction.create({
      data: {
        customerId: customer.id,
        points: settings.signupBonusPoints,
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
