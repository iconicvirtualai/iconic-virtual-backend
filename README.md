+# Iconic Virtual Backend
+
+This repository contains the serverless functions that power the Iconic Virtual experience. Each function lives in the `api/` directory and is intended to be deployed to a Node.js-compatible serverless platform (for example, Vercel or Netlify). The project relies on integrations with Stripe, Wix, Dropbox, and the VSAI API to process payments, manage content, and deliver personalized experiences.
+
+## Getting Started
+
+1. **Install dependencies**
+   ```bash
+   npm install
+   ```
+2. **Configure environment variables** (see [Environment Variables](#environment-variables)).
+3. **Run locally** using your platform's serverless emulator or by invoking the functions directly (for example, `node api/checkout.js`).
+
+## Environment Variables
+
+| Variable | Description | Setup Guidance |
+| --- | --- | --- |
+| `STRIPE_SECRET_KEY` | Used by `api/checkout.js` to authenticate requests to Stripe when creating payment intents and managing transactions. | Create a restricted secret key in the Stripe Dashboard, copy it, and set it in your deployment environment (e.g., `.env` file or platform secrets manager). |
+| `WIX_SITE_URL` | Base URL for your Wix site, allowing functions to fetch or redirect users to Wix-hosted pages. | Retrieve the published site URL from the Wix editor and export it as an environment variable so links resolve correctly. |
+| `DROPBOX_ACCESS_TOKEN` | Provides access to Dropbox APIs for uploading and retrieving media or documents. | Generate a long-lived access token in the Dropbox App Console and store it securely in the environment configuration. |
+| `VSAI_API_KEY` | Authenticates calls to the VSAI API for generating or customizing virtual experiences. | Request an API key from the VSAI dashboard and add it to your deployment secrets to authorize API calls. |
+
+> **Tip:** When running locally, create a `.env.local` (or similar) file and load it with a tool like [`dotenv-cli`](https://www.npmjs.com/package/dotenv-cli) so the functions can read the variables. In production, configure these values through your hosting provider's environment management tools.
+
+## Project Structure
+
+```
+.
+├── api/
+│   ├── checkout.js
+│   └── stage.js
+├── node_modules/
+└── package.json
+```
+
+## Deployment
+
+Deploy the functions using your preferred serverless hosting provider. Ensure the required environment variables are configured before triggering any functions to avoid runtime errors when interacting with external services.
