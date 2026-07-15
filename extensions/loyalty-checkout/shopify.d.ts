import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/Checkout.jsx' {
  const shopify:
    | import('@shopify/ui-extensions/purchase.checkout.contact.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.block.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/api.js' {
  const shopify:
    | import('@shopify/ui-extensions/purchase.checkout.contact.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.block.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/api-base-url.js' {
  const shopify:
    | import('@shopify/ui-extensions/purchase.checkout.contact.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.block.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/api-base-url.generated.js' {
  const shopify:
    | import('@shopify/ui-extensions/purchase.checkout.contact.render-after').Api
    | import('@shopify/ui-extensions/purchase.checkout.block.render').Api
    | import('@shopify/ui-extensions/purchase.checkout.payment-method-list.render-before').Api;
  const globalThis: { shopify: typeof shopify };
}
