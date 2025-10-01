import { ensureSharedLink, resolveDropbox, uploadBuffer } from "./_utils/dropbox.js";

function applyCors(res) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

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

function parseBase64Image(payload) {
  if (typeof payload !== "string" || payload.trim() === "") {
    return null;
  }

  const [, base64Part = ""] = payload.split(",");
  const cleanBase64 = base64Part.trim();

  if (cleanBase64 === "") {
    return null;
  }

  try {
    const buffer = Buffer.from(cleanBase64, "base64");
    if (!buffer || buffer.length === 0) {
      return null;
    }

    return buffer;
  } catch (error) {
    return null;
  }
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

export function createStageHandler({ fetchImpl, dropboxFactory, idGenerator = () => Date.now() } = {}) {
  let cachedFetch = fetchImpl;

  return async function handler(req, res) {
    applyCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { image_base64, room_type, style } = req.body || {};

    if (!image_base64 || !room_type || !style) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const imageBuffer = parseBase64Image(image_base64);
    if (!imageBuffer) {
      return res.status(400).json({ error: "Invalid image payload" });
    }

    if (!process.env.DROPBOX_ACCESS_TOKEN) {
      return res.status(500).json({ error: "Missing Dropbox access token" });
    }

    if (!process.env.VSAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "Missing Virtual Staging API key" });
    }

    try {
      const dropbox = await resolveDropbox({
        factory: dropboxFactory,
        options: {
          accessToken: process.env.DROPBOX_ACCESS_TOKEN,
        },
      });

      const jobId = `job_${idGenerator()}`;
      const originalPath = `/renders/${jobId}/original.jpg`;

      await uploadBuffer(dropbox, {
        path: originalPath,
        contents: imageBuffer,
        mode: "add",
        autorename: false,
        mute: false,
      });

      const originalImageUrl = await ensureSharedLink(dropbox, originalPath);

      const activeFetch = cachedFetch ?? (cachedFetch = await resolveFetch(fetchImpl));

      const vsaiResponse = await activeFetch(
        "https://api.virtualstagingai.app/v1/render/create",
        {
          method: "POST",
          headers: {
            Authorization: `Api-Key ${process.env.VSAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_url: originalImageUrl,
            room_type,
            style,
            wait_for_completion: true,
            add_virtually_staged_watermark: true,
          }),
        },
      );

      const vsaiResult = await vsaiResponse.json();

      if (!vsaiResponse.ok || !vsaiResult?.result_image_url) {
        return res
          .status(500)
          .json({ error: "Staging failed", details: vsaiResult });
      }

      const previewBuffer = await downloadAsBuffer(
        activeFetch,
        vsaiResult.result_image_url,
      );

      const previewPath = `/renders/${jobId}/preview.jpg`;

      await uploadBuffer(dropbox, {
        path: previewPath,
        contents: previewBuffer,
        mode: { ".tag": "overwrite" },
        autorename: false,
        mute: true,
      });

      const previewUrl = await ensureSharedLink(dropbox, previewPath);

      return res.status(200).json({
        preview_url: previewUrl,
        preview_vsai_url: vsaiResult.result_image_url,
        job_id: jobId,
        render_id: vsaiResult.render_id,
        dropbox_path: originalPath,
        preview_dropbox_path: previewPath,
        image_url: originalImageUrl,
        room_type,
        style,
      });
    } catch (error) {
      console.error("Server error:", error);
      return res.status(500).json({ error: "Server error", details: error.message });
    }
  };
}

const handler = createStageHandler();
export default handler;
