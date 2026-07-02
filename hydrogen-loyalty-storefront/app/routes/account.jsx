import {
  data as remixData,
  Form,
  NavLink,
  Outlet,
  useLoaderData,
  useRouteError,
} from 'react-router';
import {CUSTOMER_DETAILS_QUERY} from '~/graphql/customer-account/CustomerDetailsQuery';

export function shouldRevalidate() {
  return true;
}

/**
 * @param {Route.LoaderArgs}
 */
export async function loader({context}) {
  const {customerAccount} = context;
  const {data, errors} = await customerAccount.query(CUSTOMER_DETAILS_QUERY, {
    variables: {
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer) {
    throw new Error('Customer not found');
  }

  return remixData(
    {customer: data.customer},
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
  );
}

export default function AccountLayout() {
  /** @type {LoaderReturnData} */
  const {customer} = useLoaderData();

  const heading = customer
    ? customer.firstName
      ? `Welcome, ${customer.firstName}`
      : `Welcome to your account.`
    : 'Account Details';

  return (
    <div className="account">
      <h1>{heading}</h1>
      <br />
      <AccountMenu />
      <br />
      <br />
      <Outlet context={{customer}} />
    </div>
  );
}

function AccountMenu() {
  function isActiveStyle({isActive, isPending}) {
    return {
      fontWeight: isActive ? 'bold' : undefined,
      color: isPending ? 'grey' : 'black',
    };
  }

  return (
    <nav role="navigation">
      <NavLink to="/account/orders" style={isActiveStyle}>
        Orders &nbsp;
      </NavLink>
      &nbsp;|&nbsp;
      <NavLink to="/account/profile" style={isActiveStyle}>
        &nbsp; Profile &nbsp;
      </NavLink>
      &nbsp;|&nbsp;
      <NavLink to="/account/addresses" style={isActiveStyle}>
        &nbsp; Addresses &nbsp;
      </NavLink>
      &nbsp;|&nbsp;
      <Logout />
    </nav>
  );
}

function Logout() {
  return (
    <Form className="account-logout" method="POST" action="/account/logout">
      &nbsp;<button type="submit">Sign out</button>
    </Form>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = getErrorMessage(error);
  const isCustomerAccountTunnelError = message.includes(
    'Customer Account API OAuth requires a Hydrogen tunnel',
  );

  return (
    <main className="account-dev-error">
      <h1>Account pages need the Hydrogen tunnel</h1>
      {isCustomerAccountTunnelError ? (
        <>
          <p>
            Customer Account API OAuth cannot run from plain localhost during
            development.
          </p>
          <p>
            Start Hydrogen with <code>npm run dev:customer-account</code> and
            open the <code>https://*.tryhydrogen.dev</code> URL printed by the
            terminal.
          </p>
          <p>
            If that command says it cannot access Hydrogen storefronts, install
            the Hydrogen sales channel on the store or use a Shopify staff
            account with Hydrogen channel access.
          </p>
        </>
      ) : (
        <p>{message || 'Could not load this account page.'}</p>
      )}
      <a href="/">Return to storefront</a>
    </main>
  );
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object' && 'message' in data) {
      return String(data.message);
    }
  }

  return '';
}

/** @typedef {import('./+types/account').Route} Route */
/** @typedef {ReturnType<typeof useLoaderData<typeof loader>>} LoaderReturnData */
