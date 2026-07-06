import {useFetcher} from 'react-router';

function formatCurrency(value, currencyCode = 'USD') {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString('en')}`;
  }
}

function formatRewardTitle(reward, currencyCode) {
  if (reward.type === 'gift_card') {
    return `${formatCurrency(reward.amount, currencyCode)} gift card`;
  }

  return `Discount ${formatCurrency(reward.discount, currencyCode)}`;
}

function formatRewardDescription(reward, currencyCode) {
  if (reward.description && reward.type === 'discount') return reward.description;

  if (reward.type === 'gift_card') {
    return `Redeem ${Number(reward.points || 0).toLocaleString()} points for a ${formatCurrency(reward.amount, currencyCode)} gift card.`;
  }

  return `Redeem ${Number(reward.points || 0).toLocaleString()} points.`;
}

function formatRewardType(reward) {
  return reward.type === 'gift_card' ? 'Gift card' : 'Discount';
}

function formatRewardValue(reward, currencyCode) {
  if (reward.type === 'gift_card') {
    return `${formatCurrency(reward.amount, currencyCode)} gift`;
  }

  return `${formatCurrency(reward.discount, currencyCode)} off`;
}

function getRewardKey(reward) {
  return `${reward.type || 'discount'}:${reward.points}`;
}

const PENDING_REDEMPTION_MESSAGE =
  'A loyalty reward is already applied to this order.';

/**
 * @param {{
 *   cart: CartApiQueryFragment | null;
 *   loyalty: LoyaltyCartData | null;
 *   action?: string;
 *   intent?: string;
 *   intentName?: string;
 * }}
 */
export function LoyaltyRewards({
  cart,
  loyalty,
  action = '/cart',
  intent = 'redeem',
  intentName = 'loyaltyAction',
}) {
  const fetcher = useFetcher();
  const cartHasItems = cart?.totalQuantity ? cart.totalQuantity > 0 : false;
  const isSubmitting = fetcher.state !== 'idle';
  const submittedRewardKey =
    fetcher.formData &&
    `${fetcher.formData.get('rewardType')}:${fetcher.formData.get('points')}`;
  const rewardOptions = loyalty?.rewardOptions || [];
  const hasPendingRedemption = Boolean(loyalty?.hasPendingCheckoutRedemption);
  const points = Number(loyalty?.loyaltyPoints || 0);
  const currencyCode = loyalty?.currencyCode || 'USD';
  const errorMessage =
    fetcher.data?.loyalty?.message ||
    (hasPendingRedemption ? PENDING_REDEMPTION_MESSAGE : loyalty?.message);
  const successMessage = fetcher.data?.loyalty?.success
    ? fetcher.data.loyalty.message
    : null;
  const sortedRewardOptions = [...rewardOptions].sort((left, right) => {
    const leftCanRedeem = points >= Number(left.points || 0);
    const rightCanRedeem = points >= Number(right.points || 0);

    if (leftCanRedeem !== rightCanRedeem) {
      return leftCanRedeem ? -1 : 1;
    }

    return Number(left.points || 0) - Number(right.points || 0);
  });

  if (!cartHasItems) return null;

  if (!loyalty?.isLoggedIn) {
    return (
      <section className="loyalty-cart-panel" aria-label="Loyalty rewards">
        <h4>Loyalty rewards</h4>
        <p>Sign in to redeem points at checkout.</p>
        <a href="/account/login">Sign in</a>
      </section>
    );
  }

  if (!loyalty?.enabled) {
    return null;
  }

  return (
    <section className="loyalty-cart-panel" aria-label="Loyalty rewards">
      <div className="loyalty-cart-panel__header">
        <h4>Loyalty rewards</h4>
        <p>{points.toLocaleString()} points available</p>
      </div>

      {errorMessage || successMessage ? (
        <p className="loyalty-cart-panel__message">
          {successMessage || errorMessage}
        </p>
      ) : null}

      {sortedRewardOptions.length > 0 ? (
        <ul className="loyalty-cart-panel__list">
          {sortedRewardOptions.map((reward) => {
            const rewardKey = getRewardKey(reward);
            const rewardPoints = Number(reward.points || 0);
            const canRedeem = points >= rewardPoints;
            const isRedeeming =
              isSubmitting && submittedRewardKey === rewardKey;
            const pointsRemaining = Math.max(rewardPoints - points, 0);
            const rewardType = reward.type === 'gift_card' ? 'gift-card' : 'discount';

            return (
              <li
                key={rewardKey}
                className={[
                  'loyalty-cart-panel__reward',
                  `loyalty-cart-panel__reward--${rewardType}`,
                  canRedeem
                    ? 'loyalty-cart-panel__reward--available'
                    : 'loyalty-cart-panel__reward--locked',
                ].join(' ')}
              >
                <div className="loyalty-cart-panel__reward-copy">
                  <div className="loyalty-cart-panel__reward-top">
                    <strong>{formatRewardTitle(reward, currencyCode)}</strong>
                    <span className="loyalty-cart-panel__badge">
                      {formatRewardType(reward)}
                    </span>
                    <span className="loyalty-cart-panel__value">
                      {formatRewardValue(reward, currencyCode)}
                    </span>
                  </div>
                  <span>{formatRewardDescription(reward, currencyCode)}</span>
                  <small>
                    {canRedeem
                      ? `${rewardPoints.toLocaleString()} points required`
                      : `Need ${pointsRemaining.toLocaleString()} more points`}
                  </small>
                </div>
                <fetcher.Form method="post" action={action}>
                  <input type="hidden" name={intentName} value={intent} />
                  <input
                    type="hidden"
                    name="rewardType"
                    value={reward.type || 'discount'}
                  />
                  <input type="hidden" name="points" value={reward.points} />
                  <button
                    type="submit"
                    disabled={hasPendingRedemption || !canRedeem || isSubmitting}
                    aria-label={`Redeem ${formatRewardTitle(reward, currencyCode)}`}
                  >
                    {hasPendingRedemption
                      ? 'Applied'
                      : canRedeem
                        ? isRedeeming
                          ? 'Redeeming'
                          : 'Redeem'
                      : 'Locked'}
                  </button>
                </fetcher.Form>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>No rewards are available right now.</p>
      )}
    </section>
  );
}

/**
 * @typedef {{
 *   enabled: boolean;
 *   isLoggedIn: boolean;
 *   loyaltyPoints?: number;
 *   rewardOptions?: Array<{
 *     type?: string;
 *     points: number;
 *     discount?: number;
 *     amount?: number;
 *     title?: string;
 *     description?: string;
 *   }>;
 *   message?: string;
 * }} LoyaltyCartData
 */

/** @typedef {import('storefrontapi.generated').CartApiQueryFragment} CartApiQueryFragment */
