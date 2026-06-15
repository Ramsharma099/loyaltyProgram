import { authenticate } from "../shopify.server";
import { addSignupBonus } from "../services/loyalty.server";
import {
  webhookAuthenticationError,
  webhookProcessingError,
} from "../services/errors.server";

export const action = async ({ request }) => {
  let webhook;

  try {
    webhook = await authenticate.webhook(request);
  } catch (error) {
    return webhookAuthenticationError("customers/create", error);
  }

  const { shop, payload } = webhook;

  try {
    if (!payload?.id) {
      return new Response("No customer", {
        status: 200,
      });
    }

    await addSignupBonus(shop, payload);

    return new Response("Customer webhook processed", {
      status: 200,
    });
  } catch (error) {
    return webhookProcessingError("customers/create", error, { shop });
  }
};
