import "@shopify/ui-extensions/preact";
import {
  useAuthenticatedAccountCustomer,
  useSettings,
} from "@shopify/ui-extensions/customer-account/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

const DEFAULT_GIFT_CARD_REWARD = {
  type: "gift_card",
  points: 1500,
  amount: 15,
  title: "$15 Gift Card",
  description: "Redeem 1,500 points for a $15 gift card",
};

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

function normalizeGiftCardReward(reward) {
  const points = Number(reward?.points);
  const amount = Number(reward?.amount);

  if (
    reward?.type !== "gift_card" ||
    !Number.isInteger(points) ||
    points < 1 ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return {
    type: "gift_card",
    points,
    amount,
    title: reward?.title || DEFAULT_GIFT_CARD_REWARD.title,
    description: reward?.description || DEFAULT_GIFT_CARD_REWARD.description,
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
    "https://singh-prospects-introducing-thus.trycloudflare.com";

  const [points, setPoints] = useState(0);
  const [customerId, setCustomerId] = useState(null);
  const [giftCardRewards, setGiftCardRewards] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(customer?.id));
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isRedemptionEnabled, setIsRedemptionEnabled] = useState(true);
  const [message, setMessage] = useState("");
  const [apiTextSettings, setApiTextSettings] = useState({});
  const pointsLabel = `${points.toLocaleString()} ${points === 1 ? "point" : "points"}`;

  // Helper to get text settings - first from API, then from shopify.settings, then default
  const getTextSetting = (key, fallback) => {
    return apiTextSettings[key] !== undefined
      ? apiTextSettings[key]
      : getSettingValue(settings, key, fallback);
  };

  const loginMessage = getTextSetting(
    "accountLoginMessage",
    "Sign in to view loyalty points.",
  );
  const balanceTitle = getTextSetting(
    "accountBalanceTitle",
    "Loyalty balance",
  );
  const availableLabel = getTextSetting(
    "accountAvailableLabel",
    "Available points",
  );
  const currentBalanceLabel = getTextSetting(
    "accountCurrentBalance",
    "Current balance",
  );
  const loadingText = getTextSetting(
    "accountLoadingText",
    "Loading...",
  );
  const redeemingText = getTextSetting(
    "accountRedeemingText",
    "Redeeming...",
  );
  const redeemButtonText = getTextSetting(
    "accountRedeemButtonText",
    "Redeem gift card",
  );
  const disabledMsg = getTextSetting(
    "accountDisabledMsg",
    "Rewards redemption is currently disabled.",
  );
  const notEnoughPtsMsg = getTextSetting(
    "accountNotEnoughPtsMsg",
    "Earn {remaining_points} more points to redeem a gift card.",
  );
  const giftCardMsg = getTextSetting(
    "accountGiftCardMsg",
    "Gift card created: {rewardCode}",
  );
  const errorMsg = getTextSetting(
    "accountErrorMsg",
    "Could not redeem gift card",
  );
  const configErrorMsg = getTextSetting(
    "accountConfigErrorMsg",
    "Loyalty API URL is not configured.",
  );

  useEffect(() => {
    if (!apiBaseUrl) {
      setIsLoading(false);
      setPoints(0);
      setCustomerId(null);
      setGiftCardRewards([]);
      setIsRedemptionEnabled(true);
      setMessage(configErrorMsg);
      return;
    }

    if (!customer?.id) {
      setIsLoading(false);
      setPoints(0);
      setCustomerId(null);
      setGiftCardRewards([]);
      setIsRedemptionEnabled(true);
      setMessage(loginMessage);
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
        setGiftCardRewards(
          (data.rewardOptions || [])
            .map(normalizeGiftCardReward)
            .filter(Boolean),
        );
        // Store API text settings
        setApiTextSettings(data);
      } catch (error) {
        console.error(error);

        if (isCurrent) {
          setPoints(0);
          setCustomerId(null);
          setGiftCardRewards([]);
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
  }, [apiBaseUrl, customer?.id, configErrorMsg, loginMessage]);

  const redeemGiftCard = async (giftCardReward) => {
    if (!customerId) {
      setMessage(errorMsg);
      return;
    }

    if (!isRedemptionEnabled) {
      setMessage(disabledMsg);
      return;
    }

    if (!giftCardReward) {
      setMessage(errorMsg);
      return;
    }

    if (points < giftCardReward.points) {
      setMessage(
        formatSettingText(notEnoughPtsMsg, {
          remaining_points: giftCardReward.points - points,
        }),
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
          pointsToRedeem: giftCardReward.points,
          rewardType: "gift_card",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || errorMsg);
      }

      setPoints((prev) => prev - giftCardReward.points);
      setMessage(
        formatSettingText(giftCardMsg, {
          rewardCode: data.reward.rewardCode,
        }),
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || errorMsg);
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <s-box border="base" padding="large" cornerRadius="large">
      <s-stack gap="base">
        <s-stack gap="none">
          <s-heading>{balanceTitle}</s-heading>
          <s-text appearance="subdued">{availableLabel}</s-text>
        </s-stack>

        <s-box border="base" padding="large" cornerRadius="base">
          <s-stack gap="small">
            <s-text appearance="subdued">{currentBalanceLabel}</s-text>
            <s-heading>{isLoading ? loadingText : pointsLabel}</s-heading>
          </s-stack>
        </s-box>

        {giftCardRewards.map((giftCardReward) => {
          const canRedeemGiftCard =
            Boolean(customerId) && points >= giftCardReward.points;

          return (
            <s-box
              key={`${giftCardReward.points}-${giftCardReward.amount}`}
              border="base"
              padding="large"
              cornerRadius="base"
            >
              <s-stack gap="base">
                <s-stack gap="none">
                  <s-text emphasis="bold">{giftCardReward.title}</s-text>
                  <s-text appearance="subdued">
                    {giftCardReward.points.toLocaleString()} points = $
                    {giftCardReward.amount.toLocaleString()} gift card
                  </s-text>
                </s-stack>

                <s-button
                  kind="primary"
                  disabled={
                    isLoading ||
                    isRedeeming ||
                    !isRedemptionEnabled ||
                    !canRedeemGiftCard
                  }
                  onClick={() => redeemGiftCard(giftCardReward)}
                >
                  {isRedeeming ? redeemingText : redeemButtonText}
                </s-button>
                {!isRedemptionEnabled ? (
                  <s-text appearance="subdued">
                    {disabledMsg}
                  </s-text>
                ) : null}
              </s-stack>
            </s-box>
          );
        })}

        {message ? (
          <s-banner>
            <s-text>{message}</s-text>
          </s-banner>
        ) : null}
      </s-stack>
    </s-box>
  );
}
