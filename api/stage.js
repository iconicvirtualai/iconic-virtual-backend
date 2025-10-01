 import fetch from "node-fetch";
 import { Dropbox } from "dropbox";
 
 export default async function handler(req, res) {
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

    if (typeof image_base64 !== "string") {
      return res.status(400).json({ error: "Invalid image payload" });
    }

    const commaIndex = image_base64.indexOf(",");
    const rawPayload = commaIndex !== -1 ? image_base64.slice(commaIndex + 1) : image_base64;
    const base64Payload = rawPayload ? rawPayload.trim() : "";

    if (!base64Payload) {
      return res.status(400).json({ error: "Invalid image payload" });
    }

    const sanitizedPayload = base64Payload.replace(/\s/g, "");

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(sanitizedPayload)) {
      return res.status(400).json({ error: "Invalid image payload" });
    }

    let fileBuffer;

    try {
      fileBuffer = Buffer.from(sanitizedPayload, "base64");
    } catch (decodeError) {
      return res.status(400).json({ error: "Invalid image payload" });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: "Invalid image payload" });
    }

    // === Upload to Dropbox ===
    const dropbox = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
    const jobId = `job_${Date.now()}`;
    const fileName = `/uploads/${jobId}.jpg`;

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
     const vsaiResponse = await fetch("https://api.virtualstagingai.app/v1/render/create", {
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
      return res.status(200).json({
        preview_url: vsaiResult.result_image_url,
        job_id: jobId,
        dropbox_path: fileName,
        image_url: imageUrl,
        room_type,
        style
      });
     } else {
       return res.status(500).json({ error: "Staging failed", details: vsaiResult });
     }
   } catch (error) {
     console.error("Server error:", error);
     return res.status(500).json({ error: "Server error", details: error.message });
   }
 }
