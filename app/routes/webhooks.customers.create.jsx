import { authenticate } from "../shopify.server";
import { addSignupBonus } from "../services/loyalty.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log("Webhook received:", topic);
  console.log("Shop:", shop);

  try {
    if (!payload?.id) {
      console.log("No customer payload found");

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
