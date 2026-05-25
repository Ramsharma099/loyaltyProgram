import { addOrderRewardPoints } from "../services/order-points.server";

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
    console.error("[api/test-order] Manual order reward test failed", error);

    return Response.json({
      success: false,
      error: error.message,
    });
  }
};
