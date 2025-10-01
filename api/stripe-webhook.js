import Stripe from "stripe";
import fetch from "node-fetch";
import { Dropbox } from "dropbox";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false
  }
};

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

async function ensureFolder(dropbox, path) {
  const folderPath = path.substring(0, path.lastIndexOf("/"));
  if (!folderPath) return;

  try {
    await dropbox.filesCreateFolderV2({ path: folderPath, autorename: false });
  } catch (error) {
    if (error?.status !== 409) {
      throw error;
    }
  }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Stripe-Signature");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ error: "Missing Stripe signature" });
  }

  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Stripe webhook verification failed", error);
    return res.status(400).json({ error: "Invalid Stripe signature" });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const metadata = session.metadata || {};
  const dropboxPath = metadata.dropbox_path;
  const originalImageUrl = metadata.image_url;
  const roomType = metadata.room_type;
  const style = metadata.style;
  const jobId = metadata.job_id;
  const customerEmail = session.customer_details?.email || session.customer_email || metadata.customer_email;

  if (!dropboxPath || !originalImageUrl) {
    return res.status(400).json({ error: "Missing staging metadata on session" });
  }

  try {
    const vsaiResponse = await fetch("https://api.virtualstagingai.app/v1/render/create", {
      method: "POST",
      headers: {
        "Authorization": `Api-Key ${process.env.VSAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_url: originalImageUrl,
        room_type: roomType,
        style,
        wait_for_completion: true,
        add_virtually_staged_watermark: false
      })
    });

    const vsaiResult = await vsaiResponse.json();

    if (!vsaiResponse.ok || !vsaiResult.result_image_url) {
      console.error("VirtualStagingAI final render failed", vsaiResult);
      return res.status(500).json({ error: "Virtual staging failed", details: vsaiResult });
    }

    const finalImageResponse = await fetch(vsaiResult.result_image_url);

    if (!finalImageResponse.ok) {
      console.error("Failed to download unwatermarked image", vsaiResult.result_image_url);
      return res.status(500).json({ error: "Unable to download final image" });
    }

    const finalArrayBuffer = await finalImageResponse.arrayBuffer();
    const finalBuffer = Buffer.from(finalArrayBuffer);

    const dropbox = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
    let finalPath = dropboxPath.replace(/^\/uploads\//, "/final/");
    if (finalPath === dropboxPath) {
      const normalized = dropboxPath.startsWith("/") ? dropboxPath : `/${dropboxPath}`;
      finalPath = `/final${normalized}`.replace(/\/{2,}/g, "/");
    }

    await ensureFolder(dropbox, finalPath);

    await dropbox.filesUpload({
      path: finalPath,
      contents: finalBuffer,
      mode: { ".tag": "overwrite" },
      autorename: false,
      mute: false
    });

    let secureLink;
    try {
      const link = await dropbox.sharingCreateSharedLinkWithSettings({
        path: finalPath,
        settings: {
          requested_visibility: "password",
          link_password: jobId || session.id
        }
      });
      secureLink = link.result.url;
    } catch (error) {
      if (error?.status === 409) {
        const links = await dropbox.sharingListSharedLinks({ path: finalPath, direct_only: true });
        secureLink = links.result.links?.[0]?.url;
      } else {
        console.warn("Falling back to temporary link", error);
        const tempLink = await dropbox.filesGetTemporaryLink({ path: finalPath });
        secureLink = tempLink.result.link;
      }
    }

    if (customerEmail) {
      try {
        await dropbox.sharingAddFileMember({
          file: finalPath,
          members: [
            {
              member: { ".tag": "email", email: customerEmail },
              access_level: { ".tag": "viewer" }
            }
          ],
          custom_message: `Here is your virtually staged image${jobId ? ` for job ${jobId}` : ""}.`
        });
      } catch (error) {
        console.warn("Unable to add Dropbox file member", error);
      }
    }

    return res.status(200).json({
      status: "completed",
      job_id: jobId,
      final_image_path: finalPath,
      secure_link: secureLink,
      customer_email: customerEmail || null
    });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return res.status(500).json({ error: "Webhook processing failed", details: error.message });
  }
}
