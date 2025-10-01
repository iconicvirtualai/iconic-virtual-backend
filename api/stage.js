import fetch from "node-fetch";
import { Dropbox } from "dropbox";

export function createStageHandler({
  fetchImpl,
  dropboxFactory,
} = {}) {
  const callFetch = fetchImpl ?? fetch;
  const createDropbox =
    dropboxFactory ??
    ((options = {}) => new Dropbox({ accessToken: options.accessToken }));
  
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

    // === Upload to Dropbox ===
    const dropbox = createDropbox({
      accessToken: process.env.DROPBOX_ACCESS_TOKEN,
    });
    
    // Accept both data URLs ("data:image/jpeg;base64,...") and raw base64 strings.
    const hasDataUrlPrefix = image_base64.includes(",");
    const base64Payload = hasDataUrlPrefix ? image_base64.split(",", 2)[1] : image_base64;

    if (!base64Payload || !base64Payload.trim()) {
      console.warn("Invalid image payload: expected base64 string or data URL");
      return res.status(400).json({ error: "Invalid image payload" });
    }

    let fileBuffer;
    try {
      fileBuffer = Buffer.from(base64Payload, "base64");
    } catch (decodeError) {
      console.warn("Failed to decode base64 image payload", decodeError);
      return res.status(400).json({ error: "Invalid image payload" });
    }
    const fileName = `/uploads/${Date.now()}.jpg`;

    await dropbox.filesUpload({
      path: fileName,
      contents: fileBuffer,
      mode: "add",
      autorename: true,
      mute: false
    });

    const link = await dropbox.sharingCreateSharedLinkWithSettings({ path: fileName });
    const imageUrl = link.result.url.replace("?dl=0", "?raw=1");

    // === Send to Virtual Staging AI ===
    const vsaiResponse = await callFetch("https://api.virtualstagingai.app/v1/render/create", {
      method: "POST",
      headers: {
        "Authorization": `Api-Key ${process.env.VSAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_url: imageUrl,
        room_type,
        style,
        wait_for_completion: true,
        add_virtually_staged_watermark: true
      })
    });

    const vsaiResult = await vsaiResponse.json();

    if (vsaiResult.result_image_url) {
      return res.status(200).json({ preview_url: vsaiResult.result_image_url });
    } else {
      return res.status(500).json({ error: "Staging failed", details: vsaiResult });
    }
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({ error: "Server error", details: error.message });
  }
    };
}

export default createStageHandler();
