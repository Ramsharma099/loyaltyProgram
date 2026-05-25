import { authenticate } from "../shopify.server";
import { addOrderRewardPoints } from "../services/order-points.server";

export const action = async ({ request }) => {
  let webhook;

  try {
    webhook = await authenticate.webhook(request);
  } catch (error) {
    return new Response("Webhook authentication failed", {
      status: 401,
    });
  }

  const { shop, payload } = webhook;

  try {
    await addOrderRewardPoints(shop, payload);

    return new Response("Webhook processed", {
      status: 200,
    });
  } catch (error) {
    console.error("[orders/create] Webhook error", error);

    return new Response("Webhook Error", {
      status: 500,
    });
  }
};
