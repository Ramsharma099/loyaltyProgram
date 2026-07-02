# Hydrogen custom checkout integration

This app cannot reuse `extensions/loyalty-checkout/src/Checkout.jsx` inside Hydrogen. That file is a Shopify Checkout UI extension and depends on checkout extension APIs. Hydrogen should call the loyalty app from server-side loaders/actions, apply the returned code to the Storefront cart, then redirect to the cart `checkoutUrl`.

## Step 1: Configure the shared server token

Set the same secret in both apps:

```bash
HYDROGEN_LOYALTY_API_TOKEN="replace-with-a-long-random-secret"
```

Set this in the loyalty app environment and in the Hydrogen environment. Hydrogen also needs:

```bash
LOYALTY_APP_URL="https://your-loyalty-app.example.com"
PUBLIC_STORE_DOMAIN="your-shop.myshopify.com"
```

## Step 2: Use the protected loyalty API routes

Hydrogen should call these routes from the server, with `Authorization: Bearer <HYDROGEN_LOYALTY_API_TOKEN>`:

```text
GET /api/hydrogen/loyalty-balance?customerId=gid://shopify/Customer/123&shop=your-shop.myshopify.com
POST /api/hydrogen/redeem-points
```

The redeem body matches the existing checkout/theme contract:

```json
{
  "customerId": "gid://shopify/Customer/123",
  "shop": "your-shop.myshopify.com",
  "pointsToRedeem": 250,
  "rewardType": "discount"
}
```

## Step 3: Apply the reward to the Hydrogen cart

Use `examples/hydrogen/loyalty-client.js` as the starting point in the Hydrogen app. The flow is:

1. Load loyalty balance and reward options with `loadLoyaltyBalance`.
2. Let the customer select one available reward.
3. Submit the selected reward to a Hydrogen action.
4. Call `redeemAndApplyLoyaltyReward` from that action.
5. Redirect to the returned `checkoutUrl`.

Discount rewards use Storefront API `cartDiscountCodesUpdate`. Gift card rewards use `cartGiftCardCodesUpdate`.

## Step 4: Keep points deduction behavior aligned

Current reward behavior stays the same:

- Discount points are reserved as a pending reward and deducted after the paid order webhook confirms usage.
- Gift card points are deducted immediately when the gift card is issued.
- Store credit redemption remains an account/customer-account flow unless we decide to add it to Hydrogen later.

## Step 5: Build the Hydrogen UI

The Hydrogen UI should be a normal React component, not a checkout extension. It needs:

- Logged-in customer guard.
- Cart guard before redemption.
- Available points display.
- Reward list from `rewardOptions`.
- Per-reward loading state.
- Error state for insufficient points, unavailable reward, and failed cart mutation.
- Success redirect to Shopify checkout.
