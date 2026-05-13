import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

export const action = async ({ request }) => {
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
        { status: 400 }
      );
    }

    // find customer
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
        { status: 404 }
      );
    }

    const { admin } =
      await unauthenticated.admin(
        customer.shop.shopDomain
      );

    // validate points
    if (
      customer.loyaltyPoints <
      redeemPoints
    ) {
      return Response.json(
        {
          success: false,
          message: "Insufficient points",
        },
        { status: 400 }
      );
    }

    // formula
    const discountAmount =
      (redeemPoints / 100) * 10;

    // discount code
    const rewardCode =
      "LOYALTY-" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    // create Shopify discount
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
    
    const response =
    await admin.graphql(
      mutation,
      {
        variables: {
          basicCodeDiscount: {
            title: rewardCode,
  
            code: rewardCode,
  
            startsAt:
              new Date().toISOString(),

            context: {
              all: true,
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
  
            appliesOncePerCustomer:
              true,

            usageLimit: 1,
          },
        },
      }
    );

    const result = await response.json();
    const discountResult =
      result?.data?.discountCodeBasicCreate;
    const userErrors =
      discountResult?.userErrors ?? [];

    if (result.errors?.length) {
      console.error(
        "Shopify GraphQL errors:",
        JSON.stringify(result.errors)
      );

      return Response.json(
        {
          success: false,
          message:
            "Could not create discount code",
          errors: result.errors,
        },
        { status: 502 }
      );
    }

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
        { status: 400 }
      );
    }

    if (!discountResult?.codeDiscountNode?.id) {
      return Response.json(
        {
          success: false,
          message:
            "Shopify did not return a discount code",
        },
        { status: 502 }
      );
    }

    const reward =
      await prisma.$transaction(
        async (tx) => {
          // deduct points
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

          // transaction
          await tx.pointTransaction.create({
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
          });

          // save reward
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
        },
      );

    return Response.json({
      success: true,
      reward,
    });
  } catch (error) {
    if (error instanceof Response) {
      return Response.json(
        {
          success: false,
          message:
            "Shopify session unavailable. Open the embedded app once for this shop, then retry the request.",
        },
        {
          status:
            error.status === 410
              ? 401
              : error.status || 500,
        }
      );
    }

    console.error(error);

    return Response.json(
      {
        success: false,
        message:
          "Could not redeem points",
      },
      { status: 500 }
    );
  }
};
