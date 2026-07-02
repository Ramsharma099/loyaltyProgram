import {
  action as loyaltyBalanceAction,
  headers as loyaltyBalanceHeaders,
  loader as loyaltyBalanceLoader,
} from "./api.loyalty-balance";
import {
  hydrogenCorsHeaders,
  hydrogenOptionsResponse,
  requireHydrogenApiRequest,
} from "../services/hydrogen-api.server";

export const loader = async (args) => {
  const authResponse = requireHydrogenApiRequest(args.request);

  if (authResponse) {
    return authResponse;
  }

  return loyaltyBalanceLoader(args);
};

export const action = async (args) => {
  if (args.request.method === "OPTIONS") {
    return hydrogenOptionsResponse();
  }

  const authResponse = requireHydrogenApiRequest(args.request);

  if (authResponse) {
    return authResponse;
  }

  return loyaltyBalanceAction(args);
};

export const headers = (args) => ({
  ...hydrogenCorsHeaders,
  ...loyaltyBalanceHeaders(args),
});
