import "@shopify/ui-extensions/preact";
import {
  useAuthenticatedAccountCustomer,
  useSettings,
} from "@shopify/ui-extensions/customer-account/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

const DEFAULT_STORE_CREDIT_REWARD = {
  type: "store_credit",
  points: 100,
  amount: 1,
  title: "Store Credit Reward",
  description: "Redeem 100 points to get $1 store credit",
};

function normalizeStoreCreditReward(reward) {
  const points = Number(reward?.points);
  const amount = Number(reward?.amount);

  if (
    reward?.type !== "store_credit" ||
    !Number.isInteger(points) ||
    points < 1 ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return {
    type: "store_credit",
    points,
    amount,
    title: reward?.title || DEFAULT_STORE_CREDIT_REWARD.title,
    description: reward?.description || DEFAULT_STORE_CREDIT_REWARD.description,
  };
}

export default function extension() {
  render(<CustomerAccountLoyaltyPoints />, document.body);
}

function CustomerAccountLoyaltyPoints() {
  const settings = useSettings();
  const customer = useAuthenticatedAccountCustomer();
  const apiBaseUrl =
    settings?.api_base_url ||
    "https://franklin-tasks-travis-postposted.trycloudflare.com";

  const [points, setPoints] = useState(0);
  const [customerId, setCustomerId] = useState(null);
  const [storeCreditReward, setStoreCreditReward] = useState(
    DEFAULT_STORE_CREDIT_REWARD,
  );
  const [isLoading, setIsLoading] = useState(Boolean(customer?.id));
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isRedemptionEnabled, setIsRedemptionEnabled] = useState(true);
  const [message, setMessage] = useState("");
  const pointsLabel = `${points.toLocaleString()} ${points === 1 ? "point" : "points"}`;
  const canRedeemStoreCredit =
    Boolean(customerId) && points >= storeCreditReward.points;

  useEffect(() => {
    if (!apiBaseUrl) {
      setIsLoading(false);
      setPoints(0);
      setCustomerId(null);
      setIsRedemptionEnabled(true);
      setMessage("Loyalty API URL is not configured.");
      return;
    }

    if (!customer?.id) {
      setIsLoading(false);
      setPoints(0);
      setCustomerId(null);
      setIsRedemptionEnabled(true);
      setMessage("Sign in to view loyalty points.");
      return;
    }

    let isCurrent = true;

    async function loadPoints() {
      setIsLoading(true);
      setMessage("");

      try {
        const params = new URLSearchParams({
          customerId: customer.id,
        });

        const response = await fetch(
          `${apiBaseUrl}/api/loyalty-balance?${params}`,
        );
        const data = await response.json();

        if (!isCurrent) return;

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Could not load points");
        }

        setCustomerId(data.customerId);
        setPoints(data.loyaltyPoints || 0);
        setIsRedemptionEnabled(data.checkoutRedemptionEnabled !== false);
        setStoreCreditReward(
          normalizeStoreCreditReward(
            data.rewardOptions?.find(
              (reward) => reward?.type === "store_credit",
            ),
          ) || DEFAULT_STORE_CREDIT_REWARD,
        );
      } catch (error) {
        console.error(error);

        if (isCurrent) {
          setPoints(0);
          setCustomerId(null);
          setMessage(error.message || "Could not load points");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadPoints();

    return () => {
      isCurrent = false;
    };
  }, [apiBaseUrl, customer?.id]);

  const redeemStoreCredit = async () => {
    if (!customerId) {
      setMessage("Loyalty customer is not available.");
      return;
    }

    if (!isRedemptionEnabled) {
      setMessage("Rewards redemption is currently disabled.");
      return;
    }

    if (!canRedeemStoreCredit) {
      setMessage(
        `Earn ${storeCreditReward.points - points} more points to redeem store credit.`,
      );
      return;
    }

    setIsRedeeming(true);
    setMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/redeem-points`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId,
          pointsToRedeem: storeCreditReward.points,
          rewardType: "store_credit",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not redeem store credit");
      }

      setPoints((prev) => prev - storeCreditReward.points);
      setMessage(
        `$${storeCreditReward.amount} store credit added to your account.`,
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Could not redeem store credit");
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <s-box border="base" padding="large" cornerRadius="large">
      <s-stack gap="base">
        <s-stack gap="none">
          <s-heading>Loyalty balance</s-heading>
          <s-text appearance="subdued">Available points</s-text>
        </s-stack>

        <s-box border="base" padding="large" cornerRadius="base">
          <s-stack gap="small">
            <s-text appearance="subdued">Current balance</s-text>
            <s-heading>{isLoading ? "Loading..." : pointsLabel}</s-heading>
          </s-stack>
        </s-box>

        <s-box border="base" padding="large" cornerRadius="base">
          <s-stack gap="base">
            <s-stack gap="none">
              <s-text emphasis="bold">{storeCreditReward.title}</s-text>
              <s-text appearance="subdued">
                {storeCreditReward.points.toLocaleString()} points = $
                {storeCreditReward.amount.toLocaleString()} store credit
              </s-text>
            </s-stack>

            <s-button
              kind="primary"
              disabled={
                isLoading ||
                isRedeeming ||
                !isRedemptionEnabled ||
                !canRedeemStoreCredit
              }
              onClick={redeemStoreCredit}
            >
              {isRedeeming ? "Redeeming..." : "Redeem store credit"}
            </s-button>
            {!isRedemptionEnabled ? (
              <s-text appearance="subdued">
                Rewards redemption is currently disabled.
              </s-text>
            ) : null}
          </s-stack>
        </s-box>

        {message ? (
          <s-banner>
            <s-text>{message}</s-text>
          </s-banner>
        ) : null}
      </s-stack>
    </s-box>
  );
}
