import { useLoaderData } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: {
      shopDomain: session.shop,
    },
  });

  if (!shop) {
    return Response.json({
      customers: [],
      totalCustomers: 0,
      totalPoints: 0,
    });
  }

  const customers = await prisma.customer.findMany({
    where: {
      shopId: shop.id,
    },
    include: {
      _count: {
        select: {
          rewards: true,
          transactions: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const totalPoints = customers.reduce(
    (sum, customer) => sum + customer.loyaltyPoints,
    0,
  );

  return Response.json({
    customers,
    totalCustomers: customers.length,
    totalPoints,
  });
};

export default function CustomersPage() {
  const { customers, totalCustomers, totalPoints } = useLoaderData();
  const formatter = new Intl.NumberFormat("en");

  return (
    <s-page heading="Customers">
      <style>{`
        .customersStack {
          display: grid;
          gap: 16px;
        }

        .summaryGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .summaryCard,
        .panel {
          background: #ffffff;
          border: 1px solid #dcdfe4;
          border-radius: 8px;
          box-shadow: 0 1px 0 rgba(26, 26, 26, 0.04);
        }

        .summaryCard {
          min-height: 112px;
          padding: 16px;
        }

        .summaryLabel,
        .tableMeta,
        .customerEmail,
        .mutedText {
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

        .panel {
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
        <div className="customersStack">
          <div className="summaryGrid">
            <div className="summaryCard">
              <div className="summaryLabel">Total customers</div>
              <div className="summaryValue">
                {formatter.format(totalCustomers)}
              </div>
              <div className="mutedText">Enrolled loyalty members</div>
            </div>

            <div className="summaryCard">
              <div className="summaryLabel">Available points</div>
              <div className="summaryValue">{formatter.format(totalPoints)}</div>
              <div className="mutedText">Current customer balances</div>
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div>
                <h2 className="panelTitle">Customer list</h2>
                <div className="tableMeta">All loyalty customers</div>
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
                  <s-table-header format="numeric">Transactions</s-table-header>
                  <s-table-header format="numeric">Rewards</s-table-header>
                  <s-table-header>Joined</s-table-header>
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
                      <s-table-cell>
                        {formatter.format(customer._count.transactions)}
                      </s-table-cell>
                      <s-table-cell>
                        {formatter.format(customer._count.rewards)}
                      </s-table-cell>
                      <s-table-cell>
                        {new Date(customer.createdAt).toLocaleDateString()}
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
