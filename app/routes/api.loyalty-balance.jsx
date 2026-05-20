import prisma from "../db.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init.headers,
    },
  });
}

function getShopifyCustomerId(customerId) {
  if (!customerId) {
    return null;
  }

  return String(customerId).split("/").pop();
}

async function getLoyaltyBalance(customerId) {
  const shopifyCustomerId = getShopifyCustomerId(customerId);
  if (!shopifyCustomerId) {
    return json(
      {
        success: false,
        message: "Customer is not available",
      },
      { status: 400 },
    );
  }

  const customer = await prisma.customer.findFirst({
    where: {
      shopifyCustomerId,
    },
    select: {
      id: true,
      loyaltyPoints: true,
    },
  });

  if (!customer) {
    return json({
      success: true,
      customerId: null,
      loyaltyPoints: 0,
    });
  }

  return json({
    success: true,
    customerId: customer.id,
    loyaltyPoints: customer.loyaltyPoints,
  });
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  return getLoyaltyBalance(url.searchParams.get("customerId"));
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: CORS_HEADERS,
    });
  }

  const body = await request.json();

  return getLoyaltyBalance(body.customerId);
};

export const headers = () => CORS_HEADERS;
