import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createPingHandler } from "../api/ping.js";
import { createRenderCreateHandler } from "../api/render-create.js";
import { createRenderHandler } from "../api/render.js";
import { createRenderVariationHandler } from "../api/render-create-variation.js";
import { createOptionsHandler } from "../api/options.js";
import { createMockReq, createMockRes } from "./test-utils.js";

describe("VSAI proxy handlers", () => {
  describe("ping", () => {
    it("rejects non-GET methods", async () => {
      const handler = createPingHandler();
      const req = createMockReq({ method: "POST" });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 405);
      assert.deepEqual(res.body, { error: "Method not allowed" });
    });

    it("requires an API key", async () => {
      let called = false;
      const handler = createPingHandler({
        fetchImpl: async () => {
          called = true;
          return {
            ok: true,
            status: 200,
            async text() {
              return "{}";
            },
          };
        },
      });

      const req = createMockReq({ method: "GET" });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: "Missing Virtual Staging API key" });
      assert.equal(called, false);
    });

    it("returns the upstream response when successful", async () => {
      process.env.VSAI_API_KEY = "test-key";
      const handler = createPingHandler({
        fetchImpl: async (url, options) => {
          assert.equal(url, "https://api.virtualstagingai.app/v1/ping");
          assert.equal(options.method, "GET");
          assert.equal(options.headers.Authorization, "Api-Key test-key");

          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ userObj: { email: "user@example.com" } });
            },
          };
        },
      });

      const req = createMockReq({ method: "GET" });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { userObj: { email: "user@example.com" } });

      delete process.env.VSAI_API_KEY;
    });
  });

  describe("render/create", () => {
    it("rejects non-POST methods", async () => {
      const handler = createRenderCreateHandler();
      const req = createMockReq({ method: "GET" });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 405);
      assert.deepEqual(res.body, { error: "Method not allowed" });
    });

    it("requires an API key", async () => {
      let called = false;
      const handler = createRenderCreateHandler({
        fetchImpl: async () => {
          called = true;
          return {
            ok: true,
            status: 200,
            async text() {
              return "{}";
            },
          };
        },
      });

      const req = createMockReq({ method: "POST", body: {} });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: "Missing Virtual Staging API key" });
      assert.equal(called, false);
    });

    it("forwards payloads to the VSAI API", async () => {
      process.env.VSAI_API_KEY = "render-key";

      const handler = createRenderCreateHandler({
        fetchImpl: async (url, options) => {
          assert.equal(url, "https://api.virtualstagingai.app/v1/render/create");
          assert.equal(options.method, "POST");
          assert.equal(options.headers.Authorization, "Api-Key render-key");
          assert.equal(options.headers["Content-Type"], "application/json");

          const body = JSON.parse(options.body);
          assert.deepEqual(body, {
            image_url: "https://example.com/image.jpg",
            room_type: "living",
            style: "modern",
          });

          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ render_id: "abc" });
            },
          };
        },
      });

      const req = createMockReq({
        method: "POST",
        body: {
          image_url: "https://example.com/image.jpg",
          room_type: "living",
          style: "modern",
        },
      });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { render_id: "abc" });

      delete process.env.VSAI_API_KEY;
    });
  });

  describe("render lookup", () => {
    it("requires a render_id", async () => {
      process.env.VSAI_API_KEY = "lookup-key";
      const handler = createRenderHandler();
      const req = createMockReq({ method: "GET", query: {} });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: "Missing render_id" });

      delete process.env.VSAI_API_KEY;
    });

    it("proxies requests to the render endpoint", async () => {
      process.env.VSAI_API_KEY = "lookup-key";
      const handler = createRenderHandler({
        fetchImpl: async (url, options) => {
          assert.equal(url, "https://api.virtualstagingai.app/v1/render?render_id=xyz");
          assert.equal(options.method, "GET");
          assert.equal(options.headers.Authorization, "Api-Key lookup-key");

          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ render_id: "xyz", status: "done" });
            },
          };
        },
      });

      const req = createMockReq({ method: "GET", query: { render_id: "xyz" } });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { render_id: "xyz", status: "done" });

      delete process.env.VSAI_API_KEY;
    });
  });

  describe("render variation", () => {
    it("requires a render_id", async () => {
      process.env.VSAI_API_KEY = "variation-key";
      const handler = createRenderVariationHandler();
      const req = createMockReq({ method: "POST", query: {} });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.body, { error: "Missing render_id" });

      delete process.env.VSAI_API_KEY;
    });

    it("sends the variation request upstream", async () => {
      process.env.VSAI_API_KEY = "variation-key";
      const handler = createRenderVariationHandler({
        fetchImpl: async (url, options) => {
          assert.equal(
            url,
            "https://api.virtualstagingai.app/v1/render/create-variation?render_id=xyz",
          );
          assert.equal(options.method, "POST");
          assert.equal(options.headers.Authorization, "Api-Key variation-key");
          assert.equal(options.headers["Content-Type"], "application/json");

          const body = JSON.parse(options.body);
          assert.deepEqual(body, { wait_for_completion: false });

          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ render_id: "xyz" });
            },
          };
        },
      });

      const req = createMockReq({
        method: "POST",
        query: { render_id: "xyz" },
        body: { wait_for_completion: false },
      });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { render_id: "xyz" });

      delete process.env.VSAI_API_KEY;
    });
  });

  describe("options", () => {
    it("proxies the options call", async () => {
      process.env.VSAI_API_KEY = "options-key";
      const handler = createOptionsHandler({
        fetchImpl: async (url, options) => {
          assert.equal(url, "https://api.virtualstagingai.app/v1/options");
          assert.equal(options.method, "GET");
          assert.equal(options.headers.Authorization, "Api-Key options-key");

          return {
            ok: true,
            status: 200,
            async text() {
              return JSON.stringify({ styles: ["modern"], roomTypes: ["living"] });
            },
          };
        },
      });

      const req = createMockReq({ method: "GET" });
      const res = createMockRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { styles: ["modern"], roomTypes: ["living"] });

      delete process.env.VSAI_API_KEY;
    });
  });
});
