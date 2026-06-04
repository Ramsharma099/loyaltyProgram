const THEME_INTEGRATION = "theme";
const CHECKOUT_INTEGRATION = "checkout";

export const INTEGRATION_OPTIONS = {
  THEME: THEME_INTEGRATION,
  CHECKOUT: CHECKOUT_INTEGRATION,
};

export function normalizeIntegration(value) {
  return value === CHECKOUT_INTEGRATION
    ? CHECKOUT_INTEGRATION
    : THEME_INTEGRATION;
}
