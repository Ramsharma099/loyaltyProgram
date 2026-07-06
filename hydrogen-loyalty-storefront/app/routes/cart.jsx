import {useLoaderData, data} from 'react-router';
import {CartForm} from '@shopify/hydrogen';
import {CartMain} from '~/components/CartMain';
import {
  loadCustomerId,
  loadLoyaltyBalance,
  redeemLoyaltyReward,
} from '~/lib/loyalty';

const LOYALTY_CODE_PREFIX = 'LOYALTY-';
const PENDING_REDEMPTION_MESSAGE =
  'A loyalty reward is already applied to this order.';

/**
 * @type {Route.MetaFunction}
 */
export const meta = () => {
  return [{title: `Hydrogen | Cart`}];
};

/**
 * @type {HeadersFunction}
 */
export const headers = ({actionHeaders}) => actionHeaders;

/**
 * @param {Route.ActionArgs}
 */
export async function action({request, context}) {
  const {cart, customerAccount} = context;

  const formData = await request.formData();

  if (formData.get('loyaltyAction') === 'redeem') {
    return redeemLoyaltyCartReward({cart, context, customerAccount, formData});
  }

  const {action, inputs} = CartForm.getFormInput(formData);

  if (!action) {
    throw new Error('No action provided');
  }

  let status = 200;
  let result;

  switch (action) {
    case CartForm.ACTIONS.LinesAdd:
      result = await cart.addLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesUpdate:
      result = await cart.updateLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesRemove:
      result = await cart.removeLines(inputs.lineIds);
      break;
    case CartForm.ACTIONS.DiscountCodesUpdate: {
      const formDiscountCode = inputs.discountCode;

      // User inputted discount code
      const discountCodes = formDiscountCode ? [formDiscountCode] : [];

      // Combine discount codes already applied on cart
      discountCodes.push(...inputs.discountCodes);

      result = await cart.updateDiscountCodes(discountCodes);
      break;
    }
    case CartForm.ACTIONS.GiftCardCodesAdd: {
      const formGiftCardCode = inputs.giftCardCode;

      const giftCardCodes = formGiftCardCode ? [formGiftCardCode] : [];

      result = await cart.addGiftCardCodes(giftCardCodes);
      break;
    }
    case CartForm.ACTIONS.GiftCardCodesRemove: {
      const appliedGiftCardIds = inputs.giftCardCodes;
      result = await cart.removeGiftCardCodes(appliedGiftCardIds);
      break;
    }
    case CartForm.ACTIONS.BuyerIdentityUpdate: {
      result = await cart.updateBuyerIdentity({
        ...inputs.buyerIdentity,
      });
      break;
    }
    default:
      throw new Error(`${action} cart action is not defined`);
  }

  const cartId = result?.cart?.id;
  const headers = cartId ? cart.setCartId(result.cart.id) : new Headers();
  const {cart: cartResult, errors, warnings} = result;

  const redirectTo = formData.get('redirectTo') ?? null;
  if (typeof redirectTo === 'string') {
    status = 303;
    headers.set('Location', redirectTo);
  }

  return data(
    {
      cart: cartResult,
      errors,
      warnings,
      analytics: {
        cartId,
      },
    },
    {status, headers},
  );
}

/**
 * @param {Route.LoaderArgs}
 */
export async function loader({context}) {
  const {cart, customerAccount} = context;
  const [cartData, loyalty] = await Promise.all([
    cart.get(),
    loadCartLoyaltyData(context, customerAccount),
  ]);

  return {
    cart: cartData,
    loyalty: {
      ...loyalty,
      currencyCode:
        cartData?.cost?.totalAmount?.currencyCode || loyalty?.currencyCode,
    },
  };
}

export default function Cart() {
  /** @type {LoaderReturnData} */
  const {cart, loyalty} = useLoaderData();

  return (
    <div className="cart">
      <h1>Cart</h1>
      <CartMain layout="page" cart={cart} loyalty={loyalty} />
    </div>
  );
}

async function loadCartLoyaltyData(context, customerAccount) {
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
    console.error('[hydrogen-loyalty] Could not load rewards', error);

    return {
      enabled: true,
      isLoggedIn: true,
      loyaltyPoints: 0,
      rewardOptions: [],
      message: error?.message || 'Could not load loyalty rewards.',
    };
  }
}

async function redeemLoyaltyCartReward({
  cart,
  context,
  customerAccount,
  formData,
}) {
  try {
    const customerId = await loadCustomerId(customerAccount);

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
    const currentCart = await cart.get();
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
      result = await cart.addGiftCardCodes([reward.rewardCode]);
    } else {
      result = await cart.updateDiscountCodes([
        ...new Set([...discountCodes, reward.rewardCode]),
      ]);
    }

    const cartId = result?.cart?.id;
    const headers = cartId ? cart.setCartId(result.cart.id) : new Headers();
    const userError = result?.errors?.[0] || result?.warnings?.[0];

    if (userError) {
      return data(
        {
          cart: result?.cart,
          errors: result?.errors,
          warnings: result?.warnings,
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
        errors: result?.errors,
        warnings: result?.warnings,
        loyalty: {
          success: true,
          reward,
          checkoutUrl: result?.cart?.checkoutUrl,
          message: 'Your reward created and applied on checkout.',
        },
        analytics: {
          cartId,
        },
      },
      {headers},
    );
  } catch (error) {
    console.error('[hydrogen-loyalty] Could not redeem reward', error);

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

/** @typedef {import('react-router').HeadersFunction} HeadersFunction */
/** @typedef {import('./+types/cart').Route} Route */
/** @typedef {import('@shopify/hydrogen').CartQueryDataReturn} CartQueryDataReturn */
/** @typedef {ReturnType<typeof useLoaderData<typeof loader>>} LoaderReturnData */
/** @typedef {ReturnType<typeof useActionData<typeof action>>} ActionReturnData */
