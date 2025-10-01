import fetch from "node-fetch";
import { Dropbox } from "dropbox";

function decodeImagePayload(imageBase64) {
  if (typeof imageBase64 !== "string") {
    return null;
  }

  const [, base64Data = ""] = imageBase64.split(",");
  const sanitized = base64Data.replace(/\s+/g, "");

  if (!sanitized) {
    return null;
  }

  try {
    const buffer = Buffer.from(sanitized, "base64");
    if (buffer.length === 0) {
      return null;
    }
    return buffer;
  } catch (error) {
    return null;
  }
}

export function createStageHandler({
  fetchImpl = fetch,
  dropboxFactory = (options) => new Dropbox(options),
  dateNow = () => Date.now(),
} = {}) {
  return async function handler(req, res) {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const { image_base64, room_type, style } = req.body ?? {};

      if (!image_base64 || !room_type || !style) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const fileBuffer = decodeImagePayload(image_base64);
      if (!fileBuffer) {
        return res.status(400).json({ error: "Invalid image payload" });
      }

      const dropbox = dropboxFactory({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
      const jobId = `job_${dateNow()}`;
      const fileName = `/uploads/${jobId}.jpg`;

      await dropbox.filesUpload({
        path: fileName,
        contents: fileBuffer,
        mode: "add",
        autorename: true,
        mute: false,
      });

      const link = await dropbox.sharingCreateSharedLinkWithSettings({ path: fileName });
      const imageUrl = link.result.url.replace("?dl=0", "?raw=1");

      const vsaiResponse = await fetchImpl("https://api.virtualstagingai.app/v1/render/create", {
        method: "POST",
        headers: {
          "Authorization": `Api-Key ${process.env.VSAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: imageUrl,
          room_type,
          style,
          wait_for_completion: true,
          add_virtually_staged_watermark: true,
        }),
      });

      const vsaiResult = await vsaiResponse.json();

      if (vsaiResult.result_image_url) {
        return res.status(200).json({
          preview_url: vsaiResult.result_image_url,
          job_id: jobId,
          dropbox_path: fileName,
          image_url: imageUrl,
          room_type,
          style,
        });
      }

      return res.status(500).json({ error: "Staging failed", details: vsaiResult });
    } catch (error) {
      console.error("Server error:", error);
      return res.status(500).json({ error: "Server error", details: error.message });
    }
  };
}

export default createStageHandler();
