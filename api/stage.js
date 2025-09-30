import fetch from "node-fetch";
import Dropbox from "dropbox";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Use req.body directly (Vercel auto-parses JSON if Content-Type is application/json)
    const { image_url, room_type, style } = req.body;

    if (!image_url || !room_type || !style) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const apiUrl = "https://api.virtualstagingai.app/v1/render/create";

    // Call VirtualStagingAI with image URL
    const vsaiRes = await fetch(apiUrl, {
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

    // Download staged image
    const imageBuffer = await fetch(vsaiData.result_image_url).then(r => r.buffer());

    // Upload to Dropbox
    const dbx = new Dropbox.Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN, fetch });
    const dropboxPath = `/renders/${Date.now()}.jpg`;
    await dbx.filesUpload({ path: dropboxPath, contents: imageBuffer });

    const { link } = await dbx.filesGetTemporaryLink({ path: dropboxPath });

    res.json({
      preview_url: vsaiData.result_image_url,
      download_url: link,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
}
