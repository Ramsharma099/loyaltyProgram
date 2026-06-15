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
  DEFAULT_GIFT_CARD_REWARD_OPTIONS,
  DEFAULT_LOYALTY_SETTINGS,
  getRewardTypePreferenceFromSettings,
  getRewardOptionsForPreference,
  normalizeRewardOptions,
  normalizeRewardTypePreference,
  serializeRewardSettings,
} from "../services/loyalty-settings.shared";
import { INTEGRATION_OPTIONS } from "../services/integrations.shared";
import {
  canUseCheckoutIntegration,
  getEffectiveIntegration,
  syncShopPlan,
} from "../services/shop-plan.server";
import { logError } from "../services/errors.server";

const SETTING_FIELDS = [
  {
    name: "signupBonusPoints",
    label: "Signup bonus",
    suffix: "points",
    help: "Credit when a customer joins loyalty.",
    description: "Points awarded to customers when they first join your loyalty program.",
  },
  {
    name: "orderSpendAmount",
    label: "Order spend amount",
    help: "Spend threshold for order points.",
    description: "The minimum order amount required for customers to earn order points. Points are awarded for each threshold reached.",
  },
  {
    name: "orderSpendPoints",
    label: "Order points",
    suffix: "points",
    help: "Credit for every spend threshold reached.",
    description: "Points earned by customers for each order spend threshold they reach.",
  },
  {
    name: "refundSpendAmount",
    label: "Refund amount",
    help: "Refund threshold for reversing points.",
    description: "The minimum refund amount that triggers point reversal. Points are deducted for each threshold reached.",
  },
  {
    name: "refundSpendPoints",
    label: "Refund points",
    suffix: "points",
    help: "Debit for every refund threshold reached.",
    description: "Points deducted from customers for each refund threshold they reach.",
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

const REWARD_TYPE_CHOICES = [
  {
    value: "gift_card",
    label: "Gift card rewards",
    description: "Customers redeem points for gift cards.",
  },
  {
    value: "discount",
    label: "Discount rewards",
    description: "Customers redeem points for discount codes.",
  },
  {
    value: "both",
    label: "Both",
    description: "Customers can choose gift cards or discounts.",
  },
];

const REWARD_FIELD_CONFIG = {
  discount: {
    amountKey: "discount",
    amountName: "discountRewardDiscounts",
    amountLabel: "Discount amount",
    amountErrorPrefix: "discountRewardDiscounts",
    amountSummaryLabel: "Total discount",
    defaultRows: [
      {
        points: "",
        discount: "",
      },
    ],
    emptyRow: {
      points: "",
      discount: "",
    },
    heading: "Discount reward options",
    pointsName: "discountRewardPoints",
    pointsErrorPrefix: "discountRewardPoints",
    rewardType: "discount",
    valueLabel: "discount",
  },
  gift_card: {
    amountKey: "amount",
    amountName: "giftCardRewardAmounts",
    amountLabel: "Gift card amount",
    amountErrorPrefix: "giftCardRewardAmounts",
    amountSummaryLabel: "Total gift card value",
    defaultRows: DEFAULT_GIFT_CARD_REWARD_OPTIONS.map((reward) => ({
      points: String(reward.points),
      amount: String(reward.amount),
    })),
    emptyRow: {
      points: "",
      amount: "",
    },
    heading: "Gift card reward options",
    pointsName: "giftCardRewardPoints",
    pointsErrorPrefix: "giftCardRewardPoints",
    rewardType: "gift_card",
    valueLabel: "gift card",
  },
};

function getEditableRewardRows(value, rewardType) {
  const rewards = normalizeRewardOptions(value) || [];
  const config = REWARD_FIELD_CONFIG[rewardType];
  const typedRewards = rewards.filter(
    (reward) => (reward.type || "discount") === rewardType,
  );

  if (typedRewards.length === 0) {
    return config.defaultRows;
  }

  return typedRewards.map((reward) => ({
    points: String(reward.points),
    [config.amountKey]: String(reward[config.amountKey]),
  }));
}

function getSubmittedRewardRows(formData, rewardType) {
  const config = REWARD_FIELD_CONFIG[rewardType];
  const points = formData.getAll(config.pointsName);
  const amounts = formData.getAll(config.amountName);
  const rowCount = Math.max(points.length, amounts.length);

  return Array.from({ length: rowCount }, (_, index) => ({
    points: String(points[index] || "").trim(),
    [config.amountKey]: String(amounts[index] || "").trim(),
  }));
}

function parseRewardRows(rows, rewardType, { requireRewards = true } = {}) {
  const config = REWARD_FIELD_CONFIG[rewardType];
  const rewards = [];
  const errors = {};

  rows.forEach((row, index) => {
    const hasPoints = row.points !== "";
    const hasAmount = row[config.amountKey] !== "";

    if (!hasPoints && !hasAmount) {
      return;
    }

    const points = Number(row.points);
    const amount = Number(row[config.amountKey]);

    if (!Number.isInteger(points) || points < 1) {
      errors[`${config.pointsErrorPrefix}.${index}`] =
        "Enter whole points greater than 0.";
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      errors[`${config.amountErrorPrefix}.${index}`] =
        rewardType === "gift_card"
          ? "Enter a gift card amount greater than 0."
          : "Enter a discount greater than 0.";
    }

    if (
      Number.isInteger(points) &&
      points > 0 &&
      Number.isFinite(amount) &&
      amount > 0
    ) {
      rewards.push({
        type: config.rewardType,
        points,
        [config.amountKey]: amount,
        ...(rewardType === "gift_card"
          ? {
              title: `$${amount} Gift Card`,
              description: `Redeem ${formatNumber(points)} points for a $${amount} gift card`,
            }
          : {}),
      });
    }
  });

  if (requireRewards && rewards.length === 0) {
    errors.redemptionRewards =
      rewardType === "gift_card"
        ? "Add at least one gift card reward."
        : "Add at least one discount reward.";
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

function getConfiguredRewardsByType(value, rewardType) {
  return (normalizeRewardOptions(value) || []).filter(
    (reward) => (reward.type || "discount") === rewardType,
  );
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

function getRewardTypePreferenceValue(values) {
  return normalizeRewardTypePreference(
    values?.rewardTypePreference ??
      getRewardTypePreferenceFromSettings(values?.redemptionRewards) ??
      "both",
  );
}

function formatNumber(value) {
  return new Intl.NumberFormat("en").format(Number(value) || 0);
}

function getRewardSummary(rows, rewardType) {
  const config = REWARD_FIELD_CONFIG[rewardType];
  const validRows = rows
    .map((row) => ({
      points: Number(row.points),
      amount: Number(row[config.amountKey]),
    }))
    .filter(
      (row) =>
        Number.isInteger(row.points) &&
        row.points > 0 &&
        Number.isFinite(row.amount) &&
        row.amount > 0,
    )
    .sort((a, b) => a.points - b.points);

  const bestValueReward = validRows.reduce((best, row) => {
    if (!best) {
      return row;
    }

    const currentValue = row.amount / row.points;
    const bestValue = best.amount / best.points;

    return currentValue > bestValue ? row : best;
  }, null);

  return {
    validRows,
    bestValueReward,
    totalRewardValue: validRows.reduce((sum, row) => sum + row.amount, 0),
  };
}

/* eslint-disable react/prop-types */

// InfoIcon component for field descriptions
function InfoIcon({ tooltip }) {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  return (
    <span
      className="info-icon-wrapper"
      onMouseEnter={() => setIsTooltipVisible(true)}
      onMouseLeave={() => setIsTooltipVisible(false)}
      onFocus={() => setIsTooltipVisible(true)}
      onBlur={() => setIsTooltipVisible(false)}
      role="tooltip"
      aria-label={tooltip}
    >
      <svg
        className="info-icon"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <text x="12" y="17" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor">i</text>
      </svg>
      {isTooltipVisible && (
        <div className="tooltip-popup">
          {tooltip}
        </div>
      )}
    </span>
  );
}

function RewardTierOptions({ errors, initialRows, rewardType }) {
  const config = REWARD_FIELD_CONFIG[rewardType];
  const [rewardRows, setRewardRows] = useState(initialRows);
  const activeRewardCount = rewardRows.filter(
    (row) => row.points !== "" || row[config.amountKey] !== "",
  ).length;
  const rewardSummary = getRewardSummary(rewardRows, rewardType);

  const addRewardRow = () => {
    setRewardRows((rows) => [...rows, { ...config.emptyRow }]);
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

      return nextRows.length > 0 ? nextRows : [{ ...config.emptyRow }];
    });
  };

  return (
    <div className="reward-options">
      <div className="reward-options-heading">
        <div>
          <h3>{config.heading}</h3>
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
              ? `${formatNumber(rewardSummary.bestValueReward.points)} points`
              : "Pending"}
          </strong>
          <small>
            {rewardSummary.bestValueReward
              ? `${rewardSummary.bestValueReward.amount} ${config.valueLabel}`
              : "Complete a tier"}
          </small>
        </div>
        <div>
          <span>{config.amountSummaryLabel}</span>
          <strong>{formatNumber(rewardSummary.totalRewardValue)}</strong>
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
                name={config.pointsName}
                min="1"
                step="1"
                inputMode="numeric"
                value={reward.points}
                suffix="points"
                onInput={(event) =>
                  updateRewardRow(index, "points", event.target.value)
                }
                error={
                  errors[`${config.pointsErrorPrefix}.${index}`] || undefined
                }
              ></s-number-field>
              <s-number-field
                label={config.amountLabel}
                name={config.amountName}
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={reward[config.amountKey]}
                onInput={(event) =>
                  updateRewardRow(index, config.amountKey, event.target.value)
                }
                error={
                  errors[`${config.amountErrorPrefix}.${index}`] || undefined
                }
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

  const discountRewardRows = getSubmittedRewardRows(formData, "discount");
  const giftCardRewardRows = getSubmittedRewardRows(formData, "gift_card");
  values.rewardTypePreference = normalizeRewardTypePreference(
    formData.get("rewardTypePreference"),
  );
  const requiresDiscountRewards = values.rewardTypePreference !== "gift_card";
  const requiresGiftCardRewards = values.rewardTypePreference !== "discount";
  const parsedDiscountRewards = parseRewardRows(
    discountRewardRows,
    "discount",
    {
      requireRewards: requiresDiscountRewards,
    },
  );
  const parsedGiftCardRewards = parseRewardRows(
    giftCardRewardRows,
    "gift_card",
    {
      requireRewards: requiresGiftCardRewards,
    },
  );
  values.preferredIntegration = checkoutAvailable
    ? INTEGRATION_OPTIONS.CHECKOUT
    : INTEGRATION_OPTIONS.THEME;
  values.checkoutRedemptionEnabled = formData
    .getAll("checkoutRedemptionEnabled")
    .includes("true");

  if (!parsedDiscountRewards.rewards || !parsedGiftCardRewards.rewards) {
    Object.assign(
      errors,
      parsedDiscountRewards.errors,
      parsedGiftCardRewards.errors,
    );
  } else {
    const currentRedemptionRewards =
      formData.get("currentRedemptionRewards") ||
      DEFAULT_LOYALTY_SETTINGS.redemptionRewards;
    const existingDiscountRewards = getConfiguredRewardsByType(
      currentRedemptionRewards,
      "discount",
    );
    const existingGiftCardRewards = getConfiguredRewardsByType(
      currentRedemptionRewards,
      "gift_card",
    );
    const discountRewards = requiresDiscountRewards
      ? parsedDiscountRewards.rewards
      : existingDiscountRewards;
    const giftCardRewards = requiresGiftCardRewards
      ? parsedGiftCardRewards.rewards
      : existingGiftCardRewards;

    values.redemptionRewards = serializeRewardSettings(
      [...discountRewards, ...giftCardRewards],
      values.rewardTypePreference,
    );
  }

  if (Object.keys(errors).length > 0) {
    return Response.json(
      {
        errors,
        values: {
          ...Object.fromEntries(formData),
          checkoutRedemptionEnabled: values.checkoutRedemptionEnabled,
          preferredIntegration: values.preferredIntegration,
          rewardTypePreference: values.rewardTypePreference,
          discountRewardRows,
          giftCardRewardRows,
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

  let settings;

  try {
    const { shop } = await getLoyaltySettings(session.shop);

    settings = await prisma.loyaltySetting.update({
      where: {
        shopId: shop.id,
      },
      data: filterLoyaltySettingData(values),
    });
  } catch (error) {
    logError("settings:save", error, { shop: session.shop });

    return Response.json(
      {
        errors: {
          form: "Could not save settings. Please try again.",
        },
        values: {
          ...values,
          discountRewardRows,
          giftCardRewardRows,
        },
        shopPlan: {
          name: planShop.shopifyPlanName || "Unknown",
          isShopifyPlus: Boolean(planShop.isShopifyPlus),
          isPartnerDevelopment: Boolean(planShop.isPartnerDevelopment),
          checkoutAvailable,
          effectiveIntegration: getEffectiveIntegration(planShop, values),
        },
      },
      { status: 500 },
    );
  }

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
  const discountRewardRows =
    values.discountRewardRows ||
    getEditableRewardRows(currentSettings.redemptionRewards, "discount");
  const giftCardRewardRows =
    values.giftCardRewardRows ||
    getEditableRewardRows(currentSettings.redemptionRewards, "gift_card");
  const fieldsByName = Object.fromEntries(
    SETTING_FIELDS.map((field) => [field.name, field]),
  );
  const redemptionEnabled = getBooleanSettingValue(
    values,
    "checkoutRedemptionEnabled",
  );
  const [selectedRewardTypePreference, setSelectedRewardTypePreference] =
    useState(() => getRewardTypePreferenceValue(values));
  const rewardTypePreference = selectedRewardTypePreference;
  const showDiscountRewards = rewardTypePreference !== "gift_card";
  const showGiftCardRewards = rewardTypePreference !== "discount";
  const visibleRewardOptions = getRewardOptionsForPreference(
    currentSettings.redemptionRewards,
    rewardTypePreference,
  );
  const firstReward = visibleRewardOptions[0];
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
    {
      label: "Reward type",
      value:
        REWARD_TYPE_CHOICES.find(
          (choice) => choice.value === rewardTypePreference,
        )?.label || "Both",
      description: "Controls which reward options customers can redeem.",
      marker: redemptionEnabled ? "earn" : "paused",
    },
  ];

  return (
    <s-page heading="Loyalty settings" inlineSize="full">
      <style>{settingsStyles}</style>

      {actionData?.saved ? (
        <s-banner tone="success">Settings saved successfully.</s-banner>
      ) : null}
      {errors.form ? <s-banner tone="critical">{errors.form}</s-banner> : null}

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
            <strong>{formatNumber(visibleRewardOptions.length)}</strong>
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
              <input
                type="hidden"
                name="currentRedemptionRewards"
                value={currentSettings.redemptionRewards}
              />
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
                            <div className="field-label-with-info">
                              <span>{field.label}</span>
                              <InfoIcon tooltip={field.description} />
                            </div>
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
                          Configure reward redemption availability, discount
                          tiers, and gift card tiers.
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

                    <div className="reward-type-options">
                      {REWARD_TYPE_CHOICES.map((choice) => (
                        <label
                          className="reward-type-option"
                          key={choice.value}
                          htmlFor={`rewardTypePreference-${choice.value}`}
                        >
                          <input
                            id={`rewardTypePreference-${choice.value}`}
                            type="radio"
                            name="rewardTypePreference"
                            value={choice.value}
                            aria-label={choice.label}
                            checked={rewardTypePreference === choice.value}
                            onChange={(event) =>
                              setSelectedRewardTypePreference(
                                normalizeRewardTypePreference(
                                  event.target.value,
                                ),
                              )
                            }
                          />
                          <span>
                            <strong>{choice.label}</strong>
                            <small>{choice.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>

                    {showDiscountRewards ? (
                      <RewardTierOptions
                        key={`discount-${JSON.stringify(discountRewardRows)}`}
                        errors={errors}
                        initialRows={discountRewardRows}
                        rewardType="discount"
                      />
                    ) : null}

                    {showGiftCardRewards ? (
                      <RewardTierOptions
                        key={`gift_card-${JSON.stringify(giftCardRewardRows)}`}
                        errors={errors}
                        initialRows={giftCardRewardRows}
                        rewardType="gift_card"
                      />
                    ) : null}

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
                <strong>{formatNumber(visibleRewardOptions.length)}</strong>
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

            {visibleRewardOptions.length > 0 ? (
              <div className="reward-list" aria-label="Reward tiers">
                {visibleRewardOptions.map((reward) => (
                  <div key={`${reward.type || "discount"}-${reward.points}`}>
                    <span>{formatNumber(reward.points)} points</span>
                    <strong>
                      {(reward.type || "discount") === "gift_card"
                        ? `${reward.amount} gift card`
                        : `${reward.discount} discount`}
                    </strong>
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
                  {firstReward &&
                  (firstReward.type || "discount") === "gift_card"
                    ? `Redeem for a ${firstReward.amount} gift card.`
                    : firstReward
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

  .reward-type-options {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .reward-type-option {
    align-items: start;
    background: #f7f8fa;
    border: 1px solid #e3e5e8;
    border-radius: 8px;
    cursor: pointer;
    display: grid;
    gap: 10px;
    grid-template-columns: auto minmax(0, 1fr);
    min-width: 0;
    padding: 14px;
  }

  .reward-type-option:has(input:checked) {
    background: #f6faf8;
    border-color: #008060;
  }

  .reward-type-option input {
    accent-color: #008060;
    height: 18px;
    margin-block-start: 1px;
    width: 18px;
  }

  .reward-type-option strong,
  .reward-type-option small {
    display: block;
  }

  .reward-type-option strong {
    color: #202223;
    font-size: 13px;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .reward-type-option small {
    color: #616a75;
    font-size: 12px;
    line-height: 16px;
    margin-block-start: 2px;
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
    .reward-type-options,
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

  /* Info Icon and Tooltip Styles */
  .info-icon-wrapper {
    display: inline-flex;
    align-items: center;
    position: relative;
    cursor: help;
    margin-left: 6px;
  }

  .info-icon {
    color: #616a75;
    flex-shrink: 0;
    transition: color 0.2s ease;
  }

  .info-icon-wrapper:hover .info-icon,
  .info-icon-wrapper:focus .info-icon {
    color: #008060;
  }

  .tooltip-popup {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: #202223;
    color: #ffffff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 16px;
    white-space: normal;
    max-width: 250px;
    z-index: 1000;
    margin-bottom: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    word-wrap: break-word;
    pointer-events: none;
  }

  .tooltip-popup::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: #202223;
  }

  .field-label-with-info {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
    font-weight: 650;
    color: #202223;
    font-size: 13px;
    line-height: 20px;
  }

`;
