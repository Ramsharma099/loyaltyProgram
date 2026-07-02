import {
  headers as rewardHistoryHeaders,
  loader as rewardHistoryLoader,
} from "./api.customer-reward-history";
import {
  hydrogenCorsHeaders,
  hydrogenOptionsResponse,
  requireHydrogenApiRequest,
} from "../services/hydrogen-api.server";

export const loader = async (args) => {
  if (args.request.method === "OPTIONS") {
    return hydrogenOptionsResponse();
  }

  const authResponse = requireHydrogenApiRequest(args.request);

  if (authResponse) {
    return authResponse;
  }

  return rewardHistoryLoader(args);
};

export const headers = (args) => ({
  ...hydrogenCorsHeaders,
  ...rewardHistoryHeaders(args),
});
