+import { describe, it } from "node:test";
+import assert from "node:assert/strict";
+import { createCheckoutHandler } from "../api/checkout.js";
+import { createMockReq, createMockRes } from "./test-utils.js";
+
+describe("checkout handler", () => {
+  it("rejects non-POST methods", async () => {
+    const handler = createCheckoutHandler({
+      stripeClient: {
+        checkout: {
+          sessions: {
+            async create() {
+              throw new Error("stripe should not be called");
+            },
+          },
+        },
+      },
+    });
+
+    const req = createMockReq({ method: "GET" });
+    const res = createMockRes();
+
+    await handler(req, res);
+
+    assert.equal(res.statusCode, 405);
+    assert.deepEqual(res.body, { error: "Method not allowed" });
+  });
+
+  it("supports OPTIONS preflight", async () => {
+    const handler = createCheckoutHandler();
+    const req = createMockReq({ method: "OPTIONS" });
+    const res = createMockRes();
+
+    await handler(req, res);
+
+    assert.equal(res.statusCode, 200);
+    assert.equal(res.ended, true);
+    assert.equal(res.headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
+  });
+
+  it("creates a checkout session when POST data is valid", async () => {
+    process.env.WIX_SITE_URL = "https://example.com";
+
+    const createCalls = [];
+    const handler = createCheckoutHandler({
+      stripeClient: {
+        checkout: {
+          sessions: {
+            async create(payload) {
+              createCalls.push(payload);
+              return { url: "https://stripe-session.test" };
+            },
+          },
+        },
+      },
+    });
+
+    const req = createMockReq({
+      method: "POST",
+      body: { amount: 5000, currency: "usd" },
+    });
+    const res = createMockRes();
+
+    await handler(req, res);
+
+    assert.equal(res.statusCode, 200);
+    assert.deepEqual(res.body, { url: "https://stripe-session.test" });
+    assert.equal(createCalls.length, 1);
+
+    const [payload] = createCalls;
+    assert.equal(payload.line_items[0].price_data.currency, "usd");
+    assert.equal(payload.line_items[0].price_data.unit_amount, 5000);
+    assert.equal(payload.success_url, "https://example.com/thank-you");
+    assert.equal(payload.cancel_url, "https://example.com/cancel");
+  });
+});
