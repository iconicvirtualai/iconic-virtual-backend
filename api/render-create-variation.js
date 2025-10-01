import { applyCors, handleOptions, methodNotAllowed, normaliseErrorPayload } from "./_utils/http.js";
import { createVsaiRequest } from "./_utils/vsai.js";

export function createRenderVariationHandler({ fetchImpl } = {}) {
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

    const renderId = req.query?.render_id || req.query?.renderId;
    if (!renderId) {
      res.status(400).json({ error: "Missing render_id" });
      return;
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};

    const url = new URL("https://api.virtualstagingai.app/v1/render/create-variation");
    url.searchParams.set("render_id", renderId);

    try {
      const response = await vsaiRequest({
        url: url.toString(),
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
      console.error("VSAI render variation error:", error);
      res.status(502).json({ error: "Failed to contact Virtual Staging API" });
    }
  };
}

const handler = createRenderVariationHandler();
export default handler;
