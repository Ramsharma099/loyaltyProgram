import {
  action as redeemPointsAction,
  loader as redeemPointsLoader,
} from "./api.redeem-points";
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

  return redeemPointsLoader(args);
};

export const action = async (args) => {
  if (args.request.method === "OPTIONS") {
    return hydrogenOptionsResponse();
  }

  const authResponse = requireHydrogenApiRequest(args.request);

  if (authResponse) {
    return authResponse;
  }

  return redeemPointsAction(args);
};

export const headers = () => hydrogenCorsHeaders;
