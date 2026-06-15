export async function fetchApiJson(url, init, fallbackMessage) {
  const response = await fetch(url, init);
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
