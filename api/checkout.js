import Stripe from "stripe";

export function createCheckoutHandler({
  stripeClient,
} = {}) {
  const stripe =
    stripeClient ?? new Stripe(process.env.STRIPE_SECRET_KEY);

  return async function handler(req, res) {
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
    const { amount, currency } = req.body;

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
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: "Stripe checkout failed" });
  }
    };
}

export default createCheckoutHandler();
