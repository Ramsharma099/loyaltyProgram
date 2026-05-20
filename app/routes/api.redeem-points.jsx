import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

// CORS HEADERS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type",
};

// OPTIONS HANDLER
export const loader = async () => {
  return Response.json(
    {},
    {
      headers: corsHeaders,
    }
  );
};

export const action = async ({
  request,
}) => {
  // HANDLE PREFLIGHT REQUEST
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const body = await request.json();

    const {
      customerId,
      pointsToRedeem,
    } = body;

    const redeemPoints =
      Number(pointsToRedeem);

    if (
      !customerId ||
      !Number.isInteger(redeemPoints) ||
      redeemPoints <= 0
    ) {
      return Response.json(
        {
          success: false,
          message:
            "Invalid redemption request",
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // FIND CUSTOMER
    const customer =
      await prisma.customer.findUnique({
        where: {
          id: Number(customerId),
        },

        include: {
          shop: true,
        },
      });

    if (!customer) {
      return Response.json(
        {
          success: false,
          message: "Customer not found",
        },
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    const { admin } =
      await unauthenticated.admin(
        customer.shop.shopDomain
      );

    // VALIDATE POINTS
    if (
      customer.loyaltyPoints <
      redeemPoints
    ) {
      return Response.json(
        {
          success: false,
          message: "Insufficient points",
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // DISCOUNT FORMULA
    const discountAmount =
      (redeemPoints / 100) * 10;

    // GENERATE CODE
    const rewardCode =
      "LOYALTY-" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    // SHOPIFY MUTATION
    const mutation = `
      mutation discountCodeBasicCreate(
        $basicCodeDiscount: DiscountCodeBasicInput!
      ) {
        discountCodeBasicCreate(
          basicCodeDiscount: $basicCodeDiscount
        ) {
          codeDiscountNode {
            id
          }

          userErrors {
            field
            code
            message
          }
        }
      }
    `;

    // CREATE DISCOUNT
    const response =
      await admin.graphql(mutation, {
        variables: {
          basicCodeDiscount: {
            title: rewardCode,

            code: rewardCode,

            startsAt:
              new Date().toISOString(),

            customerSelection: {
              customers: {
                add: [
                  `gid://shopify/Customer/${customer.shopifyCustomerId}`,
                ],
              },
            },

            customerGets: {
              value: {
                discountAmount: {
                  amount:
                    discountAmount.toString(),

                  appliesOnEachItem:
                    false,
                },
              },

              items: {
                all: true,
              },
            },

            combinesWith: {
              orderDiscounts: false,
              productDiscounts: false,
              shippingDiscounts: false,
            },

            appliesOncePerCustomer: true,

            usageLimit: 1,
          },
        },
      });

    const result =
      await response.json();

    const discountResult =
      result?.data
        ?.discountCodeBasicCreate;

    const userErrors =
      discountResult?.userErrors ??
      [];

    // GRAPHQL ERRORS
    if (result.errors?.length) {
      console.error(
        "Shopify GraphQL errors:",
        JSON.stringify(
          result.errors
        )
      );

      return Response.json(
        {
          success: false,
          message:
            "Could not create discount code",
          errors: result.errors,
        },
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    // USER ERRORS
    if (userErrors.length) {
      console.error(
        "Shopify discount errors:",
        JSON.stringify(userErrors)
      );

      return Response.json(
        {
          success: false,
          message:
            userErrors[0]?.message ||
            "Could not create discount code",
          errors: userErrors,
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // VALIDATE RESPONSE
    if (
      !discountResult
        ?.codeDiscountNode?.id
    ) {
      return Response.json(
        {
          success: false,
          message:
            "Shopify did not return a discount code",
        },
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    // DATABASE TRANSACTION
    const reward =
      await prisma.$transaction(
        async (tx) => {
          // DEDUCT POINTS
          await tx.customer.update({
            where: {
              id: customer.id,
            },

            data: {
              loyaltyPoints: {
                decrement:
                  redeemPoints,
              },
            },
          });

          // TRANSACTION HISTORY
          await tx.pointTransaction.create(
            {
              data: {
                customerId:
                  customer.id,

                points:
                  redeemPoints,

                transactionType:
                  "debit",

                reason:
                  "Reward Redemption",
              },
            }
          );

          // SAVE REWARD
          return tx.reward.create({
            data: {
              customerId:
                customer.id,

              rewardCode,

              discountAmount,

              pointsUsed:
                redeemPoints,
            },
          });
        }
      );

    return Response.json(
      {
        success: true,
        reward,
      },
      {
        headers: corsHeaders,
      }
    );
  } catch (error) {
    if (error instanceof Response) {
      return Response.json(
        {
          success: false,
          message:
            "Shopify session unavailable. Open embedded app once and retry.",
        },
        {
          status:
            error.status === 410
              ? 401
              : error.status || 500,

          headers: corsHeaders,
        }
      );
    }

    console.error(
      "Redeem error:",
      error,
      error?.stack
    );

    return Response.json(
      {
        success: false,
        message:
          error?.message ||
          "Could not redeem points",
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
};