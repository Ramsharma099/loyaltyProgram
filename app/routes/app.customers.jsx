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
  const totalPoints = customers.reduce(
    (sum, customer) => sum + (customer.loyaltyPoints || 0),
    0,
  );
  const totalRewards = customers.reduce(
    (sum, customer) => sum + (customer._count?.rewards || 0),
    0,
  );

  return (
    <s-page heading="Customers" inlineSize="large">
      <style>{customerStyles}</style>
      <div className="customers-layout">
        <section className="customer-summary" aria-label="Customer summary">
          <div>
            <span>Enrolled customers</span>
            <strong>{formatter.format(totalCustomers)}</strong>
          </div>
          <div>
            <span>Available points</span>
            <strong>{formatter.format(totalPoints)}</strong>
          </div>
          <div>
            <span>Rewards created</span>
            <strong>{formatter.format(totalRewards)}</strong>
          </div>
        </section>

        <section className="customer-panel" aria-labelledby="customer-list-heading">
          <div className="customer-panel-header">
            <div>
              <h2 id="customer-list-heading">Customer list</h2>
              <p>Customers enrolled in your loyalty program</p>
            </div>
          </div>

          {customers.length > 0 ? (
            <div className="customer-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Email</th>
                    <th className="numeric">Points</th>
                    <th className="numeric">Transactions</th>
                    <th className="numeric">Rewards</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <strong>{customer.name || "Unnamed customer"}</strong>
                      </td>
                      <td className="secondary">{customer.email || "No email"}</td>
                      <td className="numeric">
                        <span className="points-pill">
                          {formatter.format(customer.loyaltyPoints || 0)}
                        </span>
                      </td>
                      <td className="numeric">
                        {formatter.format(customer._count?.transactions || 0)}
                      </td>
                      <td className="numeric">
                        {formatter.format(customer._count?.rewards || 0)}
                      </td>
                      <td className="secondary">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="customer-empty-state">
              <div className="empty-icon" aria-hidden="true">0</div>
              <h3>No customers</h3>
              <p>Customers will appear here after they join your loyalty program.</p>
            </div>
          )}
        </section>
      </div>
    </s-page>
  );
}

const customerStyles = `
  .customers-layout { display: grid; gap: 16px; padding: 20px 0 32px; }
  .customer-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .customer-summary > div, .customer-panel { background: #fff; border: 1px solid #e3e5e7; border-radius: 12px; }
  .customer-summary > div { display: grid; gap: 6px; padding: 18px 20px; }
  .customer-summary span { color: #616a75; font-size: 13px; }
  .customer-summary strong { color: #202223; font-size: 24px; line-height: 30px; }
  .customer-panel { overflow: hidden; }
  .customer-panel-header { padding: 20px 22px; border-bottom: 1px solid #e3e5e7; }
  .customer-panel-header h2 { margin: 0; color: #202223; font-size: 16px; line-height: 24px; }
  .customer-panel-header p { margin: 3px 0 0; color: #616a75; font-size: 13px; }
  .customer-table-scroll { overflow-x: auto; }
  .customer-panel table { width: 100%; border-collapse: collapse; min-width: 760px; }
  .customer-panel th { padding: 11px 16px; background: #f6f6f7; border-bottom: 1px solid #e3e5e7; color: #616a75; font-size: 11px; font-weight: 700; letter-spacing: .03em; text-align: left; text-transform: uppercase; }
  .customer-panel td { padding: 15px 16px; border-bottom: 1px solid #ebedef; color: #202223; font-size: 13px; }
  .customer-panel tbody tr:last-child td { border-bottom: 0; }
  .customer-panel tbody tr:hover { background: #fafbfb; }
  .customer-panel .numeric { text-align: right; }
  .customer-panel .secondary { color: #616a75; }
  .points-pill { display: inline-flex; min-width: 42px; justify-content: center; padding: 4px 10px; border-radius: 999px; background: #e3f8ef; color: #0b6b50; font-weight: 700; }
  .customer-empty-state { display: grid; justify-items: center; padding: 52px 24px 58px; text-align: center; }
  .empty-icon { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 14px; border-radius: 50%; background: #f1f2f3; color: #616a75; font-size: 0; }
  .empty-icon::before { content: ""; width: 14px; height: 14px; border: 2px solid currentColor; border-radius: 50%; }
  .customer-empty-state h3 { margin: 0; color: #202223; font-size: 16px; }
  .customer-empty-state p { margin: 6px 0 0; color: #616a75; font-size: 13px; }
  @media (max-width: 700px) { .customer-summary { grid-template-columns: 1fr; } }
`;
