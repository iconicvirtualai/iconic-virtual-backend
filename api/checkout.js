import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_LOOKUP = {
  "virtual-staging-image": process.env.STRIPE_VIRTUAL_STAGING_PRICE_ID,
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    
    const { productId } = req.body;

    if (typeof productId !== "string" || productId.trim() === "") {
      return res.status(400).json({ error: "Invalid product selection" });
    }

    if (!(productId in PRICE_LOOKUP)) {
      return res.status(400).json({ error: "Unsupported product" });
    }

    const priceId = PRICE_LOOKUP[productId];

    if (typeof priceId !== "string" || priceId.trim() === "") {
      console.error("Missing Stripe price ID for product", productId);
      return res.status(500).json({ error: "Configuration error" });
    }
  }

  try {
    const { amount, currency } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.WIX_SITE_URL}/thank-you`,
      cancel_url: `${process.env.WIX_SITE_URL}/cancel`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: "Stripe checkout failed" });
  }
}
