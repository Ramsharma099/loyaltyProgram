import { authenticate } from "../shopify.server";
import { addSignupBonus } from "../services/loyalty.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

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
    console.error(error);

    return new Response("Webhook Error", {
      status: 500,
    });
  }
};
