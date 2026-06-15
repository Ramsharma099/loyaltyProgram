import "@shopify/ui-extensions/preact";
import {
  useAuthenticatedAccountCustomer,
  useSettings,
} from "@shopify/ui-extensions/customer-account/preact";
import { render } from "preact";
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import { fetchApiJson } from "./api";

const HISTORY_PAGE_SIZE = 8;

const ACTIVITY_APPEARANCE = {
  discount_created: { icon: "info", tone: "info" },
  discount_applied: { icon: "check-circle", tone: "success" },
  discount_expired: { icon: "clock", tone: "warning" },
  discount_failed: { icon: "x-circle", tone: "critical" },
  gift_card_created: { icon: "info", tone: "info" },
  gift_card_applied: { icon: "check-circle", tone: "success" },
  gift_card_failed: { icon: "x-circle", tone: "critical" },
  store_credit_created: { icon: "check-circle", tone: "success" },
  store_credit_failed: { icon: "x-circle", tone: "critical" },
  points_refunded: { icon: "return", tone: "success" },
};

function getRewardTypeBadge(activityType) {
  if (activityType?.startsWith("gift_card")) {
    return { icon: "gift-card", label: "GIFT CARD", tone: "warning" };
  }

  if (activityType?.startsWith("store_credit")) {
    return { icon: "cash-dollar", label: "STORE CREDIT", tone: "success" };
  }

  if (activityType === "points_refunded") {
    return { icon: "return", label: "POINTS", tone: "success" };
  }

  return { icon: "discount", label: "DISCOUNT", tone: "info" };
}

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
    title: reward?.title || "Store credit",
  };
}

export function renderLoyaltyAccountExtension() {
  render(<CustomerAccountLoyaltyPoints />, document.body);
}

export default function extension() {
  renderLoyaltyAccountExtension();
}

function CustomerAccountLoyaltyPoints() {
  const settings = useSettings();
  const customer = useAuthenticatedAccountCustomer();
  const apiBaseUrl =
    settings?.api_base_url ||
    "https://cindy-bill-tan-roger.trycloudflare.com";

  const [points, setPoints] = useState(0);
  const [customerId, setCustomerId] = useState(null);
  const [storeCreditReward, setStoreCreditReward] = useState(null);
  const [storeCreditBalance, setStoreCreditBalance] = useState(null);
  const [storeCreditPoints, setStoreCreditPoints] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(customer?.id));
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isRedemptionEnabled, setIsRedemptionEnabled] = useState(true);
  const [message, setMessage] = useState("");
  const [apiTextSettings, setApiTextSettings] = useState({});
  const [activeTab, setActiveTab] = useState("balance");
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const confirmationModalRef = useRef(null);
  const pointsLabel = `${points.toLocaleString()} ${points === 1 ? "point" : "points"}`;

  // Extension editor values override API-managed defaults.
  const getTextSetting = (key, fallback) => {
    return getSettingValue(settings, key, apiTextSettings[key] ?? fallback);
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
  const storeCreditTitle = getTextSetting(
    "accountStoreCreditTitle",
    "Store Credit Reward",
  );
  const conversionRateText = getTextSetting(
    "accountConversionRateText",
    "{points} points = ${amount} store credit",
  );
  const loadingText = getTextSetting(
    "accountLoadingText",
    "Loading...",
  );
  const redeemingText = getTextSetting(
    "accountRedeemingText",
    "Converting...",
  );
  const convertButtonText = getTextSetting(
    "accountRedeemButtonText",
    "Convert to store credit",
  );
  const disabledMsg = getTextSetting(
    "accountDisabledMsg",
    "Store credit conversion is currently disabled.",
  );
  const notEnoughPtsMsg = getTextSetting(
    "accountNotEnoughPtsMsg",
    "Earn {remaining_points} more points to convert this amount.",
  );
  const storeCreditSuccessMsg = getTextSetting(
    "accountGiftCardMsg",
    "Store credit added: ${amount}",
  );
  const errorMsg = getTextSetting(
    "accountErrorMsg",
    "Could not convert points to store credit",
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
      setStoreCreditReward(null);
      setStoreCreditBalance(null);
      setStoreCreditPoints("");
      setIsRedemptionEnabled(true);
      setMessage(configErrorMsg);
      return;
    }

    if (!customer?.id) {
      setIsLoading(false);
      setPoints(0);
      setCustomerId(null);
      setStoreCreditReward(null);
      setStoreCreditBalance(null);
      setStoreCreditPoints("");
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

        const data = await fetchApiJson(
          `${apiBaseUrl}/api/loyalty-balance?${params}`,
          undefined,
          "Could not load points. Please try again.",
        );

        if (!isCurrent) return;

        if (!data.success) {
          throw new Error(data.message || "Could not load points");
        }

        setCustomerId(data.customerId);
        setPoints(data.loyaltyPoints || 0);
        setStoreCreditBalance(data.storeCreditBalance || null);
        setIsRedemptionEnabled(data.checkoutRedemptionEnabled !== false);
        const nextStoreCreditReward = normalizeStoreCreditReward(
          data.storeCreditReward,
        );
        setStoreCreditReward(nextStoreCreditReward);
        setStoreCreditPoints(
          nextStoreCreditReward ? String(nextStoreCreditReward.points) : "",
        );
        // Store API text settings
        setApiTextSettings(data);
      } catch (error) {
        console.error(error);

        if (isCurrent) {
          setPoints(0);
          setCustomerId(null);
          setStoreCreditReward(null);
          setStoreCreditBalance(null);
          setStoreCreditPoints("");
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

  const fetchHistory = useCallback(async () => {
    if (!apiBaseUrl || !customer?.id) return;

    let isCurrent = true;
    setIsLoadingHistory(true);

    try {
      const params = new URLSearchParams({ customerId: customer.id });
      const data = await fetchApiJson(
        `${apiBaseUrl}/api/customer-reward-history?${params}`,
        undefined,
        "Could not load reward history. Please try again.",
      );

      if (isCurrent && data?.success) {
        setHistory(data.history || []);
        setHistoryPage(1);
      } else if (isCurrent) {
        throw new Error(data?.message || "Could not load reward history");
      }
    } catch (error) {
      console.error("History error:", error);
      if (isCurrent) {
        setHistory([]);
        setMessage(error.message || "Could not load reward history");
      }
    } finally {
      if (isCurrent) setIsLoadingHistory(false);
    }

    return () => {
      isCurrent = false;
    };
  }, [apiBaseUrl, customer?.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const historyPageCount = Math.max(
    1,
    Math.ceil(history.length / HISTORY_PAGE_SIZE),
  );
  const paginatedHistory = history.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE,
  );

  const redeemStoreCredit = async () => {
    const pointsToRedeem = Number(storeCreditPoints);

    if (!customerId || !storeCreditReward) {
      setMessage(errorMsg);
      return;
    }

    if (!isRedemptionEnabled) {
      setMessage(disabledMsg);
      return;
    }

    if (
      !Number.isInteger(pointsToRedeem) ||
      pointsToRedeem < storeCreditReward.points ||
      pointsToRedeem % storeCreditReward.points !== 0
    ) {
      setMessage(
        `Choose points in increments of ${storeCreditReward.points.toLocaleString()}.`,
      );
      return;
    }

    if (points < pointsToRedeem) {
      setMessage(
        formatSettingText(notEnoughPtsMsg, {
          remaining_points: pointsToRedeem - points,
        }),
      );
      return;
    }

    setIsRedeeming(true);
    setMessage("");

    try {
      const data = await fetchApiJson(
        `${apiBaseUrl}/api/redeem-points`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerId,
            pointsToRedeem,
            rewardType: "store_credit",
          }),
        },
        errorMsg,
      );

      if (!data.success || !data.reward) {
        throw new Error(data.message || errorMsg);
      }

      setPoints((prev) => prev - pointsToRedeem);
      setStoreCreditBalance((previousBalance) => ({
        amount:
          Number(previousBalance?.amount || 0) + Number(data.reward.amount || 0),
        currencyCode: previousBalance?.currencyCode || null,
      }));
      setStoreCreditPoints(String(storeCreditReward.points));
      setMessage(
        formatSettingText(storeCreditSuccessMsg, {
          amount: data.reward.amount.toLocaleString(),
        }),
      );
      confirmationModalRef.current?.hideOverlay();
      // Refresh the host account page so Shopify's store-credit balance updates.
      // eslint-disable-next-line no-undef
      if (typeof shopify !== "undefined" && typeof shopify.reload === "function") {
        // eslint-disable-next-line no-undef
        shopify.reload();
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || errorMsg);
    } finally {
      setIsRedeeming(false);
    }
  };

  const selectedStoreCreditPoints = Number(storeCreditPoints);
  const storeCreditPointStep = storeCreditReward?.points ?? 100;
  const maxStoreCreditPoints = storeCreditReward
    ? Math.max(
        storeCreditPointStep,
        Math.floor(points / storeCreditPointStep) * storeCreditPointStep,
      )
    : 0;
  const isValidStoreCreditAmount =
    Boolean(storeCreditReward) &&
    Number.isInteger(selectedStoreCreditPoints) &&
    selectedStoreCreditPoints >= storeCreditPointStep &&
    selectedStoreCreditPoints % storeCreditPointStep === 0 &&
    selectedStoreCreditPoints <= points;
  const selectedStoreCreditAmount =
    storeCreditReward && Number.isFinite(selectedStoreCreditPoints)
      ? (
          storeCreditReward.amount *
          (selectedStoreCreditPoints / storeCreditReward.points)
        ).toLocaleString()
      : "0";
  const formattedConversionRate = storeCreditReward
    ? formatSettingText(conversionRateText, {
        points: storeCreditReward.points.toLocaleString(),
        amount: storeCreditReward.amount.toLocaleString(),
      })
    : "";
  const handleStoreCreditPointsInput = (event) => {
    const inputSource = event.composedPath?.()[0];
    const nextValue =
      inputSource?.value ??
      event.detail?.value ??
      event.target?.value ??
      event.currentTarget?.value ??
      "";

    setStoreCreditPoints(String(nextValue));
  };

  return (
    <s-box border="base" padding="large" borderRadius="base">
      <s-stack gap="base">
        <s-button-group>
          <s-button
            slot="primary-action"
            variant={activeTab === "balance" ? "primary" : "secondary"}
            onClick={() => setActiveTab("balance")}
          >
            Store credit
          </s-button>
          <s-button
            slot="secondary-actions"
            variant={activeTab === "history" ? "primary" : "secondary"}
            onClick={() => setActiveTab("history")}
          >
            Reward history
          </s-button>
        </s-button-group>

        {message ? (
          <s-banner>
            <s-text>{message}</s-text>
          </s-banner>
        ) : null}

        {activeTab === "balance" ? (
          <>
            <s-heading>{balanceTitle}</s-heading>
            <s-text>{availableLabel}</s-text>

            <s-box border="base" padding="large" borderRadius="base">
              <s-stack gap="small">
                <s-text>{currentBalanceLabel}</s-text>
                <s-heading>{isLoading ? loadingText : pointsLabel}</s-heading>
              </s-stack>
            </s-box>

            {storeCreditReward ? (
              <s-box border="base" padding="large" borderRadius="base">
                <s-stack gap="base">
                  <s-stack gap="none">
                    <s-text>{storeCreditTitle}</s-text>
                    <s-text>{formattedConversionRate}</s-text>
                  </s-stack>

                  <s-stack direction="inline" alignItems="center" gap="small">
                    <s-text>Available store credit:</s-text>
                    <s-text>
                      {isLoading
                        ? loadingText
                        : Number(storeCreditBalance?.amount || 0).toLocaleString()}
                    </s-text>
                  </s-stack>

                  <s-number-field
                    label="Points to convert"
                    value={storeCreditPoints}
                    min={storeCreditPointStep}
                    max={maxStoreCreditPoints}
                    step={storeCreditPointStep}
                    controls="stepper"
                    disabled={
                      isLoading ||
                      isRedeeming ||
                      !isRedemptionEnabled ||
                      points < storeCreditReward.points
                    }
                    onInput={handleStoreCreditPointsInput}
                    onChange={handleStoreCreditPointsInput}
                  />
                  <s-button
                    variant="primary"
                    command="--show"
                    commandFor="store-credit-confirmation"
                    disabled={
                      isLoading ||
                      isRedeeming ||
                      !isRedemptionEnabled ||
                      !customerId ||
                      !isValidStoreCreditAmount
                    }
                  >
                    {isRedeeming ? redeemingText : convertButtonText}
                  </s-button>
                  <s-modal
                    ref={confirmationModalRef}
                    id="store-credit-confirmation"
                    heading="Confirm store credit conversion"
                    size="small"
                  >
                    <s-stack gap="base">
                      <s-text>
                        Convert {selectedStoreCreditPoints.toLocaleString()} points
                        into ${selectedStoreCreditAmount} store credit?
                      </s-text>
                      <s-text>
                        Your loyalty balance will be reduced after confirmation.
                      </s-text>
                    </s-stack>
                    <s-button
                      slot="secondary-actions"
                      variant="secondary"
                      command="--hide"
                      commandFor="store-credit-confirmation"
                      disabled={isRedeeming}
                    >
                      Cancel
                    </s-button>
                    <s-button
                      slot="primary-action"
                      variant="primary"
                      disabled={isRedeeming}
                      onClick={redeemStoreCredit}
                    >
                      {isRedeeming ? redeemingText : "Confirm"}
                    </s-button>
                  </s-modal>
                  {!isRedemptionEnabled ? (
                    <s-text>{disabledMsg}</s-text>
                  ) : null}
                </s-stack>
              </s-box>
            ) : null}
          </>
        ) : (
          <>
            <s-stack
              direction="inline"
              alignItems="center"
              justifyContent="space-between"
              gap="base"
            >
              <s-stack direction="inline" alignItems="center" gap="small">
                <s-heading>History</s-heading>
                <s-text>
                  {history.length} item{history.length === 1 ? "" : "s"}
                </s-text>
              </s-stack>
              <s-button
                variant="secondary"
                disabled={isLoadingHistory}
                onClick={fetchHistory}
              >
                Refresh
              </s-button>
            </s-stack>

            {isLoadingHistory ? (
              <s-text>{loadingText}</s-text>
            ) : history.length === 0 ? (
              <s-stack gap="small">
                <s-text>No reward history</s-text>
                <s-text>Your reward activities will appear here. Try refreshing to check for recent activity.</s-text>
                <s-button variant="secondary" disabled={isLoadingHistory} onClick={fetchHistory}>
                  Refresh
                </s-button>
              </s-stack>
            ) : (
              <>
              <s-box border="base" borderRadius="base" padding="base">
  <s-stack gap="small">

    {/* Header */}
    <s-grid
      gridTemplateColumns="1.3fr 1fr 1.4fr 0.7fr 0.8fr 0.7fr 1.6fr 1.1fr"
      gap="none"
    >
      <s-grid-item><s-text>ACTIVITY</s-text></s-grid-item>
      <s-grid-item><s-text>TYPE</s-text></s-grid-item>
      {/* <s-grid-item><s-text>CUSTOMER</s-text></s-grid-item> */}
      <s-grid-item><s-text>REWARD CODE</s-text></s-grid-item>
      <s-grid-item><s-text>POINTS</s-text></s-grid-item>
      <s-grid-item><s-text>AMOUNT</s-text></s-grid-item>
      <s-grid-item><s-text>ORDER</s-text></s-grid-item>
      <s-grid-item><s-text>MESSAGE</s-text></s-grid-item>
      <s-grid-item><s-text>TIME</s-text></s-grid-item>
    </s-grid>

    {paginatedHistory.map((item) => {
      const activityAppearance = ACTIVITY_APPEARANCE[item.activityType] || {
        icon: "info",
        tone: "neutral",
      };
      const rewardTypeBadge = getRewardTypeBadge(item.activityType);

      return (
      <s-box
        key={item.id}
        border="base"
        borderRadius="base"
        padding="small"
      >
        <s-grid
          gridTemplateColumns="1.3fr 1fr 1.4fr 0.7fr 0.8fr 0.7fr 1.6fr 1.1fr"
          gap="small"
        >
          {/* Activity */}
          <s-grid-item>
            <s-stack direction="inline" gap="tight" alignItems="center">
              <s-icon
                type={activityAppearance.icon}
                tone={activityAppearance.tone}
                size="small"
              />
              <s-badge
                tone={activityAppearance.tone === "critical" ? "critical" : "neutral"}
              >
                {item.label || "Activity"}
              </s-badge>
            </s-stack>
          </s-grid-item>

          {/* Type */}
          <s-grid-item>
            <s-stack direction="inline" gap="tight" alignItems="center">
              <s-icon
                type={rewardTypeBadge.icon}
                tone={rewardTypeBadge.tone}
                size="small"
              />
              <s-badge color="subdued">{rewardTypeBadge.label}</s-badge>
            </s-stack>
          </s-grid-item>

          {/* Customer */}
          {/* <s-grid-item>
            <s-stack gap="none">
              <s-text emphasis="bold">
                {item.customerName || customer?.displayName || "-"}
              </s-text>

              <s-text appearance="subdued">
                {item.customerEmail || customer?.emailAddress?.emailAddress || "-"}
              </s-text>
            </s-stack>
          </s-grid-item> */}

          {/* Reward Code */}
          <s-grid-item>
            <s-text>
              {item.activityType?.startsWith("store_credit")
                ? "-"
                : item.rewardCode || "-"}
            </s-text>
          </s-grid-item>

          {/* Points */}
          <s-grid-item>
            <s-text>{item.pointsUsed ?? "-"}</s-text>
          </s-grid-item>

          {/* Amount */}
          <s-grid-item>
            <s-text>
              {item.discountAmount
                ? `$${Number(item.discountAmount).toFixed(2)}`
                : "-"}
            </s-text>
          </s-grid-item>

          {/* Order */}
          <s-grid-item>
            <s-text>{item.orderName || item.orderId || "-"}</s-text>
          </s-grid-item>

          {/* Message */}
          <s-grid-item>
            <s-text>
              {item.message ||
                (item.label?.includes("applied")
                  ? "Gift card applied to a paid order."
                  : "Gift card created and issued successfully.")}
            </s-text>
          </s-grid-item>

          {/* Time */}
          <s-grid-item>
            <s-text>
              {item.createdAt
                ? new Date(item.createdAt).toLocaleString()
                : "-"}
            </s-text>
          </s-grid-item>
        </s-grid>
      </s-box>
      );
    })}
  </s-stack>
</s-box>
                {historyPageCount > 1 ? (
                  <s-stack gap="small">
                    <s-text>
                      Page {historyPage} of {historyPageCount}
                    </s-text>
                    <s-button-group>
                      <s-button
                        slot="secondary-actions"
                        variant="secondary"
                        disabled={historyPage === 1}
                        onClick={() => setHistoryPage((page) => page - 1)}
                      >
                        Previous
                      </s-button>
                      <s-button
                        slot="primary-action"
                        variant="primary"
                        disabled={historyPage === historyPageCount}
                        onClick={() => setHistoryPage((page) => page + 1)}
                      >
                        Next
                      </s-button>
                    </s-button-group>
                  </s-stack>
                ) : null}
              </>
            )}
          </>
        )}
      </s-stack>
    </s-box>
  );
}
