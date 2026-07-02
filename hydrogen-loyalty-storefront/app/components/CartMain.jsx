import {useOptimisticCart} from '@shopify/hydrogen';
import {Link} from 'react-router';
import {useAside} from '~/components/Aside';
import {CartLineItem} from '~/components/CartLineItem';
import {CartSummary} from './CartSummary';
/**
 * Returns a map of all line items and their children.
 * @param {CartLine[]} lines
 * @return {import("/home/galaxy/Documents/loyaltyApp/loyalty-points-app/hydrogen-loyalty-storefront/app/components/CartMain").LineItemChildrenMap}
 */
function getLineItemChildrenMap(lines) {
  const children = {};
  for (const line of lines) {
    if ('parentRelationship' in line && line.parentRelationship?.parent) {
      const parentId = line.parentRelationship.parent.id;
      if (!children[parentId]) children[parentId] = [];
      children[parentId].push(line);
    }
    if ('lineComponents' in line) {
      const lineChildren = getLineItemChildrenMap(line.lineComponents);
      for (const [parentId, childIds] of Object.entries(lineChildren)) {
        if (!children[parentId]) children[parentId] = [];
        children[parentId].push(...childIds);
      }
    }
  }
  return children;
}
/**
 * The main cart component that displays the cart items and summary.
 * It is used by both the /cart route and the cart aside dialog.
 * @param {CartMainProps}
 */
export function CartMain({layout, cart: originalCart, loyalty}) {
  // The useOptimisticCart hook applies pending actions to the cart
  // so the user immediately sees feedback when they modify the cart.
  const cart = useOptimisticCart(originalCart);

  const lines = cart?.lines?.nodes ?? [];
  const rootLines = lines.filter((line) => {
    return !(
      'parentRelationship' in line && line.parentRelationship?.parent
    );
  });
  const hasCartLines = rootLines.length > 0;
  const withDiscount =
    cart &&
    Boolean(cart?.discountCodes?.filter((code) => code.applicable)?.length);
  const className = `cart-main ${withDiscount ? 'with-discount' : ''}`;
  const cartHasItems = cart?.totalQuantity
    ? cart.totalQuantity > 0
    : hasCartLines;
  const childrenMap = getLineItemChildrenMap(lines);

  return (
    <section
      className={className}
      aria-label={layout === 'page' ? 'Cart page' : 'Cart drawer'}
    >
      {hasCartLines ? (
        <div className="cart-details">
          <p id="cart-lines" className="sr-only">
            Line items
          </p>
          <div>
            <ul aria-labelledby="cart-lines">
              {rootLines.map((line) => {
                return (
                  <CartLineItem
                    key={line.id}
                    line={line}
                    layout={layout}
                    childrenMap={childrenMap}
                  />
                );
              })}
            </ul>
          </div>
          {cartHasItems && (
            <CartSummary cart={cart} layout={layout} loyalty={loyalty} />
          )}
        </div>
      ) : (
        <CartEmpty layout={layout} />
      )}
    </section>
  );
}

/**
 * @param {{
 *   layout?: CartMainProps['layout'];
 * }}
 */
function CartEmpty() {
  const {close} = useAside();
  return (
    <div className="cart-empty">
      <h2>Your cart is empty</h2>
      <p>Find your next favorite and come back to redeem rewards.</p>
      <Link to="/collections" onClick={close} prefetch="viewport">
        Continue shopping
      </Link>
    </div>
  );
}

/** @typedef {'page' | 'aside'} CartLayout */
/**
 * @typedef {{
 *   cart: CartApiQueryFragment | null;
 *   layout: CartLayout;
 *   loyalty?: import('~/components/LoyaltyRewards').LoyaltyCartData | null;
 * }} CartMainProps
 */
/** @typedef {{[parentId: string]: CartLine[]}} LineItemChildrenMap */

/** @typedef {import('storefrontapi.generated').CartApiQueryFragment} CartApiQueryFragment */
/** @typedef {import('~/components/CartLineItem').CartLine} CartLine */
