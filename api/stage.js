import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";
import Dropbox from "dropbox";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Use formidable's new async API
    const form = formidable({ multiples: false });
    const [fields, files] = await form.parse(req);

    const roomType = fields.room_type[0];
    const style = fields.style[0];
    const filePath = files.file[0].filepath;
    const originalName = files.file[0].originalFilename;

    const apiUrl = `https://api.virtualstagingai.app/v1/render/create?room_type=${roomType}&style=${style}&add_virtually_staged_watermark=true&wait_for_completion=true`;

    // Call VirtualStagingAI
    const vsaiRes = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: "Api-Key " + process.env.VSAI_API_KEY },
      body: fs.createReadStream(filePath),
    });

    const vsaiData = await vsaiRes.json();

    if (!vsaiData.result_image_url) {
      return res.status(400).json({ error: "Staging failed", details: vsaiData });
    }

    // Download finished image
    const imageBuffer = await fetch(vsaiData.result_image_url).then(r => r.buffer());

    // Upload to Dropbox
    const dbx = new Dropbox.Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN, fetch });
    const dropboxPath = `/renders/${Date.now()}_${originalName}`;
    await dbx.filesUpload({ path: dropboxPath, contents: imageBuffer });

    // Get temporary Dropbox link
    const { link } = await dbx.filesGetTemporaryLink({ path: dropboxPath });

    res.json({
      preview_url: vsaiData.result_image_url,
      download_url: link
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
}
