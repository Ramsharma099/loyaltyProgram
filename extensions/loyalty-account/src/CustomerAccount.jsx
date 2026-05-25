import "@shopify/ui-extensions/preact";
import {
  useAuthenticatedAccountCustomer,
  useSettings,
} from "@shopify/ui-extensions/customer-account/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default function extension() {
  render(<CustomerAccountLoyaltyPoints />, document.body);
}

function CustomerAccountLoyaltyPoints() {
  const settings = useSettings();
  const customer = useAuthenticatedAccountCustomer();
  const apiBaseUrl =
    settings?.api_base_url ||
    "https://youth-franklin-shipping-filed.trycloudflare.com";

  const [points, setPoints] = useState(0);
  const [isLoading, setIsLoading] = useState(Boolean(customer?.id));
  const [message, setMessage] = useState("");
  const pointsLabel = `${points.toLocaleString()} ${points === 1 ? "point" : "points"}`;

  useEffect(() => {
    if (!apiBaseUrl) {
      setIsLoading(false);
      setPoints(0);
      setMessage("Loyalty API URL is not configured.");
      return;
    }

    if (!customer?.id) {
      setIsLoading(false);
      setPoints(0);
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

        setPoints(data.loyaltyPoints || 0);
      } catch (error) {
        console.error(error);

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
  }, [apiBaseUrl, customer?.id]);

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

        {message ? (
          <s-banner>
            <s-text>{message}</s-text>
          </s-banner>
        ) : null}
      </s-stack>
    </s-box>
  );
}
