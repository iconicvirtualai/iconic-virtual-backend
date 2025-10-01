import fetch from "node-fetch";
import { Dropbox } from "dropbox";
import { setCorsHeaders } from "./_cors.js";

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    setCorsHeaders(res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { image_base64, room_type, style } = req.body;

    if (!image_base64 || !room_type || !style) {
      setCorsHeaders(res);
      return res.status(400).json({ error: "Missing required fields" });
    }

    // === Upload to Dropbox ===
    const dropbox = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
    const fileBuffer = Buffer.from(image_base64.split(",")[1], "base64");
    const jobId = `job_${Date.now()}`;
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

    // === Send to Virtual Staging AI ===
    const vsaiResponse = await fetch("https://api.virtualstagingai.app/v1/render/create", {
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
      setCorsHeaders(res);
      return res.status(200).json({
        preview_url: vsaiResult.result_image_url,
        job_id: jobId,
        dropbox_path: fileName,
        image_url: imageUrl,
        room_type,
        style
      });
    } else {
      setCorsHeaders(res);
      return res.status(500).json({ error: "Staging failed", details: vsaiResult });
    }
  } catch (error) {
    console.error("Server error:", error);
    setCorsHeaders(res);
    return res.status(500).json({ error: "Server error", details: error.message });
  }
}
