import fetch from "node-fetch";
import { Dropbox } from "dropbox";

export function createStageHandler({
  fetchImpl = fetch,
  dropboxFactory = (options) => new Dropbox(options),
  responseFormatter = ({ vsaiResult }) => ({
    preview_url: vsaiResult.result_image_url,
  }),
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
      const { image_base64, room_type, style } = req.body;

      if (!image_base64 || !room_type || !style) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const [, base64Data = ""] = image_base64.split(",");
      if (!base64Data.trim()) {
        return res.status(400).json({ error: "Invalid image payload" });
      }

      let fileBuffer;
      try {
        fileBuffer = Buffer.from(base64Data, "base64");
      } catch (error) {
        return res.status(400).json({ error: "Invalid image payload" });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return res.status(400).json({ error: "Invalid image payload" });
      }

      const dropbox = dropboxFactory({
        accessToken: process.env.DROPBOX_ACCESS_TOKEN,
      });
      const jobId = `job_${Date.now()}`;
      const fileName = `/uploads/${jobId}.jpg`;

      await dropbox.filesUpload({
        path: fileName,
        contents: fileBuffer,
        mode: "add",
        autorename: true,
        mute: false,
      });

      const link = await dropbox.sharingCreateSharedLinkWithSettings({
        path: fileName,
      });
      const imageUrl = link.result.url.replace("?dl=0", "?raw=1");

      const vsaiResponse = await fetchImpl(
        "https://api.virtualstagingai.app/v1/render/create",
        {
          method: "POST",
          headers: {
            Authorization: `Api-Key ${process.env.VSAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_url: imageUrl,
            room_type,
            style,
            wait_for_completion: true,
            add_virtually_staged_watermark: true,
          }),
        }
      );

      const vsaiResult = await vsaiResponse.json();

      if (vsaiResult.result_image_url) {
        const response = responseFormatter({
          vsaiResult,
          jobId,
          dropboxPath: fileName,
          imageUrl,
          room_type,
          style,
        });
        return res.status(200).json(response);
      } else {
        return res
          .status(500)
          .json({ error: "Staging failed", details: vsaiResult });
      }
    } catch (error) {
      console.error("Server error:", error);
      return res.status(500).json({ error: "Server error", details: error.message });
    }
  };
}

const defaultStageHandler = createStageHandler({
  fetchImpl: fetch,
  dropboxFactory: (options) => new Dropbox(options),
  responseFormatter({ vsaiResult, jobId, dropboxPath, imageUrl, room_type, style }) {
    return {
      preview_url: vsaiResult.result_image_url,
      job_id: jobId,
      dropbox_path: dropboxPath,
      image_url: imageUrl,
      room_type,
      style,
    };
  },
});

export default defaultStageHandler;
