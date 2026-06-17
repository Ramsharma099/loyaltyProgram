async function fetchSingleApiJson(url, init, fallbackMessage) {
  let response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    console.error("[loyalty-account] API request failed", { url, error });
    throw new Error(`${fallbackMessage} (${new URL(url).origin})`);
  }

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(fallbackMessage);
  }

  if (!response.ok || !data || typeof data !== "object") {
    throw new Error(data?.message || fallbackMessage);
  }

  return data;
}

export async function fetchApiJson(urlOrUrls, init, fallbackMessage) {
  const urls = (Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls]).filter(
    Boolean,
  );
  let lastError;

  for (const url of urls) {
    try {
      return await fetchSingleApiJson(url, init, fallbackMessage);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(fallbackMessage);
}
