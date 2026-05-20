import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useEffect, useState} from "preact/hooks";

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [settings, setSettings] = useState(
    shopify.settings.current,
  );

  const apiBaseUrl ="https://printable-negotiation-cooked-arrange.trycloudflare.com"
  

  const [checkoutCustomer, setCheckoutCustomer] =
    useState(
      shopify.buyerIdentity.customer.current,
    );

  const [customerId, setCustomerId] =
    useState(null);

  const [points, setPoints] = useState(0);

  const [selectedReward, setSelectedReward] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(Boolean(checkoutCustomer));

  const [isRedeeming, setIsRedeeming] =
    useState(false);

  const [message, setMessage] =
    useState("");

  // Reward Options
  const rewardOptions = [
    {
      label: "Discount $2 for 100 points",
      points: 100,
      discount: 2,
    },
    {
      label: "Discount $5 for 250 points",
      points: 250,
      discount: 5,
    },
    {
      label: "Discount $10 for 500 points",
      points: 500,
      discount: 10,
    },
  ];

  useEffect(() => {
    return shopify.buyerIdentity.customer.subscribe(
      setCheckoutCustomer,
    );
  }, []);

  useEffect(() => {
    return shopify.settings.subscribe(
      setSettings,
    );
  }, []);

  useEffect(() => {
    if (!apiBaseUrl) {
      setIsLoading(false);
      setCustomerId(null);
      setPoints(0);
      setMessage(
        "Loyalty API URL is not configured.",
      );
      return;
    }

    if (!checkoutCustomer?.id) {
      setIsLoading(false);
      setCustomerId(null);
      setPoints(0);
      setMessage(
        "Sign in to use loyalty points.",
      );
      return;
    }

    let isCurrent = true;

    async function loadPoints() {
      setIsLoading(true);
      setMessage("");

      try {
        const params =
          new URLSearchParams({
            customerId:
              checkoutCustomer.id,
          });

        const response = await fetch(
          `${apiBaseUrl}/api/loyalty-balance?${params}`,
        );

        const data =
          await response.json();

        if (!isCurrent) return;

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
              "Could not load points",
          );
        }

        setCustomerId(data.customerId);
        setPoints(data.loyaltyPoints);
      } catch (error) {
        console.error('error on api call',error);

        if (isCurrent) {
          setPoints(0);
          setMessage(
            error,
          );
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
  }, [apiBaseUrl, checkoutCustomer?.id]);

  const applyPoints = async () => {
    if (!selectedReward) {
      setMessage(
        "Please select a reward.",
      );
      return;
    }

    const reward = rewardOptions.find(
      (item) =>
        item.points.toString() ===
        selectedReward,
    );

    if (!reward) return;

    if (points < reward.points) {
      setMessage(
        "Not enough points for this reward.",
      );
      return;
    }

    setIsRedeeming(true);
    setMessage("");

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/redeem-points`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            customerId,
            pointsToRedeem:
              reward.points,
            discountAmount:
              reward.discount,
          }),
        },
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
            "Could not redeem points",
        );
      }

      setPoints(
        (prev) =>
          prev - reward.points,
      );

      setMessage(
        `Discount code created: ${data.reward.rewardCode}`,
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message);
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <s-box
      border="base"
      padding="large"
      cornerRadius="large"
    >
      <s-stack gap="large">
        <s-heading>
          Loyalty Rewards
        </s-heading>

        <s-text>
          Redeem your points for discounts
        </s-text>

        <s-stack gap="small">
          <s-text appearance="subdued">
            Your balance
          </s-text>

          <s-text emphasis="bold">
            {isLoading
              ? "Loading..."
              : `${points} points`}
          </s-text>
        </s-stack>

        {/* Dropdown */}
        <s-select
  label="Choose a discount"
  value={selectedReward}
  onChange={(event) =>
    setSelectedReward(event.target.value)
  }
>
  <s-option value="placeholder">
    Select reward
  </s-option>

  {rewardOptions.map((reward) => (
    <s-option
      key={reward.points}
      value={reward.points.toString()}
      disabled={
        points < reward.points
      }
    >
      {reward.label}
    </s-option>
  ))}
</s-select>

        {/* Apply Button */}
        <s-button
  kind="primary"
  loading={isRedeeming || undefined}
  disabled={
    isLoading ||
    isRedeeming ||
    selectedReward === "placeholder"
  }
  onClick={() => applyPoints()}
>
  Apply
</s-button>

        {/* Available rewards */}
        <s-text appearance="subdued">
          {
            rewardOptions.filter(
              (reward) =>
                points >= reward.points,
            ).length
          }{" "}
          available discounts
        </s-text>

        {/* Message */}
        {message ? (
          <s-banner>
            <s-text>{message}</s-text>
          </s-banner>
        ) : null}
      </s-stack>
    </s-box>
  );
}