import crypto from "node:crypto";

export const hydrogenCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function getHydrogenApiToken() {
  return (
    process.env.HYDROGEN_LOYALTY_API_TOKEN ||
    process.env.LOYALTY_HYDROGEN_API_TOKEN ||
    ""
  ).trim();
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hydrogenOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: hydrogenCorsHeaders,
  });
}

export function requireHydrogenApiRequest(request) {
  const expectedToken = getHydrogenApiToken();

  if (!expectedToken) {
    return Response.json(
      {
        success: false,
        message: "Hydrogen loyalty API token is not configured.",
      },
      {
        status: 503,
        headers: hydrogenCorsHeaders,
      },
    );
  }

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token || !safeEqual(token, expectedToken)) {
    return Response.json(
      {
        success: false,
        message: "Unauthorized Hydrogen loyalty request.",
      },
      {
        status: 401,
        headers: hydrogenCorsHeaders,
      },
    );
  }

  return null;
}
