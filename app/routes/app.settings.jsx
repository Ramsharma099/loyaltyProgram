import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
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

  return (
    <s-page heading="Loyalty settings">
      <style>{`
        .settingsLayout {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr) 320px;
        }

        .settingsPanel,
        .formulaPanel {
          background: #ffffff;
          border: 1px solid #dcdfe4;
          border-radius: 8px;
          box-shadow: 0 1px 0 rgba(26, 26, 26, 0.04);
        }

        .settingsPanel {
          padding: 16px;
        }

        .fieldGrid {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .field {
          display: grid;
          gap: 6px;
        }

        .labelRow {
          align-items: center;
          color: #202223;
          display: flex;
          font-size: 13px;
          font-weight: 650;
          justify-content: space-between;
          line-height: 20px;
        }

        .inputWrap {
          align-items: center;
          border: 1px solid #8c9196;
          border-radius: 8px;
          display: flex;
          min-height: 40px;
          overflow: hidden;
        }

        .inputAffix {
          background: #f6f6f7;
          color: #616a75;
          font-size: 13px;
          line-height: 20px;
          padding: 10px 12px;
          white-space: nowrap;
        }

        .inputWrap input {
          border: 0;
          color: #202223;
          flex: 1;
          font: inherit;
          min-width: 0;
          outline: 0;
          padding: 10px 12px;
        }

        .helpText,
        .errorText,
        .formulaText {
          font-size: 13px;
          line-height: 20px;
        }

        .helpText,
        .formulaText {
          color: #616a75;
        }

        .errorText {
          color: #d72c0d;
        }

        .formActions {
          align-items: center;
          border-top: 1px solid #ebedf0;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 16px;
          padding-top: 16px;
        }

        .saveButton {
          background: #008060;
          border: 1px solid #008060;
          border-radius: 8px;
          color: #ffffff;
          cursor: pointer;
          font-weight: 650;
          min-height: 40px;
          padding: 8px 16px;
        }

        .saveButton:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .savedMessage {
          color: #008060;
          font-size: 13px;
          line-height: 20px;
        }

        .formulaPanel {
          display: grid;
          gap: 12px;
          padding: 16px;
        }

        .formulaTitle {
          color: #202223;
          font-size: 16px;
          font-weight: 650;
          line-height: 24px;
          margin: 0;
        }

        .formulaItem {
          border-top: 1px solid #ebedf0;
          display: grid;
          gap: 4px;
          padding-top: 12px;
        }

        @media (max-width: 900px) {
          .settingsLayout {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .fieldGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <s-section>
        <div className="settingsLayout">
          <Form method="post" className="settingsPanel">
            <div className="fieldGrid">
              {SETTING_FIELDS.map((field) => (
                <label className="field" key={field.name}>
                  <span className="labelRow">
                    <span>{field.label}</span>
                  </span>
                  <span className="inputWrap">
                    {field.prefix ? (
                      <span className="inputAffix">{field.prefix}</span>
                    ) : null}
                    <input
                      aria-invalid={Boolean(errors[field.name])}
                      defaultValue={values[field.name]}
                      min="1"
                      name={field.name}
                      type="number"
                    />
                    {field.suffix ? (
                      <span className="inputAffix">{field.suffix}</span>
                    ) : null}
                  </span>
                  {errors[field.name] ? (
                    <span className="errorText">{errors[field.name]}</span>
                  ) : (
                    <span className="helpText">{field.help}</span>
                  )}
                </label>
              ))}
            </div>

            <div className="formActions">
              {actionData?.saved ? (
                <span className="savedMessage">Settings saved</span>
              ) : null}
              <button className="saveButton" disabled={isSaving} type="submit">
                {isSaving ? "Saving" : "Save settings"}
              </button>
            </div>
          </Form>

          <aside className="formulaPanel">
            <h2 className="formulaTitle">Current rules</h2>
            <div className="formulaItem">
              <strong>Signup</strong>
              <span className="formulaText">
                Customers receive {currentSettings.signupBonusPoints} points.
              </span>
            </div>
            <div className="formulaItem">
              <strong>Orders</strong>
              <span className="formulaText">
                Customers receive {currentSettings.orderSpendPoints} points for
                every {currentSettings.orderSpendAmount} spent.
              </span>
            </div>
            <div className="formulaItem">
              <strong>Refunds</strong>
              <span className="formulaText">
                Customers lose {currentSettings.refundSpendPoints} points for
                every {currentSettings.refundSpendAmount} refunded.
              </span>
            </div>
          </aside>
        </div>
      </s-section>
    </s-page>
  );
}
