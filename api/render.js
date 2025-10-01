import { applyCors, handleOptions, methodNotAllowed, normaliseErrorPayload } from "./_utils/http.js";
import { createVsaiRequest } from "./_utils/vsai.js";

export function createRenderHandler({ fetchImpl } = {}) {
  const vsaiRequest = createVsaiRequest({ fetchImpl });

  return async function handler(req, res) {
    applyCors(res, ["GET", "OPTIONS"]);

    if (handleOptions(req, res)) {
      return;
    }

    if (req.method !== "GET") {
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

    const url = new URL("https://api.virtualstagingai.app/v1/render");
    url.searchParams.set("render_id", renderId);

    try {
      const response = await vsaiRequest({
        url: url.toString(),
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
      console.error("VSAI render lookup error:", error);
      res.status(502).json({ error: "Failed to contact Virtual Staging API" });
    }
  };
}

const handler = createRenderHandler();
export default handler;
