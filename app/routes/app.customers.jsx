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

  return Response.json({
    customers,
    totalCustomers: customers.length,
  });
};

export default function CustomersPage() {
  const { customers = [], totalCustomers = 0 } = useLoaderData();
  const formatter = new Intl.NumberFormat("en");
  const totalRewards = customers.reduce(
    (sum, c) => sum + (c._count?.rewards || 0),
    0,
  );

  const tableStyles = {
    fullWidth: { width: "100%", background: "transparent", borderCollapse: "separate" },
    card: {
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: "0 1px 0 rgba(16,24,32,0.06)",
      border: "1px solid rgba(16,24,32,0.06)",
    },
    headerPanel: {
      background: "#fff",
      paddingInline: 20,
      paddingBlockStart: 20,
      paddingBlockEnd: 20,
    },
    headerTitle: { margin: 0 },
    tableHeaderRow: {
      background: "#f5f6f7",
      borderBottom: "1px solid #e6e6e6",
    },
    thBox: { paddingBlockStart: "small", paddingBlockEnd: "small" },
    row: { background: "#fff", borderBottom: "1px solid #e6e6e6" },
    firstCellBox: { paddingBlockStart: "small", paddingBlockEnd: "small", paddingInline: "large" },
    numericCell: { textAlign: "center" },
    // column widths to match screenshot
    colCustomer: { width: "18%" },
    colEmail: { width: "42%" },
    colPoints: { width: "12%" },
    colTransactions: { width: "10%" },
    colRewards: { width: "8%" },
    colJoined: { width: "10%" },
    pointsPill: {
      display: "inline-block",
      padding: "6px 12px",
      background: "#bff6e8",
      color: "#036859",
      borderRadius: 9999,
      fontWeight: 600,
      minWidth: 34,
      textAlign: "center",
    },
  };

  return (
    <s-page heading="Customers" inlineSize="large">
      <s-box paddingBlockStart="large">
        <s-card padding="none" style={tableStyles.card}>
          {/* top header panel */}
          <div style={tableStyles.headerPanel}>
            <s-stack direction="inline" align="space-between" blockAlign="center">
              <s-stack direction="block" gap="x-small">
                <s-text variant="headingLg" fontWeight="bold" style={tableStyles.headerTitle}>
                  Customer list
                </s-text>
                {/* <s-text tone="subdued">
                  {formatter.format(totalCustomers)} enrolled customers
                </s-text> */}
              </s-stack>

              {/* <div>
                <s-badge tone="neutral">{formatter.format(totalRewards)} rewards</s-badge>
              </div> */}
            </s-stack>
          </div>

          {/* table */}
          <s-table style={tableStyles.fullWidth}>
            {/* header */}
            <s-table-header style={tableStyles.tableHeaderRow}>
              <s-table-row>
                <s-table-cell style={tableStyles.colCustomer}>
                  <s-box paddingBlockStart="small" paddingBlockEnd="small" paddingInline="large">
                    <s-text tone="subdued" fontWeight="semibold" style={{ textTransform: "uppercase", letterSpacing: ".02em" }}>
                      Customer
                    </s-text>
                  </s-box>
                </s-table-cell>

                <s-table-cell style={tableStyles.colEmail}>
                  <s-box paddingBlockStart="small" paddingBlockEnd="small">
                    <s-text tone="subdued" fontWeight="semibold" style={{ textTransform: "uppercase" }}>
                      Email
                    </s-text>
                  </s-box>
                </s-table-cell>

                <s-table-cell style={tableStyles.colPoints}>
                  <s-box paddingBlockStart="small" paddingBlockEnd="small" style={{ textAlign: "center" }}>
                    <s-text tone="subdued" fontWeight="semibold" style={{ textTransform: "uppercase" }}>
                      Points
                    </s-text>
                  </s-box>
                </s-table-cell>

                <s-table-cell style={tableStyles.colTransactions}>
                  <s-box paddingBlockStart="small" paddingBlockEnd="small" style={{ textAlign: "center" }}>
                    <s-text tone="subdued" fontWeight="semibold" style={{ textTransform: "uppercase" }}>
                      Transactions
                    </s-text>
                  </s-box>
                </s-table-cell>

                <s-table-cell style={tableStyles.colRewards}>
                  <s-box paddingBlockStart="small" paddingBlockEnd="small" style={{ textAlign: "center" }}>
                    <s-text tone="subdued" fontWeight="semibold" style={{ textTransform: "uppercase" }}>
                      Rewards
                    </s-text>
                  </s-box>
                </s-table-cell>

                <s-table-cell style={tableStyles.colJoined}>
                  <s-box paddingBlockStart="small" paddingBlockEnd="small" style={{ textAlign: "center" }}>
                    <s-text tone="subdued" fontWeight="semibold" style={{ textTransform: "uppercase" }}>
                      Joined
                    </s-text>
                  </s-box>
                </s-table-cell>
              </s-table-row>
            </s-table-header>

            {/* body */}
            <s-table-body>
              {customers.map((customer) => (
                <s-table-row key={customer.id} style={tableStyles.row}>
                  <s-table-cell style={tableStyles.colCustomer}>
                    <s-box paddingBlockStart="small" paddingBlockEnd="small" paddingInline="large">
                      <s-text fontWeight="bold">{customer.name || "Unnamed customer"}</s-text>
                    </s-box>
                  </s-table-cell>

                  <s-table-cell style={tableStyles.colEmail}>
                    <s-box paddingBlockStart="small" paddingBlockEnd="small">
                      <s-text tone="subdued">{customer.email || "No email"}</s-text>
                    </s-box>
                  </s-table-cell>

                  <s-table-cell style={{ ...tableStyles.colPoints, ...tableStyles.numericCell }}>
                    <s-box paddingBlockStart="small" paddingBlockEnd="small">
                      <span style={tableStyles.pointsPill}>{formatter.format(customer.loyaltyPoints || 0)}</span>
                    </s-box>
                  </s-table-cell>

                  <s-table-cell style={{ ...tableStyles.colTransactions, ...tableStyles.numericCell }}>
                    <s-box paddingBlockStart="small" paddingBlockEnd="small">
                      <s-text fontWeight="medium">{formatter.format(customer._count?.transactions || 0)}</s-text>
                    </s-box>
                  </s-table-cell>

                  <s-table-cell style={{ ...tableStyles.colRewards, ...tableStyles.numericCell }}>
                    <s-box paddingBlockStart="small" paddingBlockEnd="small">
                      <s-text fontWeight="medium">{formatter.format(customer._count?.rewards || 0)}</s-text>
                    </s-box>
                  </s-table-cell>

                  <s-table-cell style={{ ...tableStyles.colJoined, ...tableStyles.numericCell }}>
                    <s-box paddingBlockStart="small" paddingBlockEnd="small">
                      <s-text tone="subdued">{new Date(customer.createdAt).toLocaleDateString()}</s-text>
                    </s-box>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-card>
      </s-box>
    </s-page>
  );
}