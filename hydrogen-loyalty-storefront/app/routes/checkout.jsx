import {Money} from '@shopify/hydrogen';
import {data, Link, redirect, useFetcher, useLoaderData} from 'react-router';
import {
  loadCustomerId,
  loadLoyaltyBalance,
  redeemLoyaltyReward,
} from '~/lib/loyalty';
import {LoyaltyRewards} from '~/components/LoyaltyRewards';

const LOYALTY_CODE_PREFIX = 'LOYALTY-';
const PENDING_REDEMPTION_MESSAGE =
  'A loyalty reward is already applied to this order.';

export const meta = () => {
  return [{title: 'Checkout | Hydrogen'}];
};

/**
 * @param {Route.LoaderArgs}
 */
export async function loader({context}) {
  const {cart, customerAccount} = context;
  let cartData = await cart.get();
  const loyalty = await loadCheckoutLoyaltyData(context, customerAccount);
  let headers;

  if (!cartData?.totalQuantity) {
    throw redirect('/cart');
  }

  if (loyalty?.pendingCheckoutRedemption?.rewardCode) {
    const rewardCode = loyalty.pendingCheckoutRedemption.rewardCode;
    const discountCodes =
      cartData?.discountCodes
        ?.filter((discount) => discount.applicable)
        ?.map((discount) => discount.code) || [];
    const hasLoyaltyDiscount = discountCodes.some((code) =>
      code?.startsWith(LOYALTY_CODE_PREFIX),
    );

    if (!hasLoyaltyDiscount) {
      const result = await cart.updateDiscountCodes([
        ...new Set([...discountCodes, rewardCode]),
      ]);

      cartData = result?.cart || cartData;
      headers = cartData?.id ? cart.setCartId(cartData.id) : undefined;
    }
  }

  return data({
    cart: cartData,
    loyalty: {
      ...loyalty,
      currencyCode:
        cartData?.cost?.totalAmount?.currencyCode || loyalty?.currencyCode,
    },
  }, headers ? {headers} : undefined);
}

/**
 * @param {Route.ActionArgs}
 */
export async function action({request, context}) {
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'redeem-loyalty') {
    return redeemCheckoutLoyaltyReward({context, formData});
  }

  if (intent === 'continue-to-shopify-checkout') {
    const checkoutUrl = formData.get('checkoutUrl');

    if (typeof checkoutUrl === 'string' && checkoutUrl) {
      return redirect(checkoutUrl);
    }
  }

  return data(
    {
      message: 'Checkout action is not available.',
    },
    {status: 400},
  );
}

export default function CustomCheckout() {
  /** @type {LoaderReturnData} */
  const {cart, loyalty} = useLoaderData();
  const checkoutFetcher = useFetcher();
  const lines = cart?.lines?.nodes || [];
  const discounts =
    cart?.discountCodes?.filter((discount) => discount.applicable) || [];
  const appliedGiftCards = cart?.appliedGiftCards || [];
  const isContinuing = checkoutFetcher.state !== 'idle';

  return (
    <main className="custom-checkout">
      <section className="custom-checkout__main" aria-labelledby="checkout-title">
        <Link to="/cart" className="custom-checkout__back">
          &larr; Back to cart
        </Link>
        <h1 id="checkout-title">Checkout</h1>

        <section className="custom-checkout__section" aria-label="Customer">
          <h2>Customer</h2>
          {loyalty?.isLoggedIn ? (
            <p>Signed in and ready to redeem rewards.</p>
          ) : (
            <p>
              <a href="/account/login">Sign in</a> to use loyalty points before
              payment.
            </p>
          )}
        </section>

        <section className="custom-checkout__section" aria-label="Rewards">
          <LoyaltyRewards
            action="/checkout"
            cart={cart}
            intent="redeem-loyalty"
            intentName="intent"
            loyalty={loyalty}
          />
        </section>

        <section className="custom-checkout__section" aria-label="Secure payment">
          <h2>Payment</h2>
          <p>
            Payment, shipping rates, taxes, and order completion continue in
            Shopify&apos;s secure checkout.
          </p>
          <checkoutFetcher.Form method="post">
            <input
              type="hidden"
              name="intent"
              value="continue-to-shopify-checkout"
            />
            <input type="hidden" name="checkoutUrl" value={cart.checkoutUrl} />
            <button
              className="custom-checkout__primary"
              type="submit"
              disabled={isContinuing || !cart.checkoutUrl}
            >
              {isContinuing ? 'Opening checkout' : 'Continue to secure payment'}
            </button>
          </checkoutFetcher.Form>
        </section>
      </section>

      <aside className="custom-checkout__summary" aria-label="Order summary">
        <h2>Order summary</h2>
        <ul className="custom-checkout__items">
          {lines.map((line) => (
            <li key={line.id} className="custom-checkout__item">
              <div>
                <strong>{line.merchandise.product.title}</strong>
                <span>
                  {line.merchandise.title} &times; {line.quantity}
                </span>
              </div>
              <Money data={line.cost.totalAmount} />
            </li>
          ))}
        </ul>

        <dl className="custom-checkout__totals">
          <div>
            <dt>Subtotal</dt>
            <dd>
              {cart.cost?.subtotalAmount ? (
                <Money data={cart.cost.subtotalAmount} />
              ) : (
                '-'
              )}
            </dd>
          </div>

          {discounts.length > 0 ? (
            <div>
              <dt>Discounts</dt>
              <dd>{discounts.map((discount) => discount.code).join(', ')}</dd>
            </div>
          ) : null}

          {appliedGiftCards.length > 0 ? (
            <div>
              <dt>Gift cards</dt>
              <dd>
                {appliedGiftCards
                  .map((card) => `***${card.lastCharacters}`)
                  .join(', ')}
              </dd>
            </div>
          ) : null}

          <div className="custom-checkout__total">
            <dt>Total</dt>
            <dd>
              {cart.cost?.totalAmount ? <Money data={cart.cost.totalAmount} /> : '-'}
            </dd>
          </div>
        </dl>
      </aside>
    </main>
  );
}

async function loadCheckoutLoyaltyData(context, customerAccount) {
  try {
    const customerId = await loadCustomerId(customerAccount);

    if (!customerId) {
      return {
        enabled: true,
        isLoggedIn: false,
      };
    }

    const loyalty = await loadLoyaltyBalance(context, customerId, {
      surface: 'checkout',
    });

    return {
      ...loyalty,
      enabled: loyalty.checkoutRedemptionEnabled !== false,
      isLoggedIn: true,
    };
  } catch (error) {
    console.error('[hydrogen-checkout] Could not load loyalty data', error);

    return {
      enabled: true,
      isLoggedIn: true,
      loyaltyPoints: 0,
      rewardOptions: [],
      message: error?.message || 'Could not load loyalty rewards.',
    };
  }
}

async function redeemCheckoutLoyaltyReward({context, formData}) {
  try {
    const customerId = await loadCustomerId(context.customerAccount);

    if (!customerId) {
      return data(
        {
          loyalty: {
            success: false,
            message: 'Sign in to redeem loyalty points.',
          },
        },
        {status: 401},
      );
    }

    const points = Number(formData.get('points'));
    const rewardType = String(formData.get('rewardType') || 'discount');
    const currentCart = await context.cart.get();
    const discountCodes =
      currentCart?.discountCodes
        ?.filter((discount) => discount.applicable)
        ?.map((discount) => discount.code) || [];

    if (discountCodes.some((code) => code?.startsWith(LOYALTY_CODE_PREFIX))) {
      return data(
        {
          cart: currentCart,
          loyalty: {
            success: false,
            message: PENDING_REDEMPTION_MESSAGE,
          },
        },
        {status: 409},
      );
    }

    if (!Number.isInteger(points) || points <= 0) {
      return data(
        {
          loyalty: {
            success: false,
            message: 'Select a valid loyalty reward.',
          },
        },
        {status: 400},
      );
    }

    const redemption = await redeemLoyaltyReward(context, customerId, {
      points,
      type: rewardType,
      appliedDiscountCodes: discountCodes,
    });
    const reward = redemption.reward;
    let result;

    if (reward.rewardType === 'gift_card') {
      result = await context.cart.addGiftCardCodes([reward.rewardCode]);
    } else {
      result = await context.cart.updateDiscountCodes([
        ...new Set([...discountCodes, reward.rewardCode]),
      ]);
    }

    const cartId = result?.cart?.id;
    const headers = cartId ? context.cart.setCartId(result.cart.id) : new Headers();
    const userError = result?.errors?.[0] || result?.warnings?.[0];

    if (userError) {
      return data(
        {
          cart: result?.cart,
          loyalty: {
            success: false,
            message: userError.message || 'Could not apply loyalty reward.',
          },
        },
        {status: 400, headers},
      );
    }

    return data(
      {
        cart: result?.cart,
        loyalty: {
          success: true,
          reward,
          message: 'Reward applied to this checkout.',
        },
      },
      {headers},
    );
  } catch (error) {
    console.error('[hydrogen-checkout] Could not redeem reward', error);

    return data(
      {
        loyalty: {
          success: false,
          message: error?.message || 'Could not redeem loyalty reward.',
        },
      },
      {status: 500},
    );
  }
}

/** @typedef {import('./+types/checkout').Route} Route */
/** @typedef {ReturnType<typeof useLoaderData<typeof loader>>} LoaderReturnData */
