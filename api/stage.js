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

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: "File parsing failed" });

    const roomType = fields.room_type;
    const style = fields.style;

    const apiUrl = `https://api.virtualstagingai.app/v1/render/create?room_type=${roomType}&style=${style}&add_virtually_staged_watermark=true&wait_for_completion=true`;

    try {
      // Call VirtualStagingAI
      const vsaiRes = await fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: "Api-Key " + process.env.VSAI_API_KEY },
        body: fs.createReadStream(files.file.filepath),
      });

      const vsaiData = await vsaiRes.json();

      if (!vsaiData.result_image_url) {
        return res.status(400).json({ error: "Staging failed", details: vsaiData });
      }

      // Download finished image
      const imageBuffer = await fetch(vsaiData.result_image_url).then(r => r.buffer());

      // Upload to Dropbox
      const dbx = new Dropbox.Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN, fetch });
      const dropboxPath = `/renders/${Date.now()}_${files.file.originalFilename}`;
      await dbx.filesUpload({ path: dropboxPath, contents: imageBuffer });

      // Temporary Dropbox link
      const { link } = await dbx.filesGetTemporaryLink({ path: dropboxPath });

      res.json({
        preview_url: vsaiData.result_image_url, // show this in Wix
        download_url: link // keep hidden until Stripe payment
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Something went wrong" });
    }
  });
}
