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
];

const DEFAULT_LOGIN_MESSAGE = "Sign in to use loyalty points.";
const DEFAULT_DESCRIPTION = "You have {coupon_amount} available {reward_label}";
const DEFAULT_REWARD_PROMPT = "Choose a {reward_singular}";
const REWARD_TYPE_PREFERENCES = ["gift_card", "discount", "both"];

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

function normalizeRewardTypePreference(value) {
  return REWARD_TYPE_PREFERENCES.includes(value) ? value : "both";
}

function getRewardLanguage(rewards) {
  const types = new Set(rewards.map((reward) => reward.type || "discount"));

  if (types.size === 1 && types.has("gift_card")) {
    return {
      singular: "gift card",
      plural: "gift cards",
      badge: "Gift",
    };
  }

  if (types.size === 1 && types.has("discount")) {
    return {
      singular: "discount",
      plural: "discounts",
      badge: "Deal",
    };
  }

  return {
    singular: "reward",
    plural: "rewards",
    badge: "Reward",
  };
}

function replaceRewardWords(text, rewardLanguage) {
  return text
    .replace(/\bdiscounts\b/gi, rewardLanguage.plural)
    .replace(/\bdiscount\b/gi, rewardLanguage.singular);
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

      if (type === "gift_card") {
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
    "https://singh-prospects-introducing-thus.trycloudflare.com";

  const [checkoutCustomer, setCheckoutCustomer] = useState(
    shopify.buyerIdentity.customer.current,
  );

  const [customerId, setCustomerId] = useState(null);

  const [points, setPoints] = useState(0);
  const [rewardOptions, setRewardOptions] = useState(DEFAULT_REWARD_OPTIONS);
  const [rewardTypePreference, setRewardTypePreference] = useState("both");

  const [selectedReward, setSelectedReward] = useState("");
  const [isRedeemOpen, setIsRedeemOpen] = useState(Boolean(checkoutCustomer));
  const [isCheckoutRedemptionEnabled, setIsCheckoutRedemptionEnabled] =
    useState(true);

  const [isLoading, setIsLoading] = useState(Boolean(checkoutCustomer));

  const [isRedeeming, setIsRedeeming] = useState(false);

  const [message, setMessage] = useState("");

  // Text settings from API
  const [apiTextSettings, setApiTextSettings] = useState({});

  // Helper to get text settings - first from API, then from shopify.settings, then default
  const getTextSetting = (key, fallback) => {
    return apiTextSettings[key] !== undefined
      ? apiTextSettings[key]
      : getSettingValue(settings, key, fallback);
  };

  const loginMessage = getTextSetting(
    "checkoutLoginMessage",
    "Sign in to use loyalty points.",
  );
  const descriptionTemplate = getTextSetting(
    "checkoutDescription",
    "You have {coupon_amount} available {reward_label}",
  );
  const discountPrompt = getTextSetting(
    "checkoutRewardPrompt",
    "Choose a {reward_singular}",
  );
  const redeemButtonText = getTextSetting(
    "checkoutRedeemButtonText",
    "Redeem",
  );
  const redeemingText = getTextSetting(
    "checkoutRedeemingText",
    "Redeeming...",
  );
  const pointsLabel = getTextSetting(
    "checkoutPointsLabel",
    "Available points",
  );
  const selectRewardMsg = getTextSetting(
    "checkoutSelectRewardMsg",
    "Please select a reward.",
  );
  const notEnoughPtsMsg = getTextSetting(
    "checkoutNotEnoughPtsMsg",
    "Not enough points for this reward.",
  );
  const disabledMsg = getTextSetting(
    "checkoutDisabledMsg",
    "Rewards redemption is disabled in checkout.",
  );
  const redemptionTitle = getTextSetting(
    "checkoutRedemptionTitle",
    "Redeem your Points",
  );
  const giftCardMsg = getTextSetting(
    "checkoutGiftCardMsg",
    "Gift card created: {rewardCode}",
  );
  const discountMsg = getTextSetting(
    "checkoutDiscountMsg",
    "Discount code created: {rewardCode}. Points will be deducted after payment.",
  );
  const errorMsg = getTextSetting(
    "checkoutErrorMsg",
    "Could not redeem points",
  );
  const loadingMsg = getTextSetting(
    "checkoutLoadingMsg",
    "Available points loading...",
  );
  const availableRewardsMsg = getTextSetting(
    "checkoutAvailableRewardsMsg",
    "{reward_count} available {reward_label}",
  );

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
      setRewardTypePreference("both");
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
      setRewardTypePreference("both");
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
        setRewardTypePreference(
          normalizeRewardTypePreference(data.rewardTypePreference),
        );
        setRewardOptions(normalizeRewardOptions(data.rewardOptions));
        setIsCheckoutRedemptionEnabled(
          data.checkoutRedemptionEnabled !== false,
        );
        setIsRedeemOpen(data.checkoutRedemptionEnabled !== false);
        // Store API text settings
        setApiTextSettings(data);
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
      setMessage(disabledMsg);
      return;
    }

    const reward =
      rewardToApply ||
      rewardOptions.find((item) => getRewardValue(item) === selectedReward);

    if (!reward) {
      setMessage(selectRewardMsg);
      return;
    }

    if (points < reward.points) {
      setMessage(notEnoughPtsMsg);
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
        throw new Error(data.message || errorMsg);
      }

      if (data.reward.rewardType === "gift_card") {
        setMessage(
          formatSettingText(giftCardMsg, {
            rewardCode: data.reward.rewardCode,
          }),
        );
      } else {
        setMessage(
          formatSettingText(discountMsg, {
            rewardCode: data.reward.rewardCode,
          }),
        );
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || errorMsg);
    } finally {
      setIsRedeeming(false);
    }
  };

  const checkoutRewardOptions = rewardOptions.filter((reward) => {
    const type = reward.type || "discount";

    return rewardTypePreference === "both" || type === rewardTypePreference;
  });
  const availableRewards = checkoutRewardOptions.filter(
    (reward) => points >= reward.points,
  );
  const rewardLanguage = getRewardLanguage(checkoutRewardOptions);
  const textReplacements = {
    coupon_amount: availableRewards.length,
    reward_count: availableRewards.length,
    reward_label:
      availableRewards.length === 1
        ? rewardLanguage.singular
        : rewardLanguage.plural,
    reward_singular: rewardLanguage.singular,
    reward_plural: rewardLanguage.plural,
  };
  const description = replaceRewardWords(
    formatSettingText(descriptionTemplate, textReplacements),
    rewardLanguage,
  );
  const rewardPrompt = replaceRewardWords(
    formatSettingText(discountPrompt, textReplacements),
    rewardLanguage,
  );

  if (!isCheckoutRedemptionEnabled) {
    return null;
  }

  return (
    <s-box border="base" padding="large" cornerRadius="large">
      <s-stack gap="large">
        {isRedeemOpen ? (
          <s-stack gap="base">
            <s-text emphasis="bold">{redemptionTitle}</s-text>

            <s-text>
              {isLoading
                ? loadingMsg
                : `${pointsLabel} ${points}`}
            </s-text>

            <s-text appearance="subdued">{description}</s-text>
            <s-text emphasis="bold">{rewardPrompt}</s-text>

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
                          : rewardLanguage.badge}
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
                        {isRedeeming ? redeemingText : redeemButtonText}
                      </s-button>
                    </s-grid>
                  </s-box>
                );
              })}
            </s-stack>

            <s-text appearance="subdued">
              {replaceRewardWords(
                formatSettingText(availableRewardsMsg, {
                  reward_count: availableRewards.length,
                  reward_label:
                    availableRewards.length === 1
                      ? rewardLanguage.singular
                      : rewardLanguage.plural,
                }),
                rewardLanguage,
              )}
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
