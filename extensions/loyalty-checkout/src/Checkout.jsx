import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

const DEFAULT_REWARD_OPTIONS = [
  {
    type: "discount",
    points: 100,
    discount: 2,
  },
  {
    type: "discount",
    points: 250,
    discount: 5,
  },
  {
    type: "discount",
    points: 500,
    discount: 10,
  },
  {
    type: "gift_card",
    points: 1500,
    amount: 15,
    title: "$15 Gift Card",
    description: "Redeem 1,500 points to get for free",
  },
  {
    type: "store_credit",
    points: 100,
    amount: 1,
    title: "Store Credit Reward",
    description: "Redeem 100 points to get $1 store credits",
  },
];

const DEFAULT_LOGIN_MESSAGE = "Sign in to use loyalty points.";
const DEFAULT_DESCRIPTION = "You have {coupon_amount} available discounts";
const DEFAULT_DISCOUNT_PROMPT = "Choose a discount";

function getSettingValue(settings, key, fallback) {
  const value = settings?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatSettingText(value, replacements) {
  return Object.entries(replacements).reduce((text, [key, replacement]) => {
    return text
      .replaceAll(`{${key}}`, String(replacement))
      .replaceAll(`{{${key}}}`, String(replacement));
  }, value);
}

function formatRewardLabel(reward) {
  if (reward.type === "gift_card") {
    return reward.title || `$${reward.amount} Gift Card`;
  }

  if (reward.type === "store_credit") {
    return reward.title || "Store Credit Reward";
  }

  return `Discount $${reward.discount} for ${reward.points} points`;
}

function formatRewardDescription(reward) {
  if (reward.description) {
    return reward.description;
  }

  return `Discount Reward - Redeem ${reward.points} points to receive a $${reward.discount} discount`;
}

function getRewardValue(reward) {
  return `${reward.type || "discount"}:${reward.points}`;
}

function normalizeRewardOptions(value) {
  if (!Array.isArray(value)) {
    return DEFAULT_REWARD_OPTIONS;
  }

  const rewards = value
    .map((reward) => {
      const points = Number(reward?.points);
      const type = reward?.type || "discount";
      const discount = Number(reward?.discount);
      const amount = Number(reward?.amount);

      if (!Number.isInteger(points) || points < 1) {
        return null;
      }

      if (type === "gift_card" || type === "store_credit") {
        if (!Number.isFinite(amount) || amount <= 0) {
          return null;
        }

        return {
          type,
          points,
          amount,
          title: reward?.title,
          description: reward?.description,
        };
      }

      if (!Number.isFinite(discount) || discount <= 0) {
        return null;
      }

      return {
        type: "discount",
        points,
        discount,
        title: reward?.title,
        description: reward?.description,
      };
    })
    .filter(Boolean);

  return rewards.length > 0 ? rewards : DEFAULT_REWARD_OPTIONS;
}

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [settings, setSettings] = useState(shopify.settings.current);

  const apiBaseUrl =
    settings?.api_base_url ||
    "https://jerry-hoping-cassette-mailed.trycloudflare.com";
  const loginMessage = getSettingValue(
    settings,
    "login_message",
    DEFAULT_LOGIN_MESSAGE,
  );
  const descriptionTemplate = getSettingValue(
    settings,
    "description",
    DEFAULT_DESCRIPTION,
  );
  const discountPrompt = getSettingValue(
    settings,
    "discount_prompt",
    DEFAULT_DISCOUNT_PROMPT,
  );

  const [checkoutCustomer, setCheckoutCustomer] = useState(
    shopify.buyerIdentity.customer.current,
  );

  const [customerId, setCustomerId] = useState(null);

  const [points, setPoints] = useState(0);
  const [rewardOptions, setRewardOptions] = useState(DEFAULT_REWARD_OPTIONS);

  const [selectedReward, setSelectedReward] = useState("");
  const [isRedeemOpen, setIsRedeemOpen] = useState(Boolean(checkoutCustomer));
  const [isCheckoutRedemptionEnabled, setIsCheckoutRedemptionEnabled] =
    useState(true);

  const [isLoading, setIsLoading] = useState(Boolean(checkoutCustomer));

  const [isRedeeming, setIsRedeeming] = useState(false);

  const [message, setMessage] = useState("");

  useEffect(() => {
    return shopify.buyerIdentity.customer.subscribe(setCheckoutCustomer);
  }, []);

  useEffect(() => {
    return shopify.settings.subscribe(setSettings);
  }, []);

  useEffect(() => {
    if (!apiBaseUrl) {
      setIsLoading(false);
      setCustomerId(null);
      setPoints(0);
      setSelectedReward("");
      setIsRedeemOpen(false);
      setIsCheckoutRedemptionEnabled(true);
      setMessage("Loyalty API URL is not configured.");
      return;
    }

    if (!checkoutCustomer?.id) {
      setIsLoading(false);
      setCustomerId(null);
      setPoints(0);
      setSelectedReward("");
      setIsRedeemOpen(false);
      setIsCheckoutRedemptionEnabled(true);
      setMessage(loginMessage);
      return;
    }

    let isCurrent = true;

    async function loadPoints() {
      setIsLoading(true);
      setMessage("");

      try {
        const params = new URLSearchParams({
          customerId: checkoutCustomer.id,
          shop: shopify.shop?.myshopifyDomain || "",
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
        setPoints(data.loyaltyPoints);
        setRewardOptions(normalizeRewardOptions(data.rewardOptions));
        setIsCheckoutRedemptionEnabled(
          data.checkoutRedemptionEnabled !== false,
        );
        setIsRedeemOpen(data.checkoutRedemptionEnabled !== false);
      } catch (error) {
        console.error("error on api call", error);

        if (isCurrent) {
          setPoints(0);
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
  }, [apiBaseUrl, checkoutCustomer?.id, loginMessage]);

  useEffect(() => {
    if (
      selectedReward &&
      !rewardOptions.some((reward) => getRewardValue(reward) === selectedReward)
    ) {
      setSelectedReward("");
    }
  }, [rewardOptions, selectedReward]);

  const applyPoints = async (rewardToApply) => {
    if (!isCheckoutRedemptionEnabled) {
      setMessage("Rewards redemption is disabled in checkout.");
      return;
    }

    const reward =
      rewardToApply ||
      rewardOptions.find((item) => getRewardValue(item) === selectedReward);

    if (!reward) {
      setMessage("Please select a reward.");
      return;
    }

    if (points < reward.points) {
      setMessage("Not enough points for this reward.");
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
          pointsToRedeem: reward.points,
          rewardType: reward.type || "discount",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not redeem points");
      }

      setPoints((prev) => prev - reward.points);

      if (data.reward.rewardType === "store_credit") {
        setMessage("Store credit added. Apply store credit in Payment.");
      } else if (data.reward.rewardType === "gift_card") {
        setMessage(`Gift card created: ${data.reward.rewardCode}`);
      } else {
        setMessage(`Discount code created: ${data.reward.rewardCode}`);
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Could not redeem points");
    } finally {
      setIsRedeeming(false);
    }
  };

  const checkoutRewardOptions = rewardOptions.filter(
    (reward) => reward.type !== "store_credit",
  );
  const availableRewards = rewardOptions.filter(
    (reward) => reward.type !== "store_credit" && points >= reward.points,
  );
  const description = formatSettingText(descriptionTemplate, {
    coupon_amount: availableRewards.length,
  });

  if (!isCheckoutRedemptionEnabled) {
    return null;
  }

  return (
    <s-box border="base" padding="large" cornerRadius="large">
      <s-stack gap="large">
        {isRedeemOpen ? (
          <s-stack gap="base">
            <s-text emphasis="bold">Redeem your Points</s-text>

            <s-text>
              {isLoading
                ? "Available points loading..."
                : `Available points ${points}`}
            </s-text>

            <s-text appearance="subdued">{description}</s-text>
            <s-text emphasis="bold">{discountPrompt}</s-text>

            <s-stack gap="small">
              {checkoutRewardOptions.map((reward) => {
                const rewardValue = getRewardValue(reward);
                const isSelected = selectedReward === rewardValue;

                return (
                  <s-box
                    key={rewardValue}
                    border={isSelected ? "strong" : "base"}
                    padding="base"
                  >
                    <s-grid
                      gridTemplateColumns="auto 1fr auto"
                      gap="base"
                      alignItems="center"
                    >
                      <s-text emphasis="bold">
                        {reward.type === "gift_card"
                          ? "Gift"
                          : reward.type === "store_credit"
                            ? "Credit"
                            : "Deal"}
                      </s-text>

                      <s-stack gap="none">
                        <s-text>{formatRewardLabel(reward)}</s-text>
                        <s-text appearance="subdued">
                          {formatRewardDescription(reward)}
                        </s-text>
                      </s-stack>

                      <s-button
                        kind={isSelected ? "primary" : undefined}
                        disabled={points < reward.points || isRedeeming}
                        onClick={() => {
                          setSelectedReward(rewardValue);
                          setMessage("");
                          applyPoints(reward);
                        }}
                      >
                        Redeem
                      </s-button>
                    </s-grid>
                  </s-box>
                );
              })}
            </s-stack>

            <s-text appearance="subdued">
              {availableRewards.length} available reward
              {availableRewards.length === 1 ? "" : "s"}
            </s-text>
          </s-stack>
        ) : null}

        {message ? (
          <s-banner>
            <s-text>{message}</s-text>
          </s-banner>
        ) : null}
      </s-stack>
    </s-box>
  );
}
