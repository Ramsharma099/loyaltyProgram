import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useState } from "react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  filterLoyaltySettingData,
  getLoyaltySettings,
} from "../services/loyalty-settings.server";
import {
  DEFAULT_LOYALTY_SETTINGS,
  normalizeRewardOptions,
} from "../services/loyalty-settings.shared";
import { INTEGRATION_OPTIONS } from "../services/integrations.shared";
import {
  canUseCheckoutIntegration,
  getEffectiveIntegration,
  syncShopPlan,
} from "../services/shop-plan.server";

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

function getEditableRewardRows(value) {
  const rewards = normalizeRewardOptions(value) || [];

  if (rewards.length === 0) {
    return [
      {
        points: "",
        discount: "",
      },
    ];
  }

  return rewards.map((reward) => ({
    points: String(reward.points),
    discount: String(reward.discount),
  }));
}

function getSubmittedRewardRows(formData) {
  const points = formData.getAll("rewardPoints");
  const discounts = formData.getAll("rewardDiscounts");
  const rowCount = Math.max(points.length, discounts.length);

  return Array.from({ length: rowCount }, (_, index) => ({
    points: String(points[index] || "").trim(),
    discount: String(discounts[index] || "").trim(),
  }));
}

function parseRewardRows(rows) {
  const rewards = [];
  const errors = {};

  rows.forEach((row, index) => {
    const hasPoints = row.points !== "";
    const hasDiscount = row.discount !== "";

    if (!hasPoints && !hasDiscount) {
      return;
    }

    const points = Number(row.points);
    const discount = Number(row.discount);

    if (!Number.isInteger(points) || points < 1) {
      errors[`rewardPoints.${index}`] = "Enter whole points greater than 0.";
    }

    if (!Number.isFinite(discount) || discount <= 0) {
      errors[`rewardDiscounts.${index}`] = "Enter a discount greater than 0.";
    }

    if (
      Number.isInteger(points) &&
      points > 0 &&
      Number.isFinite(discount) &&
      discount > 0
    ) {
      rewards.push({
        type: "discount",
        points,
        discount,
      });
    }
  });

  if (rewards.length === 0) {
    errors.redemptionRewards = "Add at least one discount reward.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors,
      rewards: null,
    };
  }

  return {
    errors,
    rewards: rewards.sort((a, b) => a.points - b.points),
  };
}

function parsePositiveInteger(formData, fieldName) {
  const value = Number(formData.get(fieldName));

  if (!Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}

function getSettingValue(values, fieldName) {
  return String(
    values?.[fieldName] ?? DEFAULT_LOYALTY_SETTINGS[fieldName] ?? "",
  );
}

function getBooleanSettingValue(values, fieldName) {
  const value = values?.[fieldName] ?? DEFAULT_LOYALTY_SETTINGS[fieldName];

  return value === true || value === "true";
}

function formatNumber(value) {
  return new Intl.NumberFormat("en").format(Number(value) || 0);
}

function getRewardSummary(rows) {
  const validRows = rows
    .map((row) => ({
      points: Number(row.points),
      discount: Number(row.discount),
    }))
    .filter(
      (row) =>
        Number.isInteger(row.points) &&
        row.points > 0 &&
        Number.isFinite(row.discount) &&
        row.discount > 0,
    )
    .sort((a, b) => a.points - b.points);

  const bestValueReward = validRows.reduce((best, row) => {
    if (!best) {
      return row;
    }

    const currentValue = row.discount / row.points;
    const bestValue = best.discount / best.points;

    return currentValue > bestValue ? row : best;
  }, null);

  return {
    validRows,
    bestValueReward,
    totalDiscountValue: validRows.reduce((sum, row) => sum + row.discount, 0),
  };
}

/* eslint-disable react/prop-types */
function DiscountRewardOptions({ errors, initialRows }) {
  const [rewardRows, setRewardRows] = useState(initialRows);
  const activeRewardCount = rewardRows.filter(
    (row) => row.points !== "" || row.discount !== "",
  ).length;
  const rewardSummary = getRewardSummary(rewardRows);

  const addRewardRow = () => {
    setRewardRows((rows) => [...rows, { points: "", discount: "" }]);
  };

  const updateRewardRow = (index, field, value) => {
    setRewardRows((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  };

  const deleteRewardRow = (index) => {
    setRewardRows((rows) => {
      const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);

      return nextRows.length > 0
        ? nextRows
        : [
            {
              points: "",
              discount: "",
            },
          ];
    });
  };

  return (
    <div className="reward-options">
      <div className="reward-options-heading">
        <div>
          <h3>Discount reward options</h3>
          <p>Add each reward tier customers can redeem with loyalty points.</p>
        </div>
        <div className="reward-options-action">
          <s-button type="button" variant="primary" onClick={addRewardRow}>
            Add tier
          </s-button>
        </div>
      </div>

      <div className="summary-strip">
        <div>
          <span>Configured tiers</span>
          <strong>{formatNumber(activeRewardCount)}</strong>
        </div>
        <div>
          <span>Best value</span>
          <strong>
            {rewardSummary.bestValueReward
              ? `${formatNumber(
                  rewardSummary.bestValueReward.points,
                )} points`
              : "Pending"}
          </strong>
          <small>
            {rewardSummary.bestValueReward
              ? `${rewardSummary.bestValueReward.discount} off`
              : "Complete a tier"}
          </small>
        </div>
        <div>
          <span>Total discount</span>
          <strong>{formatNumber(rewardSummary.totalDiscountValue)}</strong>
        </div>
      </div>

      <div className="reward-tier-grid">
        {rewardRows.map((reward, index) => (
          <div className="reward-tier-card" key={index}>
            <s-stack gap="small">
              <s-stack
                direction="inline"
                gap="base"
                justifyContent="space-between"
              >
                <s-text type="strong">Reward {index + 1}</s-text>
                <s-button
                  type="button"
                  tone="critical"
                  onClick={() => deleteRewardRow(index)}
                >
                  Remove
                </s-button>
              </s-stack>
              <s-number-field
                label="Points required"
                name="rewardPoints"
                min="1"
                step="1"
                inputMode="numeric"
                value={reward.points}
                suffix="points"
                onInput={(event) =>
                  updateRewardRow(index, "points", event.target.value)
                }
                error={errors[`rewardPoints.${index}`] || undefined}
              ></s-number-field>
              <s-number-field
                label="Discount amount"
                name="rewardDiscounts"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={reward.discount}
                onInput={(event) =>
                  updateRewardRow(index, "discount", event.target.value)
                }
                error={errors[`rewardDiscounts.${index}`] || undefined}
              ></s-number-field>
            </s-stack>
          </div>
        ))}
      </div>
    </div>
  );
}

/* eslint-enable react/prop-types */

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const planShop = await syncShopPlan(session.shop, admin);
  const { settings } = await getLoyaltySettings(session.shop);
  const checkoutAvailable = canUseCheckoutIntegration(planShop);

  return Response.json({
    settings,
    shopPlan: {
      name: planShop.shopifyPlanName || "Unknown",
      isShopifyPlus: Boolean(planShop.isShopifyPlus),
      isPartnerDevelopment: Boolean(planShop.isPartnerDevelopment),
      checkoutAvailable,
      effectiveIntegration: getEffectiveIntegration(planShop, settings),
    },
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const formData = await request.formData();

  const values = {};
  const errors = {};
  const planShop = await syncShopPlan(session.shop, admin);
  const checkoutAvailable = canUseCheckoutIntegration(planShop);

  for (const field of SETTING_FIELDS) {
    const value = parsePositiveInteger(formData, field.name);

    if (value === null) {
      errors[field.name] = "Enter a whole number greater than 0.";
    } else {
      values[field.name] = value;
    }
  }

  const rewardRows = getSubmittedRewardRows(formData);
  const parsedRewards = parseRewardRows(rewardRows);
  values.preferredIntegration = checkoutAvailable
    ? INTEGRATION_OPTIONS.CHECKOUT
    : INTEGRATION_OPTIONS.THEME;
  values.checkoutRedemptionEnabled = formData
    .getAll("checkoutRedemptionEnabled")
    .includes("true");

  if (!parsedRewards.rewards) {
    Object.assign(errors, parsedRewards.errors);
  } else {
    values.redemptionRewards = JSON.stringify(parsedRewards.rewards);
  }

  if (Object.keys(errors).length > 0) {
    return Response.json(
      {
        errors,
        values: {
          ...Object.fromEntries(formData),
          checkoutRedemptionEnabled: values.checkoutRedemptionEnabled,
          preferredIntegration: values.preferredIntegration,
          rewardRows,
        },
        shopPlan: {
          name: planShop.shopifyPlanName || "Unknown",
          isShopifyPlus: Boolean(planShop.isShopifyPlus),
          isPartnerDevelopment: Boolean(planShop.isPartnerDevelopment),
          checkoutAvailable,
          effectiveIntegration: getEffectiveIntegration(planShop, values),
        },
      },
      { status: 400 },
    );
  }

  const { shop } = await getLoyaltySettings(session.shop);

  const settings = await prisma.loyaltySetting.update({
    where: {
      shopId: shop.id,
    },
    data: filterLoyaltySettingData(values),
  });

  return Response.json({
    settings,
    saved: true,
    shopPlan: {
      name: planShop.shopifyPlanName || "Unknown",
      isShopifyPlus: Boolean(planShop.isShopifyPlus),
      isPartnerDevelopment: Boolean(planShop.isPartnerDevelopment),
      checkoutAvailable,
      effectiveIntegration: getEffectiveIntegration(planShop, settings),
    },
  });
};

export default function LoyaltySettingsPage() {
  const { settings, shopPlan } = useLoaderData();

  const actionData = useActionData();

  const navigation = useNavigation();

  const isSaving = navigation.state === "submitting";

  const currentSettings = actionData?.settings || settings;

  const values = actionData?.values || currentSettings;
  const currentShopPlan = actionData?.shopPlan || shopPlan;

  const errors = actionData?.errors || {};
  const effectiveIntegration =
    currentShopPlan?.effectiveIntegration || INTEGRATION_OPTIONS.THEME;
  const rewardOptions =
    normalizeRewardOptions(values.redemptionRewards) ||
    normalizeRewardOptions(currentSettings.redemptionRewards) ||
    [];
  const rewardRows =
    values.rewardRows ||
    getEditableRewardRows(currentSettings.redemptionRewards);
  const fieldsByName = Object.fromEntries(
    SETTING_FIELDS.map((field) => [field.name, field]),
  );
  const redemptionEnabled = getBooleanSettingValue(
    values,
    "checkoutRedemptionEnabled",
  );
  const firstReward = rewardOptions[0];
  const sampleOrderPoints =
    Math.floor(250 / currentSettings.orderSpendAmount) *
    currentSettings.orderSpendPoints;
  const integrationLabel =
    effectiveIntegration === INTEGRATION_OPTIONS.CHECKOUT
      ? "Checkout"
      : "Theme";
  const rules = [
    {
      label: "Signup",
      value: `${formatNumber(currentSettings.signupBonusPoints)} points`,
      description: "Credited when a customer joins loyalty.",
      marker: "earn",
    },
    {
      label: "Orders",
      value: `${formatNumber(currentSettings.orderSpendPoints)} points / ${formatNumber(
        currentSettings.orderSpendAmount,
      )} spent`,
      description: "Credited for every spend threshold reached.",
      marker: "earn",
    },
    {
      label: "Refunds",
      value: `${formatNumber(currentSettings.refundSpendPoints)} points / ${formatNumber(
        currentSettings.refundSpendAmount,
      )} refunded`,
      description: "Removed for every refund threshold reached.",
      marker: "refund",
    },
    {
      label: "Redemptions",
      value:
        effectiveIntegration === INTEGRATION_OPTIONS.CHECKOUT
          ? "Checkout extension"
          : "Theme app extension",
      description: `Rewards redemption ${
        (currentSettings.checkoutRedemptionEnabled ??
        DEFAULT_LOYALTY_SETTINGS.checkoutRedemptionEnabled)
          ? "enabled"
          : "disabled"
      }.`,
      marker: redemptionEnabled ? "earn" : "paused",
    },
  ];

  return (
    <s-page heading="Loyalty settings" inlineSize="full">
      <style>{settingsStyles}</style>

      {actionData?.saved ? (
        <s-banner tone="success">Settings saved successfully.</s-banner>
      ) : null}

      <section className="settings-hero" aria-label="Settings summary">
        <div>
          <span className="status-pill">
            {redemptionEnabled ? "Rewards active" : "Rewards paused"}
          </span>
          <h2>Shape how points are earned, reversed, and redeemed</h2>
          <p>
            Tune the loyalty rules customers experience across signup, orders,
            refunds, and reward redemptions.
          </p>
        </div>

        <div className="hero-summary">
          <div>
            <span>Shop plan</span>
            <strong>{currentShopPlan?.name || "Unknown"}</strong>
          </div>
          <div>
            <span>Active channel</span>
            <strong>{integrationLabel}</strong>
          </div>
          <div>
            <span>Reward tiers</span>
            <strong>{formatNumber(rewardOptions.length)}</strong>
          </div>
        </div>
      </section>

      <div className="settings-layout">
        <div className="settings-main-column">
          <section
            className="settings-panel"
            aria-labelledby="point-rules-title"
          >
            <div className="settings-panel-header">
              <div>
                <h2 id="point-rules-title">Point rules</h2>
                <p>Control how customers earn and lose loyalty points.</p>
              </div>
              <s-badge tone={redemptionEnabled ? "success" : "warning"}>
                {redemptionEnabled ? "Redemption on" : "Redemption off"}
              </s-badge>
            </div>

            <Form method="post">
              <s-stack gap="base">
                {RULE_GROUPS.map((group) => (
                  <section className="rule-section" key={group.title}>
                    <div className="rule-section-header">
                      <div>
                        <h3>{group.title}</h3>
                        <p>{group.description}</p>
                      </div>
                    </div>

                    <div className="rule-field-grid">
                      {group.fields.map((fieldName) => {
                        const field = fieldsByName[fieldName];

                        return (
                          <div className="rule-field" key={field.name}>
                            <s-number-field
                              label={field.label}
                              name={field.name}
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={getSettingValue(values, field.name)}
                              suffix={field.suffix}
                              details={field.help}
                              error={errors[field.name] || undefined}
                              required
                            ></s-number-field>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}

                <section className="rule-section">
                  <s-stack gap="base">
                    <div className="rule-section-header">
                      <div>
                        <h3>Redemption rewards</h3>
                        <p>
                          Configure reward redemption availability and discount
                          tiers.
                        </p>
                      </div>
                    </div>

                    <div className="redemption-toggle">
                      <input
                        id="checkoutRedemptionEnabled"
                        type="checkbox"
                        name="checkoutRedemptionEnabled"
                        value="true"
                        defaultChecked={redemptionEnabled}
                      />
                      <div>
                        <label htmlFor="checkoutRedemptionEnabled">
                          Allow rewards redemption
                        </label>
                        <p>
                          Customers can redeem rewards wherever the app is
                          available for their store plan.
                        </p>
                      </div>
                      <span>{redemptionEnabled ? "On" : "Off"}</span>
                    </div>

                    <DiscountRewardOptions
                      key={JSON.stringify(rewardRows)}
                      errors={errors}
                      initialRows={rewardRows}
                    />

                    {errors.redemptionRewards ? (
                      <s-text tone="critical">
                        {errors.redemptionRewards}
                      </s-text>
                    ) : (
                      <s-text type="small">
                        Complete both fields in a row before saving. Empty rows
                        are ignored.
                      </s-text>
                    )}
                  </s-stack>
                </section>

                <div className="settings-actions">
                  <s-button
                    type="submit"
                    variant="primary"
                    loading={isSaving || undefined}
                  >
                    Save settings
                  </s-button>
                </div>
              </s-stack>
            </Form>
          </section>
        </div>

        <div className="settings-side-column">
          <section
            className="settings-panel overview-panel"
            aria-labelledby="program-overview-title"
          >
            <div className="settings-panel-header">
              <div>
                <h2 id="program-overview-title">Program overview</h2>
                <p>Snapshot of the active loyalty experience.</p>
              </div>
              <s-badge tone={redemptionEnabled ? "success" : "warning"}>
                {redemptionEnabled ? "Rewards visible" : "Rewards paused"}
              </s-badge>
            </div>

            <div className="overview-grid">
              <div>
                <span>Signup offer</span>
                <strong>
                  {formatNumber(currentSettings.signupBonusPoints)} points
                </strong>
              </div>
              <div>
                <span>Earn rate</span>
                <strong>
                  {formatNumber(currentSettings.orderSpendPoints)} /{" "}
                  {formatNumber(currentSettings.orderSpendAmount)} spent
                </strong>
              </div>
              <div>
                <span>Reward tiers</span>
                <strong>{formatNumber(rewardOptions.length)}</strong>
              </div>
              <div>
                <span>Active channel</span>
                <strong>{integrationLabel}</strong>
              </div>
            </div>
          </section>

          <section
            className="settings-panel"
            aria-labelledby="current-rules-title"
          >
            <div className="settings-panel-header">
              <div>
                <h2 id="current-rules-title">Current rules</h2>
                <p>Preview of the active earning logic.</p>
              </div>
            </div>

            <div className="rule-timeline">
              {rules.map((rule) => (
                <div className="timeline-item" key={rule.label}>
                  <span
                    className={`timeline-marker timeline-marker-${rule.marker}`}
                    aria-hidden="true"
                  />
                  <div>
                    <span>{rule.label}</span>
                    <strong>{rule.value}</strong>
                    <p>{rule.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {rewardOptions.length > 0 ? (
              <div className="reward-list" aria-label="Reward tiers">
                {rewardOptions.map((reward) => (
                  <div key={reward.points}>
                    <span>{formatNumber(reward.points)} points</span>
                    <strong>{reward.discount} discount</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section
            className="settings-panel preview-panel"
            aria-labelledby="customer-preview-title"
          >
            <div className="settings-panel-header">
              <div>
                <h2 id="customer-preview-title">Customer preview</h2>
                <p>
                  How the active settings read in the storefront experience.
                </p>
              </div>
            </div>

            <div className="customer-preview">
              <div className="preview-balance">
                <span>Available points</span>
                <strong>
                  {formatNumber(
                    currentSettings.signupBonusPoints + sampleOrderPoints,
                  )}
                </strong>
                <p>
                  Example customer after signup and a 250 order earns{" "}
                  {formatNumber(sampleOrderPoints)} order points.
                </p>
              </div>

              <div className="preview-reward">
                <span>Next reward</span>
                <strong>
                  {firstReward
                    ? `${formatNumber(firstReward.points)} points`
                    : "No reward"}
                </strong>
                <p>
                  {firstReward
                    ? `Redeem for ${firstReward.discount} discount.`
                    : "Add a reward tier to show redemption options."}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </s-page>
  );
}

const settingsStyles = `
  .settings-hero,
  .settings-hero *,
  .settings-layout,
  .settings-layout * {
    box-sizing: border-box;
  }

  .settings-hero,
  .settings-panel {
    background: #ffffff;
    border: 1px solid #dcdfe4;
    border-radius: 8px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
    width: 100%;
  }

  .settings-hero {
    align-items: start;
    display: grid;
    gap: 20px;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 0.72fr);
    margin-block-end: 16px;
    overflow: hidden;
    padding: 24px;
    position: relative;
  }

  .settings-hero::before {
    background: #008060;
    content: "";
    inset: 0 auto 0 0;
    position: absolute;
    width: 4px;
  }

  .settings-hero h2 {
    color: #202223;
    font-size: 22px;
    font-weight: 650;
    line-height: 30px;
    margin: 0;
    max-width: 640px;
  }

  .settings-hero p {
    color: #616a75;
    font-size: 13px;
    line-height: 20px;
    margin: 8px 0 0;
    max-width: 640px;
  }

  .status-pill {
    align-items: center;
    background: #d1f7e6;
    border-radius: 999px;
    color: #0c5132;
    display: inline-flex;
    font-size: 12px;
    font-weight: 650;
    line-height: 16px;
    margin-block-end: 12px;
    padding: 3px 8px;
    width: fit-content;
  }

  .hero-summary {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .hero-summary > div,
  .overview-grid > div,
  .preview-balance,
  .preview-reward,
  .reward-tier-card,
  .redemption-toggle,
  .rule-section,
  .reward-list > div {
    background: #f7f8fa;
    border: 1px solid #e3e5e8;
    border-radius: 8px;
  }

  .hero-summary > div {
    min-width: 0;
    padding: 12px;
  }

  .hero-summary span,
  .overview-grid span,
  .summary-strip span,
  .preview-balance span,
  .preview-reward span,
  .timeline-item span,
  .reward-list span {
    color: #616a75;
    display: block;
    font-size: 12px;
    font-weight: 650;
    line-height: 16px;
  }

  .hero-summary strong,
  .overview-grid strong,
  .preview-balance strong,
  .preview-reward strong {
    color: #202223;
    display: block;
    font-size: 18px;
    line-height: 24px;
    margin-block-start: 4px;
    overflow-wrap: anywhere;
  }

  .settings-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
    align-items: start;
    gap: 16px;
    padding-block-end: 24px;
    width: 100%;
  }

  .settings-main-column,
  .settings-side-column {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .settings-panel {
    padding: 16px;
  }

  .settings-panel-header {
    align-items: start;
    display: flex;
    gap: 16px;
    justify-content: space-between;
    margin-block-end: 16px;
  }

  .settings-panel-header h2 {
    color: #202223;
    font-size: 16px;
    font-weight: 650;
    line-height: 24px;
    margin: 0;
  }

  .settings-panel-header p {
    color: #303030;
    font-size: 13px;
    line-height: 20px;
    margin: 4px 0 0;
  }

  .rule-section {
    padding: 16px;
  }

  .rule-section-header,
  .reward-options-heading {
    align-items: start;
    display: flex;
    gap: 12px;
  }

  .rule-section-header {
    justify-content: flex-start;
    margin-block-end: 14px;
  }

  .reward-options-heading {
    justify-content: space-between;
  }

  .rule-section h3,
  .reward-options h3 {
    color: #202223;
    font-size: 14px;
    font-weight: 650;
    line-height: 20px;
    margin: 0;
  }

  .rule-section p,
  .reward-options p,
  .redemption-toggle p {
    color: #616a75;
    font-size: 13px;
    line-height: 20px;
    margin: 4px 0 0;
  }

  .rule-field-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .rule-field {
    min-width: 0;
  }

  .redemption-toggle {
    align-items: start;
    display: grid;
    gap: 12px;
    grid-template-columns: auto minmax(0, 1fr) auto;
    padding: 14px;
  }

  .redemption-toggle input {
    accent-color: #008060;
    height: 18px;
    margin-block-start: 2px;
    width: 18px;
  }

  .redemption-toggle label {
    color: #202223;
    display: block;
    font-weight: 650;
    line-height: 20px;
  }

  .redemption-toggle > span {
    background: #ffffff;
    border: 1px solid #dcdfe4;
    border-radius: 999px;
    color: #303030;
    font-size: 12px;
    font-weight: 650;
    line-height: 16px;
    padding: 3px 8px;
    white-space: nowrap;
  }

  .reward-options {
    display: grid;
    gap: 12px;
  }

  .reward-options-action {
    flex: 0 0 auto;
  }

  .summary-strip,
  .reward-tier-grid,
  .overview-grid,
  .customer-preview,
  .reward-list {
    display: grid;
    gap: 12px;
  }

  .summary-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-strip > div {
    background: #f6faf8;
    border: 1px solid #d2eadf;
    border-radius: 8px;
    min-width: 0;
    padding: 12px;
  }

  .summary-strip strong {
    color: #0c5132;
    display: block;
    font-size: 16px;
    line-height: 22px;
    margin-block-start: 4px;
    overflow-wrap: anywhere;
  }

  .summary-strip small {
    color: #616a75;
    display: block;
    font-size: 12px;
    line-height: 16px;
    margin-block-start: 2px;
  }

  .reward-tier-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }

  .reward-tier-card {
    padding: 14px;
  }

  .settings-actions {
    align-items: center;
    display: flex;
    justify-content: flex-end;
    padding-block-start: 4px;
  }

  .overview-grid,
  .customer-preview {
    grid-template-columns: 1fr;
  }

  .overview-grid > div,
  .preview-balance,
  .preview-reward {
    padding: 12px;
  }

  .preview-balance p,
  .preview-reward p,
  .timeline-item p {
    color: #616a75;
    font-size: 13px;
    line-height: 20px;
    margin: 4px 0 0;
  }

  .rule-timeline {
    display: grid;
    gap: 12px;
  }

  .timeline-item {
    display: grid;
    gap: 10px;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .timeline-marker {
    border-radius: 999px;
    display: block;
    height: 10px;
    margin-block-start: 5px;
    width: 10px;
  }

  .timeline-marker-earn {
    background: #008060;
  }

  .timeline-marker-refund {
    background: #b98900;
  }

  .timeline-marker-paused {
    background: #8c9196;
  }

  .timeline-item strong {
    color: #202223;
    display: block;
    font-size: 14px;
    line-height: 20px;
    margin-block-start: 2px;
    overflow-wrap: anywhere;
  }

  .reward-list {
    margin-block-start: 14px;
  }

  .reward-list > div {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 10px 12px;
  }

  .reward-list strong {
    color: #202223;
    font-size: 13px;
    line-height: 20px;
    text-align: end;
  }

  @media (max-width: 1120px) {
    .settings-hero,
    .settings-layout {
      grid-template-columns: 1fr;
    }

    .hero-summary,
    .summary-strip {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 1121px) {
    .settings-side-column {
      position: sticky;
      top: 16px;
    }
  }

  @media (max-width: 640px) {
    .settings-hero,
    .settings-panel,
    .rule-section {
      padding: 14px;
    }

    .reward-options-heading,
    .settings-panel-header {
      display: grid;
    }

    .reward-options-action {
      width: fit-content;
    }

    .redemption-toggle {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .redemption-toggle > span {
      grid-column: 2;
      width: fit-content;
    }
  }
`;
