import { useLoaderData } from "react-router";
import prisma from "../db.server";

export const loader = async () => {
  // total customers
  const totalCustomers = await prisma.customer.count();

  // total rewards
  const totalRewards = await prisma.reward.count();

  // all transactions
  const transactions = await prisma.pointTransaction.findMany();

  // total points issued
  const totalPointsIssued = transactions
    .filter((t) => t.transactionType === "credit")
    .reduce((sum, t) => sum + t.points, 0);

  // total redeemed
  const totalRedeemed = transactions
    .filter((t) => t.transactionType === "debit")
    .reduce((sum, t) => sum + t.points, 0);

  // latest customers
  const customers = await prisma.customer.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  });

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

  const stats = [
    {
      label: "Customers",
      value: totalCustomers,
      detail: "Enrolled in loyalty",
    },
    {
      label: "Points issued",
      value: totalPointsIssued,
      detail: "Credits earned by customers",
    },
    {
      label: "Points redeemed",
      value: totalRedeemed,
      detail: "Debits used for rewards",
    },
    {
      label: "Rewards",
      value: totalRewards,
      detail: `${formatter.format(netPoints)} points outstanding`,
    },
  ];

  return (
    <s-page heading="Loyalty dashboard">
      <style>{`
        .dashboardStack {
          display: grid;
          gap: 16px;
        }

        .summaryGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .summaryCard {
          background: #ffffff;
          border: 1px solid #dcdfe4;
          border-radius: 8px;
          box-shadow: 0 1px 0 rgba(26, 26, 26, 0.04);
          min-height: 132px;
          padding: 16px;
        }

        .summaryCardHeader {
          align-items: center;
          display: flex;
          gap: 8px;
          justify-content: space-between;
        }

        .summaryLabel,
        .tableMeta,
        .customerEmail {
          color: #616a75;
          font-size: 13px;
          line-height: 20px;
        }

        .summaryValue {
          color: #202223;
          font-size: 32px;
          font-weight: 650;
          line-height: 40px;
          margin-top: 12px;
          font-variant-numeric: tabular-nums;
        }

        .summaryDetail {
          color: #616a75;
          font-size: 13px;
          line-height: 20px;
          margin-top: 4px;
        }

        .statusDot {
          background: #008060;
          border-radius: 999px;
          height: 8px;
          width: 8px;
        }

        .panel {
          background: #ffffff;
          border: 1px solid #dcdfe4;
          border-radius: 8px;
          overflow: hidden;
        }

        .panelHeader {
          align-items: center;
          border-bottom: 1px solid #ebedf0;
          display: flex;
          gap: 12px;
          justify-content: space-between;
          padding: 16px;
        }

        .panelTitle {
          color: #202223;
          font-size: 16px;
          font-weight: 650;
          line-height: 24px;
          margin: 0;
        }

        .customerName {
          color: #202223;
          font-weight: 550;
        }

        .pointsPill {
          background: #eff9f4;
          border-radius: 999px;
          color: #008060;
          display: inline-flex;
          font-size: 13px;
          font-weight: 650;
          line-height: 20px;
          padding: 2px 10px;
        }

        .emptyState {
          color: #616a75;
          padding: 28px 16px;
          text-align: center;
        }

        @media (max-width: 1080px) {
          .summaryGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .summaryGrid {
            grid-template-columns: 1fr;
          }

          .panelHeader {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <s-section>
        <div className="dashboardStack">
          <div className="summaryGrid">
            {stats.map((stat) => (
              <div className="summaryCard" key={stat.label}>
                <div className="summaryCardHeader">
                  <div className="summaryLabel">{stat.label}</div>
                  <div className="statusDot" />
                </div>
                <div className="summaryValue">
                  {formatter.format(stat.value)}
                </div>
                <div className="summaryDetail">{stat.detail}</div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2 className="panelTitle">Recent customers</h2>
                <div className="tableMeta">Latest 10 loyalty members</div>
              </div>
              <div className="tableMeta">
                {formatter.format(customers.length)} shown
              </div>
            </div>

            {customers.length > 0 ? (
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Customer</s-table-header>
                  <s-table-header listSlot="secondary">Email</s-table-header>
                  <s-table-header format="numeric">Points</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {customers.map((customer) => (
                    <s-table-row key={customer.id}>
                      <s-table-cell>
                        <span className="customerName">
                          {customer.name || "Unnamed customer"}
                        </span>
                      </s-table-cell>
                      <s-table-cell>
                        <span className="customerEmail">
                          {customer.email || "No email"}
                        </span>
                      </s-table-cell>
                      <s-table-cell>
                        <span className="pointsPill">
                          {formatter.format(customer.loyaltyPoints)}
                        </span>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            ) : (
              <div className="emptyState">
                No loyalty customers yet. New customers will appear here after
                they earn points.
              </div>
            )}
          </div>
        </div>
      </s-section>
    </s-page>
  );
}
