export function applyCors(res, methods = ["GET", "POST", "OPTIONS"]) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
}

export function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }

  return false;
}

export function methodNotAllowed(res) {
  return res.status(405).json({ error: "Method not allowed" });
}

export function normaliseErrorPayload(payload, fallbackMessage = "VSAI request failed") {
  if (payload && typeof payload === "object") {
    return payload;
  }

  if (payload === undefined || payload === null) {
    return { error: fallbackMessage };
  }

  return { error: fallbackMessage, details: payload };
}
