export class AppError extends Error {
  constructor(message, { cause, code = "INTERNAL_ERROR", status = 500 } = {}) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

function getErrorDetails(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

export function logError(context, error, metadata = {}) {
  console.error(`[${context}]`, {
    ...metadata,
    error: getErrorDetails(error),
  });
}

export async function parseJsonRequest(request, context = "request") {
  try {
    return await request.json();
  } catch (error) {
    throw new AppError(`${context} body must be valid JSON.`, {
      cause: error,
      code: "INVALID_JSON",
      status: 400,
    });
  }
}

export async function parseJsonResponse(response, context = "upstream API") {
  let text;

  try {
    text = await response.text();
  } catch (error) {
    throw new AppError(`${context} response could not be read.`, {
      cause: error,
      code: "UPSTREAM_READ_FAILED",
      status: 502,
    });
  }

  let result;

  try {
    result = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new AppError(`${context} returned an invalid JSON response.`, {
      cause: error,
      code: "INVALID_UPSTREAM_RESPONSE",
      status: 502,
    });
  }

  if (!response.ok) {
    throw new AppError(`${context} request failed with status ${response.status}.`, {
      code: "UPSTREAM_REQUEST_FAILED",
      status: 502,
    });
  }

  return result;
}

export async function runShopifyGraphql(
  admin,
  query,
  { variables, operation = "Shopify GraphQL" } = {},
) {
  let response;

  try {
    response = await admin.graphql(query, variables ? { variables } : undefined);
  } catch (error) {
    throw new AppError(`${operation} request failed.`, {
      cause: error,
      code: "SHOPIFY_API_UNAVAILABLE",
      status: 502,
    });
  }

  const result = await parseJsonResponse(response, operation);

  if (!result || typeof result !== "object") {
    throw new AppError(`${operation} returned an empty response.`, {
      code: "INVALID_SHOPIFY_RESPONSE",
      status: 502,
    });
  }

  if (Array.isArray(result.errors) && result.errors.length > 0) {
    const message = result.errors
      .map((error) => error?.message)
      .filter(Boolean)
      .join("; ");

    throw new AppError(message || `${operation} returned errors.`, {
      code: "SHOPIFY_GRAPHQL_ERROR",
      status: 502,
    });
  }

  if (!result.data || typeof result.data !== "object") {
    throw new AppError(`${operation} did not return data.`, {
      code: "INVALID_SHOPIFY_RESPONSE",
      status: 502,
    });
  }

  return result.data;
}

export function publicErrorResponse(
  error,
  { fallbackMessage = "Something went wrong. Please try again.", headers } = {},
) {
  const status =
    error instanceof AppError && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
  const message =
    error instanceof AppError && error.status >= 400 && error.status < 500
      ? error.message
      : fallbackMessage;

  return Response.json(
    {
      success: false,
      message,
      code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
    },
    { status, headers },
  );
}

export function webhookAuthenticationError(context, error) {
  logError(`${context}:authentication`, error);
  return new Response("Webhook authentication failed", { status: 401 });
}

export function webhookProcessingError(context, error, metadata = {}) {
  logError(`${context}:processing`, error, metadata);
  return new Response("Webhook processing failed", { status: 500 });
}
