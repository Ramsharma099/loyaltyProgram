import { useLoaderData } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: {
      shopDomain: session.shop,
    },
    select: {
      id: true,
    },
  });

  if (!shop) {
    return Response.json({
      totalCustomers: 0,
      totalRewards: 0,
      totalPointsIssued: 0,
      totalRedeemed: 0,
      customers: [],
    });
  }

  const customerScope = { shopId: shop.id };
  const transactionScope = {
    customer: customerScope,
  };
  const [
    totalCustomers,
    totalRewards,
    issuedAggregate,
    redeemedAggregate,
    customers,
  ] = await Promise.all([
    prisma.customer.count({ where: customerScope }),
    prisma.reward.count({ where: { customer: customerScope } }),
    prisma.pointTransaction.aggregate({
      where: { ...transactionScope, transactionType: "credit" },
      _sum: { points: true },
    }),
    prisma.pointTransaction.aggregate({
      where: { ...transactionScope, transactionType: "debit" },
      _sum: { points: true },
    }),
    prisma.customer.findMany({
      where: customerScope,
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    }),
  ]);
  const totalPointsIssued = issuedAggregate._sum.points || 0;
  const totalRedeemed = redeemedAggregate._sum.points || 0;

  return Response.json({
    totalCustomers,
    totalRewards,
    totalPointsIssued,
    totalRedeemed,
    customers,
  });
};

export default function Dashboard() {
  const {
    totalCustomers,
    totalRewards,
    totalPointsIssued,
    totalRedeemed,
    customers,
  } = useLoaderData();

  const formatter = new Intl.NumberFormat("en");

  const netPoints = totalPointsIssued - totalRedeemed;
  const redemptionRate =
    totalPointsIssued > 0
      ? Math.round((totalRedeemed / totalPointsIssued) * 100)
      : 0;
  const averageBalance =
    totalCustomers > 0 ? Math.round(netPoints / totalCustomers) : 0;

  const stats = [
    {
      label: "Customers",
      value: totalCustomers,
      detail: "Enrolled in loyalty",
      tone: "metric-info",
    },
    {
      label: "Points issued",
      value: totalPointsIssued,
      detail: "Credits earned by customers",
      tone: "metric-success",
    },
    {
      label: "Points redeemed",
      value: totalRedeemed,
      detail: "Debits used for rewards",
      tone: "metric-warning",
    },
    {
      label: "Rewards",
      value: totalRewards,
      detail: `${formatter.format(netPoints)} points outstanding`,
      tone: "metric-attention",
    },
  ];

  return (
    <s-page heading="Loyalty dashboard" inlineSize="large">
      <style>{dashboardStyles}</style>

      <div className="dashboard">
        <section className="hero-panel" aria-label="Program overview">
          <div>
            <span className="status-pill">Program active</span>
            <h2>Reward customers with every order</h2>
            <p>
              Track member growth, earned points, redemptions, and reward
              activity from one focused loyalty workspace.
            </p>
          </div>

          <div className="hero-actions">
            <s-button href="/app/settings" variant="primary">
              Configure points
            </s-button>
            <s-button href="/app/customers">View customers</s-button>
          </div>
        </section>

        <section className="health-panel" aria-label="Program health">
          <div className="panel-heading">
            <span>Program health</span>
            <span>{formatter.format(netPoints)} outstanding</span>
          </div>

          <div className="health-grid">
            <div>
              <span>Redemption rate</span>
              <strong>{redemptionRate}%</strong>
            </div>
            <div>
              <span>Avg. balance</span>
              <strong>{formatter.format(averageBalance)}</strong>
            </div>
          </div>
        </section>

        <section className="metrics-grid" aria-label="Loyalty metrics">
          {stats.map((stat) => (
            <article className="metric-card" key={stat.label}>
              <div className={`metric-icon ${stat.tone}`} aria-hidden="true" />
              <div>
                <span>{stat.label}</span>
                <strong>{formatter.format(stat.value)}</strong>
                <p>{stat.detail}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="table-panel" aria-labelledby="recent-customers">
          <div className="table-header">
            <div>
              <h2 id="recent-customers">Recent customers</h2>
              <p>{formatter.format(customers.length)} latest loyalty members</p>
            </div>
            <s-button href="/app/customers">View all customers</s-button>
          </div>

          {customers.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Email</th>
                    <th className="numeric">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name || "Unnamed customer"}</td>
                      <td>{customer.email || "No email"}</td>
                      <td className="numeric">
                        <span className="points-pill">
                          {formatter.format(customer.loyaltyPoints)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <h3>No loyalty customers yet</h3>
              <p>New customers will appear here after they earn points.</p>
            </div>
          )}
        </section>
      </div>
    </s-page>
  );
}

const dashboardStyles = `
  .dashboard {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.8fr);
    gap: 16px;
    padding-block-end: 24px;
  }

  .hero-panel,
  .health-panel,
  .metric-card,
  .table-panel {
    background: #ffffff;
    border: 1px solid #dcdfe4;
    border-radius: 8px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
  }

  .hero-panel {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding: 24px;
  }

  .hero-panel h2,
  .table-header h2,
  .empty-state h3 {
    margin: 0;
    color: #202223;
    font-size: 20px;
    line-height: 28px;
    font-weight: 650;
  }

  .hero-panel p,
  .table-header p,
  .empty-state p,
  .metric-card p {
    margin: 4px 0 0;
    color: #616a75;
    font-size: 13px;
    line-height: 20px;
  }

  .status-pill,
  .points-pill {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    border-radius: 999px;
    font-size: 12px;
    line-height: 16px;
    font-weight: 650;
  }

  .status-pill {
    margin-block-end: 12px;
    padding: 3px 8px;
    color: #0c5132;
    background: #d1f7e6;
  }

  .hero-actions {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex-wrap: wrap;
  }

  .health-panel {
    padding: 20px;
  }

  .panel-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: #616a75;
    font-size: 13px;
    line-height: 20px;
  }

  .health-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-block-start: 16px;
  }

  .health-grid div {
    border-radius: 8px;
    background: #f6f6f7;
    padding: 14px;
  }

  .health-grid span,
  .metric-card span {
    display: block;
    color: #616a75;
    font-size: 12px;
    line-height: 16px;
    font-weight: 550;
  }

  .health-grid strong,
  .metric-card strong {
    display: block;
    margin-block-start: 6px;
    color: #202223;
    font-size: 24px;
    line-height: 32px;
    font-weight: 700;
  }

  .metrics-grid {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }

  .metric-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    padding: 18px;
    min-block-size: 132px;
  }

  .metric-icon {
    width: 10px;
    height: 44px;
    border-radius: 999px;
    background: #8a8f98;
  }

  .metric-info {
    background: #91d0ff;
  }

  .metric-success {
    background: #4fd18b;
  }

  .metric-warning {
    background: #ffc453;
  }

  .metric-attention {
    background: #a6a6ff;
  }

  .table-panel {
    grid-column: 1 / -1;
    overflow: hidden;
  }

  .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 18px 20px;
    border-block-end: 1px solid #e3e5e7;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .dashboard table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    line-height: 20px;
  }

  .dashboard th,
  .dashboard td {
    padding: 12px 20px;
    border-block-end: 1px solid #eceff1;
    color: #202223;
    text-align: start;
  }

  .dashboard th {
    color: #616a75;
    background: #f6f6f7;
    font-weight: 650;
  }

  .dashboard tbody tr:hover {
    background: #fafafa;
  }

  .numeric {
    text-align: end;
  }

  .points-pill {
    justify-content: center;
    min-width: 36px;
    padding: 3px 8px;
    color: #0c5132;
    background: #d1f7e6;
  }

  .empty-state {
    padding: 28px 20px;
  }

  @media (max-width: 900px) {
    .dashboard {
      grid-template-columns: 1fr;
    }

    .metrics-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    .hero-panel,
    .table-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .health-grid,
    .metrics-grid {
      grid-template-columns: 1fr;
    }

    .dashboard th,
    .dashboard td {
      padding-inline: 14px;
    }
  }
`;
