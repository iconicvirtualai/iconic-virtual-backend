import fetch from "node-fetch";
import Dropbox from "dropbox";

export const config = {
  api: {
    bodyParser: true, // JSON body
  },
};

export default async function handler(req, res) {
  console.log("Incoming method:", req.method);

  // Handle CORS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    res.setHeader("Access-Control-Allow-Origin", "*");

    const { image_base64, room_type, style } = req.body || {};

    if (!image_base64 || !room_type || !style) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Step A: Upload original file to Dropbox
    const dbx = new Dropbox.Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN, fetch });
    const buffer = Buffer.from(image_base64, "base64");
    const dropboxPath = `/uploads/${Date.now()}.jpg`;

    await dbx.filesUpload({ path: dropboxPath, contents: buffer });
    const { link: originalUrl } = await dbx.filesGetTemporaryLink({ path: dropboxPath });

    // Step B: Send Dropbox URL to VirtualStagingAI
    const vsaiRes = await fetch("https://api.virtualstagingai.app/v1/render/create", {
      method: "POST",
      headers: {
        Authorization: "Api-Key " + process.env.VSAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: originalUrl,
        room_type,
        style,
        add_virtually_staged_watermark: true,
        wait_for_completion: true,
      }),
    });

    const vsaiData = await vsaiRes.json();
    console.log("VSAI response:", vsaiData);

    if (!vsaiData.result_image_url) {
      return res.status(400).json({ error: "Staging failed", details: vsaiData });
    }

    // Step C: Return only watermarked preview to Wix
    res.status(200).json({
      preview_url: vsaiData.result_image_url,
      message: "Preview ready. Pay to download final image."
    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
}
