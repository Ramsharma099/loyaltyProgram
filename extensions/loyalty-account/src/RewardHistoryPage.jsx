import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { CustomerAccountLoyaltyPoints } from "./CustomerAccount.jsx";

export default function extension() {
  render(<RewardHistoryPage />, document.body);
}

function RewardHistoryPage() {
  return (
    <s-page
      heading="Loyalty rewards"
      subheading="View your points, convert store credit, and review reward history."
    >
      <s-section accessibilityLabel="Loyalty rewards">
        <CustomerAccountLoyaltyPoints />
      </s-section>
    </s-page>
  );
}
