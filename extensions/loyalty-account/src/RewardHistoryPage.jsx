import "@shopify/ui-extensions/preact";
import {
  useAuthenticatedAccountCustomer,
  useSettings,
} from "@shopify/ui-extensions/customer-account/preact";
import { render } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
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
    return { icon: "gift-card", label: "Gift card", tone: "warning" };
  }

  if (activityType?.startsWith("store_credit")) {
    return { icon: "cash-dollar", label: "Store credit", tone: "success" };
  }

  if (activityType === "points_refunded") {
    return { icon: "return", label: "Points", tone: "success" };
  }

  return { icon: "discount", label: "Discount", tone: "info" };
}

function getSettingValue(settings, key, fallback) {
  const value = settings?.[key];

  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString();
}

function formatAmount(value) {
  return value ? `$${value}` : "-";
}

export default function extension() {
  render(<RewardHistoryPage />, document.body);
}

function RewardHistoryPage() {
  const settings = useSettings();
  const customer = useAuthenticatedAccountCustomer();
  const apiBaseUrl =
    settings?.api_base_url ||
    "https://pattern-morgan-syndicate-banner.trycloudflare.com";
  const loadingText = getSettingValue(
    settings,
    "accountLoadingText",
    "Loading...",
  );
  const loginMessage = getSettingValue(
    settings,
    "accountLoginMessage",
    "Sign in to view reward history.",
  );

  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [isLoading, setIsLoading] = useState(Boolean(customer?.id));
  const [message, setMessage] = useState("");

  const fetchHistory = useCallback(async () => {
    if (!apiBaseUrl) {
      setMessage("Loyalty API URL is not configured.");
      setHistory([]);
      setIsLoading(false);
      return;
    }

    if (!customer?.id) {
      setMessage(loginMessage);
      setHistory([]);
      setIsLoading(false);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setMessage("");

    try {
      const params = new URLSearchParams({ customerId: customer.id });
      const data = await fetchApiJson(
        `${apiBaseUrl}/api/customer-reward-history?${params}`,
        undefined,
        "Could not load reward history. Please try again.",
      );

      if (!isCurrent) return;

      if (!data.success) {
        throw new Error(data.message || "Could not load reward history");
      }

      setHistory(data.history || []);
      setHistoryPage(1);
    } catch (error) {
      console.error("Reward history page error:", error);

      if (isCurrent) {
        setHistory([]);
        setMessage(error.message || "Could not load reward history");
      }
    } finally {
      if (isCurrent) {
        setIsLoading(false);
      }
    }

    return () => {
      isCurrent = false;
    };
  }, [apiBaseUrl, customer?.id, loginMessage]);

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

  return (
    <s-page
      heading="Reward activity"
      subheading="View your loyalty points and reward redemption history."
    >
      <s-section accessibilityLabel="Reward history">
        <s-stack gap="base">
          {message ? (
            <s-banner>
              <s-text>{message}</s-text>
            </s-banner>
          ) : null}

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
              disabled={isLoading}
              onClick={fetchHistory}
            >
              Refresh
            </s-button>
          </s-stack>

          {isLoading ? (
            <s-text>{loadingText}</s-text>
          ) : history.length === 0 ? (
            <s-box border="base" padding="large" borderRadius="base">
              <s-stack gap="small">
                <s-heading>No reward activity yet</s-heading>
                <s-text>
                  Your earned points, redemptions, and reward updates will
                  appear here.
                </s-text>
              </s-stack>
            </s-box>
          ) : (
            <s-box border="base" borderRadius="base">
              <s-grid gridTemplateColumns="1.4fr 1fr 1fr 0.7fr 0.8fr 1fr" gap="none">
                <s-grid-item padding="small" border="base">
                  <s-text>Activity</s-text>
                </s-grid-item>
                <s-grid-item padding="small" border="base">
                  <s-text>Type</s-text>
                </s-grid-item>
                <s-grid-item padding="small" border="base">
                  <s-text>Date</s-text>
                </s-grid-item>
                <s-grid-item padding="small" border="base">
                  <s-text>Points</s-text>
                </s-grid-item>
                <s-grid-item padding="small" border="base">
                  <s-text>Amount</s-text>
                </s-grid-item>
                <s-grid-item padding="small" border="base">
                  <s-text>Code</s-text>
                </s-grid-item>

                {paginatedHistory.map((item) => {
                  const activityAppearance = ACTIVITY_APPEARANCE[item.activityType] || {
                    icon: "info",
                    tone: "neutral",
                  };
                  const rewardTypeBadge = getRewardTypeBadge(item.activityType);

                  return (
                  <>
                    <s-grid-item key={`${item.id}-activity`} padding="small" border="base">
                      <s-stack gap="small">
                        <s-stack direction="inline" gap="tight" alignItems="center">
                          <s-icon
                            type={activityAppearance.icon}
                            tone={activityAppearance.tone}
                            size="small"
                          />
                          <s-badge
                            tone={activityAppearance.tone === "critical" ? "critical" : "neutral"}
                          >
                            {item.label}
                          </s-badge>
                        </s-stack>
                        {item.message ? <s-text>{item.message}</s-text> : null}
                      </s-stack>
                    </s-grid-item>
                    <s-grid-item key={`${item.id}-type`} padding="small" border="base">
                      <s-stack direction="inline" gap="tight" alignItems="center">
                        <s-icon
                          type={rewardTypeBadge.icon}
                          tone={rewardTypeBadge.tone}
                          size="small"
                        />
                        <s-badge color="subdued">{rewardTypeBadge.label}</s-badge>
                      </s-stack>
                    </s-grid-item>
                    <s-grid-item key={`${item.id}-date`} padding="small" border="base">
                      <s-text>{formatDate(item.createdAt)}</s-text>
                    </s-grid-item>
                    <s-grid-item key={`${item.id}-points`} padding="small" border="base">
                      <s-text>{item.pointsUsed ?? "-"}</s-text>
                    </s-grid-item>
                    <s-grid-item key={`${item.id}-amount`} padding="small" border="base">
                      <s-text>{formatAmount(item.discountAmount)}</s-text>
                    </s-grid-item>
                    <s-grid-item key={`${item.id}-code`} padding="small" border="base">
                      <s-text>
                        {item.activityType?.startsWith("store_credit")
                          ? "-"
                          : item.rewardCode ?? "-"}
                      </s-text>
                    </s-grid-item>
                  </>
                  );
                })}
              </s-grid>
            </s-box>
          )}

          {!isLoading && historyPageCount > 1 ? (
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
        </s-stack>
      </s-section>
    </s-page>
  );
}
