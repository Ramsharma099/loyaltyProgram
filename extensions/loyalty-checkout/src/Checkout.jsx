import "@shopify/ui-extensions/preact";
import { useCurrency } from "@shopify/ui-extensions/checkout/preact";
import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { fetchApiJson } from "./api";
import { API_BASE_URL } from "./api-base-url";

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
    description: "Redeem 1,500 points to get for free",
  },
];

const REWARD_TYPE_PREFERENCES = ["gift_card", "discount", "both"];
const APP_PROXY_PATH = "/apps/loyalty-points";
const PENDING_REDEMPTION_MESSAGE =
  "A loyalty reward is already applied to this order.";

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

function formatCurrency(value, currencyCode = "USD") {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toLocaleString("en")}`;
  }
}

function formatRewardLabel(reward, currencyCode) {
  if (reward.type === "gift_card") {
    return `${formatCurrency(reward.amount, currencyCode)} Gift Card`;
  }

  if (reward.type === "store_credit") {
    return reward.title || "Store Credit Reward";
  }

  return `Discount ${formatCurrency(reward.discount, currencyCode)} for ${reward.points} points`;
}

function formatRewardDescription(reward, currencyCode) {
  if (reward.description && reward.type === "discount") {
    return reward.description;
  }

  if (reward.type === "gift_card") {
    return `Redeem ${reward.points} points for a ${formatCurrency(reward.amount, currencyCode)} gift card`;
  }

  return `Discount Reward - Redeem ${reward.points} points to receive a ${formatCurrency(reward.discount, currencyCode)} discount`;
}

function getRewardValue(reward) {
  return `${reward.type || "discount"}:${reward.points}`;
}

function getAppliedRewardValue(reward) {
  if (!reward) {
    return "";
  }

  const rewardType = reward.rewardType || reward.type || "discount";
  const points = Number(
    reward.pointsUsed ?? reward.pointsToRedeem ?? reward.points,
  );

  return Number.isInteger(points) && points > 0 ? `${rewardType}:${points}` : "";
}

function normalizeDiscountCodes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) =>
      typeof item === "string" ? item : item?.code || item?.discountCode,
    )
    .filter(Boolean)
    .map((code) => String(code).trim());
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

function normalizeApiBaseUrl(value) {
  return typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
}

function isAppProxyBaseUrl(value) {
  try {
    return new URL(value).pathname.replace(/\/$/, "") === APP_PROXY_PATH;
  } catch {
    return false;
  }
}

function getApiBaseUrls() {
  const generatedUrl = normalizeApiBaseUrl(API_BASE_URL);

  return generatedUrl ? [generatedUrl] : [];
}

function buildApiUrl(apiBaseUrl, endpoint, params) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  const path =
    isAppProxyBaseUrl(baseUrl) && endpoint === "loyalty-balance"
      ? baseUrl
      : `${baseUrl}/api/${endpoint}`;

  return params ? `${path}?${params}` : path;
}

function buildApiUrls(apiBaseUrls, endpoint, params) {
  return apiBaseUrls.map((apiBaseUrl) => buildApiUrl(apiBaseUrl, endpoint, params));
}

async function applyRewardCodeToCheckout(reward) {
  if (reward.rewardType === "gift_card") {
    if (!shopify.applyGiftCardChange) {
      throw new Error("Gift cards cannot be applied in this checkout.");
    }

    const result = await shopify.applyGiftCardChange({
      type: "addGiftCard",
      code: reward.rewardCode,
    });

    if (result.type === "error") {
      throw new Error(result.message || "Could not apply gift card.");
    }

    return;
  }

  if (!shopify.applyDiscountCodeChange) {
    throw new Error("Discount codes cannot be applied in this checkout.");
  }

  const result = await shopify.applyDiscountCodeChange({
    type: "addDiscountCode",
    code: reward.rewardCode,
  });

  if (result.type === "error") {
    throw new Error(result.message || "Could not apply discount code.");
  }
}

async function removeRewardCodeFromCheckout(reward) {
  const isGiftCard = reward.rewardType === "gift_card";
  let result;

  if (isGiftCard) {
    if (!shopify.applyGiftCardChange) {
      throw new Error("This gift card cannot be removed from checkout.");
    }

    result = await shopify.applyGiftCardChange({
      type: "removeGiftCard",
      code: reward.rewardCode,
    });
  } else {
    if (!shopify.applyDiscountCodeChange) {
      throw new Error("This discount cannot be removed from checkout.");
    }

    result = await shopify.applyDiscountCodeChange({
      type: "removeDiscountCode",
      code: reward.rewardCode,
    });
  }

  if (result.type === "error") {
    throw new Error(result.message || "Could not remove this reward.");
  }
}

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const checkoutCurrency = useCurrency();
  const [settings, setSettings] = useState(shopify.settings.current);

  const apiBaseUrls = useMemo(() => getApiBaseUrls(), []);

  const [checkoutCustomer, setCheckoutCustomer] = useState(
    shopify.buyerIdentity.customer.current,
  );

  const [customerId, setCustomerId] = useState(null);

  const [points, setPoints] = useState(0);
  const [rewardOptions, setRewardOptions] = useState(DEFAULT_REWARD_OPTIONS);
  const [rewardTypePreference, setRewardTypePreference] = useState("both");
  const [discountCodes, setDiscountCodes] = useState(() =>
    normalizeDiscountCodes(shopify.discountCodes?.current),
  );
  const [appliedGiftCards, setAppliedGiftCards] = useState(() =>
    Array.isArray(shopify.appliedGiftCards?.current)
      ? shopify.appliedGiftCards.current
      : [],
  );

  const [selectedReward, setSelectedReward] = useState("");
  const [isRedeemOpen, setIsRedeemOpen] = useState(Boolean(checkoutCustomer));
  const [isCheckoutRedemptionEnabled, setIsCheckoutRedemptionEnabled] =
    useState(true);

  const [isLoading, setIsLoading] = useState(Boolean(checkoutCustomer));

  const [redeemingReward, setRedeemingReward] = useState("");
  const [removingReward, setRemovingReward] = useState("");
  const [pendingCheckoutRedemption, setPendingCheckoutRedemption] =
    useState(null);
  const [autoAppliedRewardCode, setAutoAppliedRewardCode] = useState("");

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
  const pendingRewardCode = pendingCheckoutRedemption?.rewardCode;
  const pendingRewardType = pendingCheckoutRedemption?.rewardType;
  const isPendingGiftCardApplied = Boolean(
    pendingRewardCode &&
      pendingRewardType === "gift_card" &&
      appliedGiftCards.some((giftCard) => {
        const lastCharacters = String(giftCard?.lastCharacters || "")
          .trim()
          .toUpperCase();

        return (
          lastCharacters &&
          pendingRewardCode.toUpperCase().endsWith(lastCharacters)
        );
      }),
  );
  const isPendingRewardAppliedToCheckout = Boolean(
    pendingRewardCode &&
      (isPendingGiftCardApplied ||
        discountCodes.some(
          (code) => code.toUpperCase() === pendingRewardCode.toUpperCase(),
        )),
  );

  useEffect(() => {
    return shopify.buyerIdentity.customer.subscribe(setCheckoutCustomer);
  }, []);

  useEffect(() => {
    return shopify.settings.subscribe(setSettings);
  }, []);

  useEffect(() => {
    if (!shopify.discountCodes?.subscribe) {
      return undefined;
    }

    return shopify.discountCodes.subscribe((codes) => {
      setDiscountCodes(normalizeDiscountCodes(codes));
    });
  }, []);

  useEffect(() => {
    if (!shopify.appliedGiftCards?.subscribe) {
      return undefined;
    }

    return shopify.appliedGiftCards.subscribe((giftCards) => {
      setAppliedGiftCards(Array.isArray(giftCards) ? giftCards : []);
    });
  }, []);

  useEffect(() => {
    const rewardCode = pendingCheckoutRedemption?.rewardCode;
    const rewardType = pendingCheckoutRedemption?.rewardType || "discount";

    if (!rewardCode || rewardType !== "discount") {
      return;
    }

    const isApplied = discountCodes.some(
      (code) => code.toUpperCase() === rewardCode.toUpperCase(),
    );

    if (isApplied) {
      if (autoAppliedRewardCode.toUpperCase() !== rewardCode.toUpperCase()) {
        setAutoAppliedRewardCode(rewardCode);
      }

      return;
    }

    if (autoAppliedRewardCode.toUpperCase() === rewardCode.toUpperCase()) {
      setPendingCheckoutRedemption(null);
      setAutoAppliedRewardCode("");
      setMessage("");

      fetchApiJson(
        buildApiUrls(apiBaseUrls, "redeem-points"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operation: "releasePendingReward",
            customerId,
            shop: shopify.shop?.myshopifyDomain || "",
            rewardCode,
          }),
        },
        "Could not cancel the loyalty reward.",
      ).catch((error) => {
        console.error("Could not release pending loyalty reward", error);
        setMessage(error.message || "Could not cancel the loyalty reward.");
      });

      return;
    }

    let isCurrent = true;

    async function applyPendingReward() {
      try {
        await applyRewardCodeToCheckout(pendingCheckoutRedemption);

        if (!isCurrent) {
          return;
        }

        setAutoAppliedRewardCode(rewardCode);
        setDiscountCodes((codes) => [...new Set([...codes, rewardCode])]);
        setMessage(formatSettingText(discountMsg, { rewardCode }));
      } catch (error) {
        console.error(error);

        if (isCurrent) {
          setMessage(error.message || errorMsg);
        }
      }
    }

    applyPendingReward();

    return () => {
      isCurrent = false;
    };
  }, [
    autoAppliedRewardCode,
    apiBaseUrls,
    customerId,
    discountCodes,
    discountMsg,
    errorMsg,
    pendingCheckoutRedemption,
  ]);

  useEffect(() => {
    const rewardCode = pendingCheckoutRedemption?.rewardCode;
    const rewardType = pendingCheckoutRedemption?.rewardType;

    if (!rewardCode || rewardType !== "gift_card") {
      return;
    }

    if (isPendingGiftCardApplied) {
      if (autoAppliedRewardCode.toUpperCase() !== rewardCode.toUpperCase()) {
        setAutoAppliedRewardCode(rewardCode);
      }

      return;
    }

    if (autoAppliedRewardCode.toUpperCase() !== rewardCode.toUpperCase()) {
      let isCurrent = true;

      const applyPendingGiftCard = async () => {
        try {
          await applyRewardCodeToCheckout(pendingCheckoutRedemption);

          if (!isCurrent) {
            return;
          }

          setAutoAppliedRewardCode(rewardCode);
          setAppliedGiftCards((giftCards) => [
            ...giftCards,
            {lastCharacters: rewardCode.slice(-4)},
          ]);
          setMessage(formatSettingText(giftCardMsg, {rewardCode}));
        } catch (error) {
          console.error(error);

          if (isCurrent) {
            setMessage(error.message || errorMsg);
          }
        }
      };

      applyPendingGiftCard();

      return () => {
        isCurrent = false;
      };
    }

    setPendingCheckoutRedemption(null);
    setAutoAppliedRewardCode("");
    setMessage("");

    fetchApiJson(
      buildApiUrls(apiBaseUrls, "redeem-points"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation: "releasePendingReward",
          customerId,
          shop: shopify.shop?.myshopifyDomain || "",
          rewardCode,
        }),
      },
      "Could not cancel the loyalty reward.",
    ).catch((error) => {
      console.error("Could not release pending loyalty reward", error);
      setMessage(error.message || "Could not cancel the loyalty reward.");
    });
  }, [
    apiBaseUrls,
    autoAppliedRewardCode,
    customerId,
    errorMsg,
    giftCardMsg,
    isPendingGiftCardApplied,
    pendingCheckoutRedemption,
  ]);

  useEffect(() => {
    if (apiBaseUrls.length === 0) {
      setIsLoading(false);
      setCustomerId(null);
      setPoints(0);
      setSelectedReward("");
      setRewardTypePreference("both");
      setIsRedeemOpen(false);
      setIsCheckoutRedemptionEnabled(true);
      setPendingCheckoutRedemption(null);
      setAutoAppliedRewardCode("");
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
      setPendingCheckoutRedemption(null);
      setAutoAppliedRewardCode("");
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
          surface: "checkout",
        });

        const data = await fetchApiJson(
          buildApiUrls(apiBaseUrls, "loyalty-balance", params),
          undefined,
          "Could not load points. Please try again.",
        );

        if (!isCurrent) return;

        if (!data.success) {
          throw new Error(data.message || "Could not load points");
        }

        setCustomerId(data.customerId);
        setPoints(data.loyaltyPoints);
        setRewardTypePreference(
          normalizeRewardTypePreference(data.rewardTypePreference),
        );
        setRewardOptions(normalizeRewardOptions(data.rewardOptions));
        setPendingCheckoutRedemption(data.pendingCheckoutRedemption || null);
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
  }, [apiBaseUrls, checkoutCustomer?.id, loginMessage]);

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

    if (isPendingRewardAppliedToCheckout) {
      setMessage(PENDING_REDEMPTION_MESSAGE);
      return;
    }

    if (pendingCheckoutRedemption && !isPendingRewardAppliedToCheckout) {
      setPendingCheckoutRedemption(null);
      setAutoAppliedRewardCode("");
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

    setRedeemingReward(getRewardValue(reward));
    setMessage("");

    try {
      const data = await fetchApiJson(
        buildApiUrls(apiBaseUrls, "redeem-points"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerId,
            shop: shopify.shop?.myshopifyDomain || "",
            pointsToRedeem: reward.points,
            rewardType: reward.type || "discount",
            appliedDiscountCodes: discountCodes,
          }),
        },
        errorMsg,
      );

      if (!data.success || !data.reward) {
        throw new Error(data.message || errorMsg);
      }

      await applyRewardCodeToCheckout(data.reward);

      if (data.reward.rewardType === "gift_card") {
        setAutoAppliedRewardCode(data.reward.rewardCode);
        setAppliedGiftCards((giftCards) => [
          ...giftCards,
          {lastCharacters: data.reward.rewardCode.slice(-4)},
        ]);
        setPendingCheckoutRedemption(data.reward);
        setMessage(
          formatSettingText(giftCardMsg, {
            rewardCode: data.reward.rewardCode,
          }),
        );
      } else {
        setDiscountCodes((codes) => [
          ...new Set([...codes, data.reward.rewardCode]),
        ]);
        setAutoAppliedRewardCode(data.reward.rewardCode);
        setPendingCheckoutRedemption(data.reward);
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
      setRedeemingReward("");
    }
  };

  const removeAppliedReward = async () => {
    const reward = pendingCheckoutRedemption;

    if (!reward?.rewardCode) return;

    setRemovingReward(getAppliedRewardValue(reward));
    setMessage("");

    try {
      await removeRewardCodeFromCheckout(reward);
      await fetchApiJson(
        buildApiUrls(apiBaseUrls, "redeem-points"),
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            operation: "releasePendingReward",
            customerId,
            shop: shopify.shop?.myshopifyDomain || "",
            rewardCode: reward.rewardCode,
          }),
        },
        "Could not release the loyalty reward.",
      );

      setPendingCheckoutRedemption(null);
      setAutoAppliedRewardCode("");
      setSelectedReward("");
      setDiscountCodes((codes) =>
        codes.filter(
          (code) => code.toUpperCase() !== reward.rewardCode.toUpperCase(),
        ),
      );
      setAppliedGiftCards((giftCards) =>
        giftCards.filter((giftCard) => {
          const lastCharacters = String(giftCard?.lastCharacters || "")
            .trim()
            .toUpperCase();

          return (
            !lastCharacters ||
            !reward.rewardCode.toUpperCase().endsWith(lastCharacters)
          );
        }),
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Could not remove this reward.");
    } finally {
      setRemovingReward("");
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
  const appliedRewardValue = isPendingRewardAppliedToCheckout
    ? getAppliedRewardValue(pendingCheckoutRedemption)
    : "";

  if (!isCheckoutRedemptionEnabled) {
    return null;
  }

  return (
    <s-box border="base" padding="large" borderRadius="large">
      <s-stack gap="large">
        {isRedeemOpen ? (
          <s-stack gap="large">
            <s-grid
              gridTemplateColumns="1fr auto"
              gap="base"
              alignItems="center"
            >
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-icon type="star" tone="success" />
                <s-stack gap="none">
                  <s-heading>{redemptionTitle}</s-heading>
                  <s-text color="subdued">Use points on this order</s-text>
                </s-stack>
              </s-stack>
              <s-badge icon="savings" color="subdued">
                {availableRewards.length} available
              </s-badge>
            </s-grid>

            <s-box background="subdued" padding="base" borderRadius="base">
              <s-grid
                gridTemplateColumns="1fr auto"
                gap="base"
                alignItems="center"
              >
                <s-stack gap="none">
                  <s-text color="subdued">{pointsLabel}</s-text>
                  <s-text type="small">Ready to redeem</s-text>
                </s-stack>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-icon type="star-filled" tone="success" />
                  <s-text type="strong">
                    {isLoading ? loadingMsg : `${points} points`}
                  </s-text>
                </s-stack>
              </s-grid>
            </s-box>

            <s-stack gap="small">
              <s-heading>{rewardPrompt}</s-heading>
              <s-text color="subdued">{description}</s-text>
            </s-stack>

            <s-stack gap="small">
              {checkoutRewardOptions.map((reward) => {
                const rewardValue = getRewardValue(reward);
                const isSelected = selectedReward === rewardValue;
                const isRedeeming = redeemingReward === rewardValue;
                const isApplied = appliedRewardValue === rewardValue;
                const rewardContent = (
                  <s-grid
                    gridTemplateColumns="auto 1fr auto"
                    gap="base"
                    alignItems="center"
                  >
                    <s-box
                      background="subdued"
                      padding="small"
                      borderRadius="max"
                    >
                      <s-icon
                        type={
                          reward.type === "gift_card"
                            ? "gift-card"
                            : "discount"
                        }
                        tone={isApplied ? "success" : "neutral"}
                      />
                    </s-box>

                    <s-stack gap="small">
                      <s-stack gap="none">
                        <s-text type="strong">
                          {formatRewardLabel(
                            reward,
                            checkoutCurrency?.isoCode || "USD",
                          )}
                        </s-text>
                        <s-text color="subdued" type="small">
                        {formatRewardDescription(
                          reward,
                          checkoutCurrency?.isoCode || "USD",
                        )}
                        </s-text>
                      </s-stack>
                      <s-stack direction="inline" gap="small">
                        <s-badge icon="star" color="subdued" size="small">
                          {reward.points} points
                        </s-badge>
                        <s-badge color="subdued" size="small">
                          {reward.type === "gift_card"
                            ? "Gift card"
                            : "Discount"}
                        </s-badge>
                      </s-stack>
                    </s-stack>

                    <s-button
                      variant={isSelected ? "primary" : "secondary"}
                      tone={isApplied ? "critical" : "auto"}
                      loading={isRedeeming || removingReward === rewardValue}
                      disabled={
                        (!isApplied && isPendingRewardAppliedToCheckout) ||
                        points < reward.points ||
                        Boolean(redeemingReward) ||
                        Boolean(removingReward)
                      }
                      onClick={() => {
                        if (isApplied) {
                          removeAppliedReward();
                          return;
                        }
                        setSelectedReward(rewardValue);
                        setMessage("");
                        applyPoints(reward);
                      }}
                    >
                      {isApplied
                        ? removingReward === rewardValue
                          ? "Removing..."
                          : "Remove"
                        : isRedeeming
                          ? redeemingText
                          : redeemButtonText}
                    </s-button>
                  </s-grid>
                );

                if (isApplied) {
                  return (
                    <s-box
                      key={rewardValue}
                      background="subdued"
                      border="large"
                      padding="base"
                      borderRadius="large"
                    >
                      {rewardContent}
                    </s-box>
                  );
                }

                return (
                  <s-box
                    key={rewardValue}
                    border={isSelected ? "large" : "base"}
                    padding="base"
                    borderRadius="large"
                  >
                    {rewardContent}
                  </s-box>
                );
              })}
            </s-stack>

            {!isPendingRewardAppliedToCheckout ? (
              <s-text color="subdued" type="small">
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
            ) : null}
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
