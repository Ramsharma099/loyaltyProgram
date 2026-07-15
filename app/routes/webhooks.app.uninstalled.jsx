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
    // Shopify revokes these tokens when the app is uninstalled. Keep the
    // merchant's loyalty configuration and customer history so a reinstall
    // cannot erase earned points or reward records.
    await prisma.session.deleteMany({ where: { shop } });

    return new Response("App uninstalled");
  } catch (error) {
    return webhookProcessingError("app/uninstalled", error, { shop });
  }
};
