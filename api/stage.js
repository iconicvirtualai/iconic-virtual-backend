import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { image_url, room_type, style } = req.body;

    if (!image_url || !room_type || !style) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const vsaiResponse = await fetch("https://api.virtualstagingai.app/v1/render/create", {
      method: "POST",
      headers: {
        "Authorization": "Api-Key vsai-pk-7b20fcd7-b0f8-44d8-89d1-8d07a9c066ba",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_url,
        room_type,
        style,
        wait_for_completion: true,
        add_virtually_staged_watermark: true
      })
    });

    const data = await vsaiResponse.json();

    if (!vsaiResponse.ok) {
      console.error("VSAI error:", data);
      return res.status(vsaiResponse.status).json({ error: "VSAI request failed", details: data });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Failed to process image" });
  }
}
