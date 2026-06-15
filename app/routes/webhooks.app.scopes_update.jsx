import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  webhookAuthenticationError,
  webhookProcessingError,
} from "../services/errors.server";

export const action = async ({ request }) => {
  let webhook;

  try {
    webhook = await authenticate.webhook(request);
  } catch (error) {
    return webhookAuthenticationError("app/scopes-update", error);
  }

  const { payload, session } = webhook;

  try {
    if (session && payload?.current) {
      await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          scope: payload.current.toString(),
        },
      });
    }

    return new Response();
  } catch (error) {
    return webhookProcessingError("app/scopes-update", error, {
      shop: session?.shop,
    });
  }
};
