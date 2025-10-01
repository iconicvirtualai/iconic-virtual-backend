let fetchPromise;
async function loadFetch() {
  if (typeof fetch === "function") {
    return (...args) => fetch(...args);
  }

  if (!fetchPromise) {
    fetchPromise = import("node-fetch").then((mod) => mod.default);
  }

  return fetchPromise;
}

export function createVsaiRequest({ fetchImpl } = {}) {
  let cachedFetch = fetchImpl;

  return async function vsaiRequest({ url, method = "GET", body, headers = {}, apiKey }) {
    const requestFetch = cachedFetch ?? (cachedFetch = await loadFetch());

    const requestHeaders = {
      Authorization: `Api-Key ${apiKey}`,
      ...headers,
    };

    const init = {
      method,
      headers: requestHeaders,
    };

    if (body !== undefined) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
      if (!("Content-Type" in requestHeaders)) {
        requestHeaders["Content-Type"] = "application/json";
      }
    }

    const response = await requestFetch(url, init);
    const raw = await response.text();
    let data = null;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  };
}
