function applyCors(res) {
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

function normaliseSiteUrl(siteUrl) {
  if (!siteUrl) {
    return "";
  }

  return siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
}

let stripeModulePromise;
async function loadStripe() {
  if (!stripeModulePromise) {
    stripeModulePromise = import("stripe").then((mod) => mod.default ?? mod);
  }

  return stripeModulePromise;
}

export function createCheckoutHandler({ stripeClient, stripeFactory } = {}) {
  const getStripeClient = async () => {
    if (stripeClient) {
      return stripeClient;
    }

    const factory =
      stripeFactory ??
      (async () => {
        const StripeCtor = await loadStripe();
        return new StripeCtor(process.env.STRIPE_SECRET_KEY, {
          apiVersion: "2023-10-16",
        });
      });

    return factory();
  };

  return async function handler(req, res) {
    applyCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { amount, currency, metadata = {}, customer_email } = req.body || {};

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      typeof currency !== "string" ||
      currency.trim() === ""
    ) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const siteUrl = normaliseSiteUrl(process.env.WIX_SITE_URL);
    if (!siteUrl) {
      return res.status(500).json({ error: "Missing Wix site URL" });
    }

    let client;
    try {
      client = await Promise.resolve(getStripeClient());
    } catch (error) {
      console.error("Stripe client error:", error);
      return res.status(500).json({ error: "Stripe client unavailable" });
    }

    try {
      const session = await client.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: "Virtual Staging Image" },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${siteUrl}/thank-you`,
        cancel_url: `${siteUrl}/cancel`,
        customer_email,
        metadata:
          metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? metadata
            : {},
      });

      return res.status(200).json({ url: session.url });
    } catch (error) {
      console.error("Stripe error:", error);
      return res.status(500).json({ error: "Stripe checkout failed" });
    }
  };
}

const handler = createCheckoutHandler();
export default handler;
