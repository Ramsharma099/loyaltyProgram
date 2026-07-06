import {Await, useFetcher} from 'react-router';
import {Suspense, useEffect, useMemo, useState} from 'react';

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

function formatRewardValue(reward, currencyCode) {
  if (reward.type === 'gift_card') {
    return `${formatCurrency(reward.amount, currencyCode)} gift card`;
  }

  return `${formatCurrency(reward.discount, currencyCode)} off`;
}

function getRewardKey(reward) {
  return `${reward.type || 'discount'}:${reward.points}`;
}

const PENDING_REDEMPTION_MESSAGE =
  'A loyalty reward is already applied to this order.';

/**
 * @param {{isLoggedIn: Promise<boolean>}}
 */
export function FloatingLoyaltyButton({isLoggedIn}) {
  return (
    <Suspense fallback={<FloatingLoyaltyPanel isLoggedIn={false} />}>
      <Await resolve={isLoggedIn} errorElement={<FloatingLoyaltyPanel isLoggedIn={false} />}>
        {(resolvedIsLoggedIn) => (
          <FloatingLoyaltyPanel isLoggedIn={Boolean(resolvedIsLoggedIn)} />
        )}
      </Await>
    </Suspense>
  );
}

/**
 * @param {{isLoggedIn: boolean}}
 */
function FloatingLoyaltyPanel({isLoggedIn}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState('overview');
  const [hasRequestedData, setHasRequestedData] = useState(false);
  const balanceFetcher = useFetcher();
  const redeemFetcher = useFetcher();
  const isLoadingBalance = balanceFetcher.state !== 'idle';
  const isRedeeming = redeemFetcher.state !== 'idle';
  const submittedRewardKey =
    redeemFetcher.formData &&
    `${redeemFetcher.formData.get('rewardType')}:${redeemFetcher.formData.get(
      'points',
    )}`;
  const loyalty = balanceFetcher.data;
  const points = Number(loyalty?.loyaltyPoints || 0);
  const currencyCode = loyalty?.currencyCode || 'USD';
  const hasPendingRedemption = Boolean(
    loyalty?.hasPendingCheckoutRedemption ||
      redeemFetcher.data?.loyalty?.reward?.rewardType === 'discount',
  );
  const rewards = useMemo(() => {
    if (!Array.isArray(loyalty?.rewardOptions)) return [];

    return loyalty.rewardOptions.filter((reward) =>
      ['discount', 'gift_card'].includes(reward.type || 'discount'),
    );
  }, [loyalty]);
  const availableRewards = rewards.filter(
    (reward) => Number(reward.points || 0) <= points,
  );
  const nextReward = rewards
    .filter((reward) => Number(reward.points || 0) > points)
    .sort((left, right) => Number(left.points || 0) - Number(right.points || 0))[0];
  const balanceMessage =
    loyalty?.message ||
    (hasPendingRedemption ? PENDING_REDEMPTION_MESSAGE : null) ||
    (isLoadingBalance ? 'Loading your points...' : 'Ready when you are.');
  const redeemMessage = redeemFetcher.data?.loyalty?.message;

  useEffect(() => {
    if (isOpen && isLoggedIn && !hasRequestedData) {
      setHasRequestedData(true);
      balanceFetcher.load('/api/loyalty-widget');
    }
  }, [balanceFetcher, hasRequestedData, isLoggedIn, isOpen]);

  useEffect(() => {
    if (!isOpen) setActiveView('overview');
  }, [isOpen]);

  useEffect(() => {
    if (redeemFetcher.state === 'idle' && redeemFetcher.data?.loyalty?.success) {
      balanceFetcher.load('/api/loyalty-widget');
    }
  }, [balanceFetcher, redeemFetcher.data, redeemFetcher.state]);

  return (
    <div className="floating-loyalty" data-floating-loyalty>
      {isOpen ? (
        <section
          className="floating-loyalty__panel"
          aria-label="Rewards"
          id="floating-loyalty-panel"
        >
          {activeView === 'overview' ? (
            <Overview
              availableRewards={availableRewards}
              balanceMessage={balanceMessage}
              currencyCode={currencyCode}
              isLoggedIn={isLoggedIn}
              isLoadingBalance={isLoadingBalance}
              loyalty={loyalty}
              nextReward={nextReward}
              points={points}
              setActiveView={setActiveView}
              setIsOpen={setIsOpen}
            />
          ) : (
            <DetailView
              activeView={activeView}
              currencyCode={currencyCode}
              isRedeeming={isRedeeming}
              points={points}
              redeemFetcher={redeemFetcher}
              redeemMessage={redeemMessage}
              rewards={rewards}
              hasPendingRedemption={hasPendingRedemption}
              setActiveView={setActiveView}
              setIsOpen={setIsOpen}
              submittedRewardKey={submittedRewardKey}
            />
          )}
        </section>
      ) : null}

      <button
        className="floating-loyalty__launcher"
        type="button"
        aria-controls="floating-loyalty-panel"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        Rewards
      </button>
    </div>
  );
}

function Overview({
  availableRewards,
  balanceMessage,
  currencyCode,
  isLoggedIn,
  isLoadingBalance,
  loyalty,
  nextReward,
  points,
  setActiveView,
  setIsOpen,
}) {
  return (
    <>
      <div className="floating-loyalty__top">
        <span>Rewards</span>
        <button
          type="button"
          aria-label="Close rewards"
          onClick={() => setIsOpen(false)}
        >
          X
        </button>
      </div>
      <div className="floating-loyalty__header">
        <p>Loyalty points</p>
        <h2>Your rewards</h2>
      </div>

      {isLoggedIn ? (
        <>
          <p className="floating-loyalty__message">{balanceMessage}</p>
          <div className="floating-loyalty__balance">
            <div>
              <span>Available points</span>
              <strong>{isLoadingBalance ? '--' : points.toLocaleString()}</strong>
            </div>
            <small>
              {availableRewards.length > 0
                ? `${availableRewards.length} ready`
                : 'Keep earning'}
            </small>
          </div>
          {nextReward ? (
            <div className="floating-loyalty__next">
              <span>Next reward</span>
              <strong>{formatRewardTitle(nextReward, currencyCode)}</strong>
              <small>
                {Number(nextReward.points || 0) - points} more points needed
              </small>
            </div>
          ) : null}
          {loyalty?.enabled === false ? (
            <p className="floating-loyalty__message">
              Reward redemption is currently paused.
            </p>
          ) : (
            <div className="floating-loyalty__actions">
              <button
                type="button"
                onClick={() => setActiveView('available')}
              >
                <span>Your available rewards</span>
                <small>
                  {availableRewards.length === 1
                    ? '1 reward available'
                    : `${availableRewards.length} rewards available`}
                </small>
              </button>
              <button type="button" onClick={() => setActiveView('earn')}>
                <span>Ways to earn</span>
              </button>
              <button type="button" onClick={() => setActiveView('redeem')}>
                <span>Ways to redeem</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="floating-loyalty__message">
            Sign in to view and use your loyalty points.
          </p>
          <div className="floating-loyalty__guest-actions">
            <a href="/account/login">Sign in</a>
            <a href="/account/login">Join rewards</a>
          </div>
        </>
      )}
    </>
  );
}

function DetailView({
  activeView,
  currencyCode,
  isRedeeming,
  points,
  redeemFetcher,
  redeemMessage,
  hasPendingRedemption,
  rewards,
  setActiveView,
  setIsOpen,
  submittedRewardKey,
}) {
  const title =
    activeView === 'earn'
      ? 'Ways to earn'
      : activeView === 'redeem'
        ? 'Ways to redeem'
        : 'Your available rewards';
  const visibleRewards =
    activeView === 'available'
      ? rewards.filter((reward) => Number(reward.points || 0) <= points)
      : rewards;
  const rewardCountLabel =
    visibleRewards.length === 1
      ? '1 reward'
      : `${visibleRewards.length} rewards`;

  return (
    <div className={`floating-loyalty__view floating-loyalty__view--${activeView}`}>
      <div className="floating-loyalty__view-header">
        <button
          type="button"
          aria-label="Back to rewards overview"
          onClick={() => setActiveView('overview')}
        >
          &lt;
        </button>
        <div>
          <strong>{points.toLocaleString()} points</strong>
          <small>{title}</small>
        </div>
        <button
          type="button"
          aria-label="Close rewards"
          onClick={() => setIsOpen(false)}
        >
          X
        </button>
      </div>
      <div className="floating-loyalty__view-content">
        <div className="floating-loyalty__section-title">
          <h3>{title}</h3>
          {activeView === 'earn' ? null : <span>{rewardCountLabel}</span>}
        </div>
        {activeView === 'earn' ? (
          <div className="floating-loyalty__method-list">
            <div>
              <strong>Join our rewards program</strong>
              <p>Start earning points as soon as you join.</p>
            </div>
            <div>
              <strong>Place an order</strong>
              <p>Earn points every time you shop with us.</p>
            </div>
            <div>
              <strong>Keep shopping</strong>
              <p>Save your points and unlock more valuable rewards.</p>
            </div>
          </div>
        ) : (
          <RewardList
            currencyCode={currencyCode}
            isRedeeming={isRedeeming}
            points={points}
            redeemFetcher={redeemFetcher}
            redeemMessage={
              redeemMessage ||
              (hasPendingRedemption ? PENDING_REDEMPTION_MESSAGE : null)
            }
            rewards={visibleRewards}
            hasPendingRedemption={hasPendingRedemption}
            submittedRewardKey={submittedRewardKey}
          />
        )}
      </div>
    </div>
  );
}

function RewardList({
  currencyCode,
  isRedeeming,
  points,
  redeemFetcher,
  redeemMessage,
  hasPendingRedemption,
  rewards,
  submittedRewardKey,
}) {
  if (rewards.length === 0) {
    return <p className="floating-loyalty__message">No rewards available yet.</p>;
  }

  return (
    <>
      {redeemMessage ? (
        <p className="floating-loyalty__message">{redeemMessage}</p>
      ) : null}
      <ul className="floating-loyalty__reward-list">
        {rewards.map((reward) => {
          const rewardKey = getRewardKey(reward);
          const rewardPoints = Number(reward.points || 0);
          const canRedeem = points >= rewardPoints;
          const isCurrentReward =
            isRedeeming && submittedRewardKey === rewardKey;
          const pointsRemaining = Math.max(rewardPoints - points, 0);

          return (
            <li key={rewardKey}>
              <redeemFetcher.Form method="post" action="/api/loyalty-widget">
                <input
                  type="hidden"
                  name="rewardType"
                  value={reward.type || 'discount'}
                />
                <input type="hidden" name="points" value={reward.points} />
                <button
                  type="submit"
                  disabled={hasPendingRedemption || !canRedeem || isRedeeming}
                  aria-label={`Redeem ${formatRewardTitle(reward, currencyCode)}`}
                >
                  <span className="floating-loyalty__reward-main">
                    <span>
                      <strong>{formatRewardTitle(reward, currencyCode)}</strong>
                      <span>{formatRewardDescription(reward, currencyCode)}</span>
                    </span>
                    <em>{formatRewardValue(reward, currencyCode)}</em>
                  </span>
                  <span className="floating-loyalty__reward-meta">
                    <small>{rewardPoints.toLocaleString()} points</small>
                    <small>
                      {canRedeem
                        ? hasPendingRedemption
                          ? 'Applied'
                          : isCurrentReward
                          ? 'Redeeming...'
                          : 'Redeem'
                        : `${pointsRemaining.toLocaleString()} more needed`}
                    </small>
                  </span>
                </button>
              </redeemFetcher.Form>
            </li>
          );
        })}
      </ul>
    </>
  );
}
