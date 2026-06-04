import { useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const activityLabels = {
  discount_created: "Discount created",
  discount_applied: "Discount applied",
  discount_expired: "Discount expired",
  discount_failed: "Discount failed",
  points_refunded: "Points refunded",
};

const statusTone = {
  discount_created: "info",
  discount_applied: "success",
  discount_expired: "warning",
  discount_failed: "critical",
  points_refunded: "success",
};

const emptyTotals = {
  all: 0,
  created: 0,
  applied: 0,
  expired: 0,
  failed: 0,
  refunded: 0,
};

function getActivityLabel(activityType) {
  return activityLabels[activityType] || activityType || "Activity";
}

function getMetadataValue(metadata, key) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  return metadata[key] ?? null;
}

function getOrderNumericId(orderId) {
  const value = String(orderId || "");
  const match = value.match(/\/Order\/(\d+)/);

  if (match?.[1]) {
    return match[1];
  }

  return /^\d+$/.test(value) ? value : "";
}

function getOrderAdminUrl(shopDomain, orderId) {
  const numericId = getOrderNumericId(orderId);

  if (!shopDomain || !numericId) {
    return "";
  }

  return `https://${shopDomain}/admin/orders/${numericId}`;
}

async function runAdminGraphql(admin, query, variables) {
  const response = await admin.graphql(query, {
    variables,
  });
  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(JSON.stringify(result.errors));
  }

  return result.data;
}

function getOrderIdFromLog(item) {
  return item.reward?.orderId || getMetadataValue(item.metadata, "orderId");
}

async function loadOrderNameById(admin, orderIds) {
  const graphIds = Array.from(
    new Set(
      orderIds
        .map((orderId) => String(orderId || ""))
        .filter((orderId) => orderId.startsWith("gid://shopify/Order/")),
    ),
  );

  if (graphIds.length === 0) {
    return {};
  }

  const data = await runAdminGraphql(
    admin,
    `#graphql
      query LoyaltyOrderNames($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Order {
            id
            name
          }
        }
      }
    `,
    {
      ids: graphIds,
    },
  );

  return (data.nodes || []).reduce((names, order) => {
    if (order?.id && order?.name) {
      names[order.id] = order.name;
    }

    return names;
  }, {});
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: {
      shopDomain: session.shop,
    },
  });

  if (!shop) {
    return Response.json({
      history: [],
      totals: emptyTotals,
    });
  }

  if (!prisma.rewardActivityLog) {
    return Response.json({
      history: [],
      totals: emptyTotals,
      setupMessage:
        "Reward history is being prepared. Restart the app server after Prisma generate completes.",
    });
  }

  let history = [];

  try {
    history = await prisma.rewardActivityLog.findMany({
      where: {
        OR: [
          {
            customer: {
              shopId: shop.id,
            },
          },
          {
            reward: {
              customer: {
                shopId: shop.id,
              },
            },
          },
        ],
      },
      include: {
        customer: true,
        reward: {
          include: {
            customer: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 250,
    });
  } catch (error) {
    console.error("[history] Could not load reward activity logs", error);

    return Response.json({
      history: [],
      totals: emptyTotals,
      setupMessage:
        "Reward history database tables are not ready yet. Run Prisma migrations and refresh this page.",
    });
  }

  const totals = history.reduce(
    (counts, item) => {
      counts.all += 1;

      if (item.activityType === "discount_created") counts.created += 1;
      if (item.activityType === "discount_applied") counts.applied += 1;
      if (item.activityType === "discount_expired") counts.expired += 1;
      if (item.activityType === "discount_failed") counts.failed += 1;
      if (item.activityType === "points_refunded") counts.refunded += 1;

      return counts;
    },
    {
      all: 0,
      created: 0,
      applied: 0,
      expired: 0,
      failed: 0,
      refunded: 0,
    },
  );

  let orderNameById = {};

  try {
    orderNameById = await loadOrderNameById(
      admin,
      history.map((item) => getOrderIdFromLog(item)),
    );
  } catch (error) {
    console.error("[history] Could not load Shopify order names", error);
  }

  return Response.json({
    history,
    orderNameById,
    shopDomain: session.shop,
    totals,
  });
};

export default function HistoryPage() {
  const {
    history = [],
    orderNameById = {},
    shopDomain,
    totals,
    setupMessage,
  } = useLoaderData();
  const numberFormatter = new Intl.NumberFormat("en");
  const currencyFormatter = new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
  });

  const metrics = [
    ["All activity", totals.all],
    ["Created", totals.created],
    ["Applied", totals.applied],
    ["Expired", totals.expired],
    ["Failed", totals.failed],
    ["Points refunded", totals.refunded],
  ];

  return (
    <s-page heading="Reward history" inlineSize="large">
      <style>{historyStyles}</style>

      <div className="history-layout">
        <section className="metrics" aria-label="History totals">
          {metrics.map(([label, value]) => (
            <div className="metric" key={label}>
              <span>{label}</span>
              <strong>{numberFormatter.format(value)}</strong>
            </div>
          ))}
        </section>

        <section className="history-panel" aria-labelledby="activity-heading">
          <div className="panel-header">
            <div>
              <h2 id="activity-heading">Discount activity</h2>
              <p>
                Latest {numberFormatter.format(history.length)} history logs
              </p>
            </div>
          </div>

          {setupMessage ? (
            <div className="setup-notice">
              <strong>History setup needed</strong>
              <p>{setupMessage}</p>
            </div>
          ) : null}

          {history.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Customer</th>
                    <th>Discount code</th>
                    <th className="numeric">Points</th>
                    <th className="numeric">Amount</th>
                    <th>Order</th>
                    <th>Message</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => {
                    const customer = item.customer || item.reward?.customer;
                    const rewardCode =
                      item.rewardCode || item.reward?.rewardCode;
                    const points =
                      item.reward?.pointsUsed ||
                      getMetadataValue(item.metadata, "pointsUsed") ||
                      getMetadataValue(item.metadata, "pointsRefunded") ||
                      getMetadataValue(item.metadata, "pointsToRedeem");
                    const discountAmount =
                      item.reward?.discountAmount ||
                      getMetadataValue(item.metadata, "discountAmount");
                    const orderId = getOrderIdFromLog(item);
                    const orderName =
                      getMetadataValue(item.metadata, "orderName") ||
                      orderNameById[orderId] ||
                      orderId;
                    const orderAdminUrl =
                      getMetadataValue(item.metadata, "orderAdminUrl") ||
                      getOrderAdminUrl(shopDomain, orderId);

                    return (
                      <tr key={item.id}>
                        <td>
                          <span
                            className={`activity-pill ${
                              statusTone[item.activityType] || "neutral"
                            }`}
                          >
                            {getActivityLabel(item.activityType)}
                          </span>
                        </td>
                        <td>
                          <div className="customer">
                            <strong>
                              {customer?.name || "Unknown customer"}
                            </strong>
                            <span>{customer?.email || "No email"}</span>
                          </div>
                        </td>
                        <td>
                          <span className="code">{rewardCode || "-"}</span>
                        </td>
                        <td className="numeric">
                          {points ? numberFormatter.format(points) : "-"}
                        </td>
                        <td className="numeric">
                          {discountAmount
                            ? currencyFormatter.format(discountAmount)
                            : "-"}
                        </td>
                        <td>
                          {orderName && orderAdminUrl ? (
                            <a
                              className="order-link"
                              href={orderAdminUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {orderName}
                            </a>
                          ) : (
                            <span className="order">{orderName || "-"}</span>
                          )}
                        </td>
                        <td className="message">{item.message || "-"}</td>
                        <td>{new Date(item.createdAt).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <h3>No reward history yet</h3>
              <p>
                Discount creation, application, expiry, failure, and refund logs
                will appear here.
              </p>
            </div>
          )}
        </section>
      </div>
    </s-page>
  );
}

const historyStyles = `
  .history-layout {
    display: grid;
    gap: 16px;
    padding-block-end: 24px;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
  }

  .metric,
  .history-panel {
    background: #ffffff;
    border: 1px solid #dcdfe4;
    border-radius: 8px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
  }

  .metric {
    padding: 14px;
  }

  .metric span {
    display: block;
    color: #616a75;
    font-size: 12px;
    line-height: 16px;
  }

  .metric strong {
    display: block;
    margin-block-start: 4px;
    color: #202223;
    font-size: 22px;
    line-height: 28px;
    font-weight: 650;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 20px;
    border-bottom: 1px solid #e3e5e7;
  }

  .panel-header h2,
  .empty-state h3 {
    margin: 0;
    color: #202223;
    font-size: 18px;
    line-height: 24px;
    font-weight: 650;
  }

  .panel-header p,
  .empty-state p {
    margin: 4px 0 0;
    color: #616a75;
    font-size: 13px;
    line-height: 20px;
  }

  .table-scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 1120px;
  }

  th,
  td {
    padding: 12px 14px;
    border-bottom: 1px solid #eceff1;
    text-align: left;
    vertical-align: top;
    color: #202223;
    font-size: 13px;
    line-height: 20px;
  }

  th {
    background: #f6f7f8;
    color: #616a75;
    font-size: 12px;
    line-height: 16px;
    font-weight: 650;
    text-transform: uppercase;
  }

  .numeric {
    text-align: right;
    white-space: nowrap;
  }

  .activity-pill {
    display: inline-flex;
    align-items: center;
    width: max-content;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 16px;
    font-weight: 650;
  }

  .activity-pill.info {
    background: #e0f0ff;
    color: #00527c;
  }

  .activity-pill.success {
    background: #d1f7e6;
    color: #0c5132;
  }

  .activity-pill.warning {
    background: #fff1b8;
    color: #5c4100;
  }

  .activity-pill.critical {
    background: #fed3d1;
    color: #8e1f0b;
  }

  .activity-pill.neutral {
    background: #ebeef0;
    color: #4a4f55;
  }

  .customer strong,
  .customer span {
    display: block;
  }

  .customer span,
  .message,
  .order {
    color: #616a75;
  }

  .order-link {
    color: #005bd3;
    font-weight: 550;
    text-decoration: none;
    white-space: nowrap;
  }

  .order-link:hover {
    text-decoration: underline;
  }

  .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 12px;
    white-space: nowrap;
  }

  .message {
    max-width: 280px;
  }

  .empty-state {
    padding: 32px 20px;
  }

  .setup-notice {
    margin: 16px 20px 0;
    padding: 12px 14px;
    border: 1px solid #ffd79d;
    border-radius: 8px;
    background: #fff8e6;
    color: #5c4100;
  }

  .setup-notice strong {
    display: block;
    font-size: 13px;
    line-height: 20px;
    font-weight: 650;
  }

  .setup-notice p {
    margin: 2px 0 0;
    font-size: 13px;
    line-height: 20px;
  }

  @media (max-width: 900px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
