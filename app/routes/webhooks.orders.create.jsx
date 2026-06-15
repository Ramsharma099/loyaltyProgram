import { authenticate } from "../shopify.server";
import { addOrderRewardPoints } from "../services/order-points.server";
import {
  webhookAuthenticationError,
  webhookProcessingError,
} from "../services/errors.server";

export const action = async ({ request }) => {
  let webhook;

  try {
    webhook = await authenticate.webhook(request);
  } catch (error) {
    return webhookAuthenticationError("orders/create", error);
  }

  const { shop, payload } = webhook;

  try {
    await addOrderRewardPoints(shop, payload);

    return new Response("Webhook processed", {
      status: 200,
    });
  } catch (error) {
    return webhookProcessingError("orders/create", error, { shop });
  }
};
