import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);

  try {
    await prisma.shop.deleteMany({
      where: {
        shopDomain: shop,
      },
    });

    console.log("Shop removed:", shop);

    return new Response("App uninstalled");
  } catch (error) {
    console.error(error);

    return new Response("Error", {
      status: 500,
    });
  }
};