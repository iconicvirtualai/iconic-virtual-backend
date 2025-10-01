import fetch from "node-fetch";
import Dropbox from "dropbox";

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  console.log("Incoming method:", req.method);
  console.log("Incoming body:", req.body);

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

    const { image_url, room_type, style } = req.body || {};
    if (!image_url || !room_type || !style) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Re-upload original to Dropbox
    const imageRes = await fetch(image_url);
    const imageBuffer = await imageRes.buffer();
    const dbx = new Dropbox.Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN, fetch });
    const uploadPath = `/uploads/${Date.now()}.jpg`;
    await dbx.filesUpload({ path: uploadPath, contents: imageBuffer });
    const { link: dropboxUrl } = await dbx.filesGetTemporaryLink({ path: uploadPath });

    // Call VSAI with Dropbox URL
    const vsaiRes = await fetch("https://api.virtualstagingai.app/v1/render/create", {
      method: "POST",
      headers: {
        Authorization: "Api-Key " + process.env.VSAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: dropboxUrl,
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

    res.status(200).json({
      preview_url: vsaiData.result_image_url,
      message: "Preview ready. Pay to download final image.",
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
}
