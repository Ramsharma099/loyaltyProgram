import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getLoyaltySettings } from "../services/loyalty-settings.server";

const SETTING_FIELDS = [
  {
    name: "signupBonusPoints",
    label: "Signup bonus",
    suffix: "points",
    help: "Credit when a customer joins loyalty.",
  },
  {
    name: "orderSpendAmount",
    label: "Order spend amount",
    help: "Spend threshold for order points.",
  },
  {
    name: "orderSpendPoints",
    label: "Order points",
    suffix: "points",
    help: "Credit for every spend threshold reached.",
  },
  {
    name: "refundSpendAmount",
    label: "Refund amount",
    help: "Refund threshold for reversing points.",
  },
  {
    name: "refundSpendPoints",
    label: "Refund points",
    suffix: "points",
    help: "Debit for every refund threshold reached.",
  },
];

const RULE_GROUPS = [
  {
    title: "Signup",
    description: "Points customers receive when they join loyalty.",
    fields: ["signupBonusPoints"],
  },
  {
    title: "Orders",
    description: "Points customers earn based on completed order spend.",
    fields: ["orderSpendAmount", "orderSpendPoints"],
  },
  {
    title: "Refunds",
    description: "Points removed when refunded spend should reverse rewards.",
    fields: ["refundSpendAmount", "refundSpendPoints"],
  },
];

function parsePositiveInteger(formData, fieldName) {
  const value = Number(formData.get(fieldName));

  if (!Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const { settings } = await getLoyaltySettings(session.shop);

  return Response.json({
    settings,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

  const values = {};
  const errors = {};

  for (const field of SETTING_FIELDS) {
    const value = parsePositiveInteger(formData, field.name);

    if (value === null) {
      errors[field.name] = "Enter a whole number greater than 0.";
    } else {
      values[field.name] = value;
    }
  }

  if (Object.keys(errors).length > 0) {
    return Response.json(
      {
        errors,
        values: Object.fromEntries(formData),
      },
      { status: 400 },
    );
  }

  const { shop } = await getLoyaltySettings(session.shop);

  const settings = await prisma.loyaltySetting.update({
    where: {
      shopId: shop.id,
    },
    data: values,
  });

  return Response.json({
    settings,
    saved: true,
  });
};

export default function LoyaltySettingsPage() {
  const { settings } = useLoaderData();

  const actionData = useActionData();

  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting";

  const currentSettings = actionData?.settings || settings;

  const values = actionData?.values || currentSettings;

  const errors = actionData?.errors || {};
  const fieldsByName = Object.fromEntries(
    SETTING_FIELDS.map((field) => [field.name, field]),
  );

  return (
    <s-page heading="Loyalty settings" inlineSize="full">
      {actionData?.saved ? (
        <s-banner tone="success">Settings saved successfully.</s-banner>
      ) : null}

      <s-section heading="Point rules">
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" justifyContent="space-between">
            <s-text>Control how customers earn and lose loyalty points.</s-text>
            <s-badge tone="success">Active</s-badge>
          </s-stack>

          <Form method="post">
            <s-stack gap="base">
              {RULE_GROUPS.map((group) => (
                <s-section heading={group.title} key={group.title}>
                  <s-stack gap="base">
                    <s-text type="small">{group.description}</s-text>

                    <s-grid
                      gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
                      gap="base"
                    >
                      {group.fields.map((fieldName) => {
                        const field = fieldsByName[fieldName];

                        return (
                          <s-grid-item key={field.name}>
                            <s-number-field
                              label={field.label}
                              name={field.name}
                              min="1"
                              step="1"
                              inputMode="numeric"
                              defaultValue={String(values[field.name] || "")}
                              suffix={field.suffix}
                              details={field.help}
                              error={errors[field.name] || undefined}
                              required
                            ></s-number-field>
                          </s-grid-item>
                        );
                      })}
                    </s-grid>
                  </s-stack>
                </s-section>
              ))}

              <s-stack direction="inline" justifyContent="end">
                <s-button
                  type="submit"
                  variant="primary"
                  loading={isSaving || undefined}
                >
                  Save settings
                </s-button>
              </s-stack>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>

      <s-box slot="aside">
        <s-section heading="Current rules">
          <s-stack gap="base">
            <s-text>Preview of the active earning logic.</s-text>

            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="small">
                <s-text type="small">Signup</s-text>
                <s-text type="strong">
                  {currentSettings.signupBonusPoints} points
                </s-text>
                <s-text type="small">
                  Credited when a customer joins loyalty.
                </s-text>
              </s-stack>
            </s-box>

            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="small">
                <s-text type="small">Orders</s-text>
                <s-text type="strong">
                  {currentSettings.orderSpendPoints} points /{" "}
                  {currentSettings.orderSpendAmount} spent
                </s-text>
                <s-text type="small">
                  Credited for every spend threshold reached.
                </s-text>
              </s-stack>
            </s-box>

            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack gap="small">
                <s-text type="small">Refunds</s-text>
                <s-text type="strong">
                  {currentSettings.refundSpendPoints} points /{" "}
                  {currentSettings.refundSpendAmount} refunded
                </s-text>
                <s-text type="small">
                  Removed for every refund threshold reached.
                </s-text>
              </s-stack>
            </s-box>
          </s-stack>
        </s-section>
      </s-box>
    </s-page>
  );
}