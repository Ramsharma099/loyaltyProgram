import {data} from 'react-router';
import {
  loadCustomerId,
  loadLoyaltyBalance,
  redeemLoyaltyReward,
} from '~/lib/loyalty';

const PENDING_REDEMPTION_MESSAGE =
  'Discount code created. It will be applied when you open checkout.';

/**
 * @param {Route.LoaderArgs}
 */
export async function loader({context}) {
  try {
    const customerId = await loadCustomerId(context.customerAccount);

    if (!customerId) {
      return data({
        success: true,
        enabled: true,
        isLoggedIn: false,
        loyaltyPoints: 0,
        rewardOptions: [],
      });
    }

    const loyalty = await loadLoyaltyBalance(context, customerId, {
      surface: 'checkout',
    });

    return data({
      ...loyalty,
      success: true,
      enabled: loyalty.checkoutRedemptionEnabled !== false,
      isLoggedIn: true,
    });
  } catch (error) {
    console.error('[hydrogen-loyalty-widget] Could not load rewards', error);

    return data(
      {
        success: false,
        enabled: true,
        isLoggedIn: true,
        loyaltyPoints: 0,
        rewardOptions: [],
        message: error?.message || 'Could not load loyalty rewards.',
      },
      {status: 200},
    );
  }
}

/**
 * @param {Route.ActionArgs}
 */
export async function action({request, context}) {
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

    const formData = await request.formData();
    const points = Number(formData.get('points'));
    const rewardType = String(formData.get('rewardType') || 'discount');

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
      allowPendingRewardCheckout: rewardType === 'discount',
    });

    return data({
      loyalty: {
        success: true,
        reward: redemption.reward,
        message:
          rewardType === 'discount'
            ? PENDING_REDEMPTION_MESSAGE
            : 'Reward created. Open checkout to use it.',
      },
    });
  } catch (error) {
    console.error('[hydrogen-loyalty-widget] Could not redeem reward', error);

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

/** @typedef {import('./+types/api.loyalty-widget').Route} Route */
