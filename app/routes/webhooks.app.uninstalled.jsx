import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  webhookAuthenticationError,
  webhookProcessingError,
} from "../services/errors.server";

export const action = async ({ request }) => {
  let webhook;

  try {
    webhook = await authenticate.webhook(request);
  } catch (error) {
    return webhookAuthenticationError("app/uninstalled", error);
  }

  const { shop } = webhook;

  try {
    await prisma.shop.deleteMany({
      where: {
        shopDomain: shop,
      },
    });

    return new Response("App uninstalled");
  } catch (error) {
    return webhookProcessingError("app/uninstalled", error, { shop });
  }
};
