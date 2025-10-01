import fetch from "node-fetch";

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

    if (!image_base64) {
      return res.status(400).json({ error: "Missing image data" });
    }

    // Upload to Dropbox
    const uploadResponse = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": "Bearer sl.u.AGAoHZ8Q_OjZxENIMN1KzxqOevhyrvkMlKgWINsa8at_bJBLfbhe2GkGjt5uDkEkDeNuviE3D9SZf3RDOQgQA0LminhzhHcsnzDmNe72aKnRFUpXoKNhR41zku3iOoAxZbGh6v_Bj21FngcF8oRTrISL696ZI-TgiK2Q12VtoauLrtv4UCZGfew1vC5YeEVe6-J67q6KNM2fwt7uVN37tWexBkkDxDgXBgbnKBD8UOYNnjt5nbjjEsGwgnES4-03yZv-WQta7TFn_zP7aGtlhCgen3bvC_TTIlxb9fqlFE4GFdTs5U4YgDZf2GN7Hw4jCDAHySkZfWT1UmgkYoskMmnZVL2blt4Cemmq6QvFZKc6Pxjj_Wjza9CljxMwj7C74LPjpsGreUZqtMl9ZhA7gDsAcKCIFrAShT0pB0ZzqqcP9OoCQMQkhLhiJrwJ8SwW2pBMUOXrr1Tq_tRaB3kzFZqSx1OJkd9GGLaCqzEkpoQdFQUo27UnX2SWfquzHiOAxAiqMC_ZMHauBI8Efu-S2ix1-4Y9P1Q7eHjb-2-O4OeNzXR5YXTo3zw9fxeV8VaBPR1SBus2qZ0WI17gYdJ5RgQHzVfYqVLPmHa9nOgCyiBmn_VnJWXHC5fU9qo0Da8UOzAOn7qC0_3BZaY00I7s_1Tu7PkVZmyks0o2y7jIGHHQCPVhc99penWzKPR8A_7tVEuevRpLtXnhSfVSrnPvY4qC0vkjil6MJhav3aKaDgSgMkpOBo0YYc6shAs4EDO_YA_vrH37Hi3jQhbKYlY80E_wOjVAtrvgGZVn2dPQD8AAApBNy05bxuwiyEwGXL4ZxZZoOE0y9MK0aoP8JONWd8aiOD3l9RcusLwQZX2yg5p2aeaLwfgaXNd4h-dWEVqp1xV_j30bFfN2rsKDJDR9Ifj3A6eq6wurSJkF9_X_CeKJJnE_o76RLdla8Jgv0QEM0dCIYKxiuzZroGzcyB-JIwVkBom9rfbTt_ffU9-Tr9O8yBcBGEBzeTq4YYoAJKaStnK6tRPUXgw09PWY98sa1oMLlQN9QZLDSup96ZrQQahPPq7-GNn2bCiBafiduRkJxK8Ey-JIG8K6yL-hInIT5k7fpGS-Y9vYpyhrSyINExzW7OsIb5HqRD960BXw6UQzcL3PxuyrFOsmyQroOEh3sDV6LEFZeZtLFBEIZBYPifY4T38dzaed6e_deM35cGMoYj_Q2GehwCw9icRJ3W8iZROfnQr5n9Vp40rgPxwArVEWy14PEiH62woOhpcZXBhLbsqWGSJPDl3x4gEEpJK-g0Nws5BXaA1WWTGx6VwPY2odUvv5J9F_gRCqaRq7q-Ey1-g5_LtH2jb0-lpX1JiRTMsSFGCUBy5J7vumu98-u6EAzw",
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: `/uploads/${Date.now()}.png`,
          mode: "add",
          autorename: true,
          mute: false
        })
      },
      body: Buffer.from(image_base64.split(",")[1], "base64")
    });

    const uploadResult = await uploadResponse.json();

    if (uploadResult.error) {
      return res.status(500).json({ error: uploadResult.error_summary });
    }

    const dropboxPath = uploadResult.path_display;

    // Temporary preview URL
    const previewUrl = `https://content.dropboxapi.com/2/files/download?path=${dropboxPath}`;

    return res.status(200).json({ preview_url: previewUrl });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
