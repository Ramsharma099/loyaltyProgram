import { addOrderRewardPoints } from "../services/order-points.server";
import { logError } from "../services/errors.server";

export const loader = async () => {
  try {
    const shopDomain = "hydrogen-jey.myshopify.com";

    const payload = {
      id: Date.now(),
      admin_graphql_api_id: `gid://shopify/Order/test-${Date.now()}`,
      name: "#TEST-LOYALTY",
      current_total_price: "1250.00",
      total_price: "1250.00",
      financial_status: "paid",
      customer: {
        id: "9165706985700",
        first_name: "Test",
        last_name: "Customer",
        email: "test-customer@example.com",
      },
    };

    const result = await addOrderRewardPoints(shopDomain, payload);

    return Response.json({
      success: true,
      result,
    });
  } catch (error) {
    logError("api:test-order", error);

    return Response.json(
      {
        success: false,
        message: "Could not process the test order.",
      },
      { status: 500 },
    );
  }
};
