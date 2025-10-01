 import Stripe from "stripe";
 
 const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
 
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
    const { amount, currency, metadata = {}, customer_email } = req.body;

    if (!metadata.job_id || !metadata.dropbox_path || !metadata.image_url) {
      return res.status(400).json({ error: "Missing staging metadata" });
    }
 
     const session = await stripe.checkout.sessions.create({
       payment_method_types: ["card"],
       line_items: [
         {
           price_data: {
             currency: currency,
             product_data: { name: "Virtual Staging Image" },
             unit_amount: amount,
           },
           quantity: 1,
         },
       ],
       mode: "payment",
       success_url: `${process.env.WIX_SITE_URL}/thank-you`,
       cancel_url: `${process.env.WIX_SITE_URL}/cancel`,
      customer_email,
      metadata: {
        job_id: metadata.job_id,
        dropbox_path: metadata.dropbox_path,
        image_url: metadata.image_url,
        room_type: metadata.room_type || "",
        style: metadata.style || ""
      }
     });
 
     res.status(200).json({ url: session.url });
   } catch (err) {
     console.error("Stripe error:", err);
     res.status(500).json({ error: "Stripe checkout failed" });
   }
 }
