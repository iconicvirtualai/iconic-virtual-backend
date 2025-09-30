import fetch from "node-fetch";
import Dropbox from "dropbox";

export default async function handler(req, res) {
console.log("Incoming method:", req.method);
console.log("Incoming body:", req.body);  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { image_url, room_type, style } = req.body || {};

    if (!image_url || !room_type || !style) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Call VirtualStagingAI API
    const vsaiRes = await fetch("https://api.virtualstagingai.app/v1/render/create", {
      method: "POST",
      headers: {
        Authorization: "Api-Key " + process.env.VSAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url,
        room_type,
        style,
        add_virtually_staged_watermark: true,
        wait_for_completion: true,
      }),
    });

    const vsaiData = await vsaiRes.json();

    if (!vsaiData.result_image_url) {
      return res.status(400).json({ error: "Staging failed", details: vsaiData });
    }

    // Upload staged image to Dropbox
    const imageBuffer = await fetch(vsaiData.result_image_url).then(r => r.buffer());
    const dbx = new Dropbox.Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN, fetch });
    const dropboxPath = `/renders/${Date.now()}.jpg`;
    await dbx.filesUpload({ path: dropboxPath, contents: imageBuffer });

    const { link } = await dbx.filesGetTemporaryLink({ path: dropboxPath });

    res.status(200).json({
      preview_url: vsaiData.result_image_url,
      download_url: link,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
}
