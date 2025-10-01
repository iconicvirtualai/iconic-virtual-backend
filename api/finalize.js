import { applyCors, handleOptions, methodNotAllowed, normaliseErrorPayload } from "./_utils/http.js";
import { createVsaiRequest } from "./_utils/vsai.js";
import { ensureSharedLink, resolveDropbox, uploadBuffer } from "./_utils/dropbox.js";

let fetchPromise;
async function resolveFetch(providedFetch) {
  if (providedFetch) {
    return providedFetch;
  }

  if (typeof fetch === "function") {
    return (...args) => fetch(...args);
  }

  if (!fetchPromise) {
    fetchPromise = import("node-fetch").then((mod) => mod.default);
  }

  return fetchPromise;
}

async function downloadAsBuffer(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response?.ok) {
    const status = response?.status ?? "unknown";
    throw new Error(`Failed to download asset (${status})`);
  }

  if (typeof response.arrayBuffer === "function") {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (typeof response.buffer === "function") {
    return response.buffer();
  }

  if (response.body) {
    const chunks = [];
    for await (const chunk of response.body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Response body is not readable");
}

export function createFinalizeHandler({ fetchImpl, dropboxFactory } = {}) {
  const vsaiRequest = createVsaiRequest({ fetchImpl });
  let cachedFetch = fetchImpl;

  return async function handler(req, res) {
    applyCors(res, ["POST", "OPTIONS"]);

    if (handleOptions(req, res)) {
      return;
    }

    if (req.method !== "POST") {
      methodNotAllowed(res);
      return;
    }

    const { render_id: renderId, job_id: jobId } = req.body || {};

    if (!renderId || !jobId) {
      res.status(400).json({ error: "Missing render_id or job_id" });
      return;
    }

    const apiKey = process.env.VSAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing Virtual Staging API key" });
      return;
    }

    if (!process.env.DROPBOX_ACCESS_TOKEN) {
      res.status(500).json({ error: "Missing Dropbox access token" });
      return;
    }

    try {
      const response = await vsaiRequest({
        url: "https://api.virtualstagingai.app/v1/render/create-variation",
        method: "POST",
        apiKey,
        body: {
          render_id: renderId,
          wait_for_completion: true,
          add_virtually_staged_watermark: false,
        },
      });

      if (!response.ok || !response.data?.result_image_url) {
        res
          .status(response.ok ? 500 : response.status)
          .json(normaliseErrorPayload(response.data));
        return;
      }

      const activeFetch = cachedFetch ?? (cachedFetch = await resolveFetch(fetchImpl));
      const finalBuffer = await downloadAsBuffer(
        activeFetch,
        response.data.result_image_url,
      );

      const dropbox = await resolveDropbox({
        factory: dropboxFactory,
        options: {
          accessToken: process.env.DROPBOX_ACCESS_TOKEN,
        },
      });

      const finalPath = `/renders/${jobId}/final.jpg`;
      await uploadBuffer(dropbox, {
        path: finalPath,
        contents: finalBuffer,
        mode: { ".tag": "overwrite" },
        autorename: false,
        mute: true,
      });

      const downloadUrl = await ensureSharedLink(dropbox, finalPath);

      res.status(200).json({
        job_id: jobId,
        render_id: response.data.render_id ?? renderId,
        download_url: downloadUrl,
        download_dropbox_path: finalPath,
        vsai_result_url: response.data.result_image_url,
      });
    } catch (error) {
      console.error("Finalize error:", error);
      res.status(500).json({ error: "Failed to finalize render" });
    }
  };
}

const handler = createFinalizeHandler();
export default handler;
