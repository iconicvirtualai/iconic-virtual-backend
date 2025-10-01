import { applyCors, handleOptions, methodNotAllowed, normaliseErrorPayload } from "./_utils/http.js";
import { createVsaiRequest } from "./_utils/vsai.js";

export function createRenderCreateHandler({ fetchImpl } = {}) {
  const vsaiRequest = createVsaiRequest({ fetchImpl });

  return async function handler(req, res) {
    applyCors(res, ["POST", "OPTIONS"]);

    if (handleOptions(req, res)) {
      return;
    }

    if (req.method !== "POST") {
      methodNotAllowed(res);
      return;
    }

    const apiKey = process.env.VSAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing Virtual Staging API key" });
      return;
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};

    try {
      const response = await vsaiRequest({
        url: "https://api.virtualstagingai.app/v1/render/create",
        method: "POST",
        body: payload,
        apiKey,
      });

      if (!response.ok) {
        res
          .status(response.status)
          .json(normaliseErrorPayload(response.data));
        return;
      }

      res.status(response.status).json(response.data ?? {});
    } catch (error) {
      console.error("VSAI render/create error:", error);
      res.status(502).json({ error: "Failed to contact Virtual Staging API" });
    }
  };
}

const handler = createRenderCreateHandler();
export default handler;
