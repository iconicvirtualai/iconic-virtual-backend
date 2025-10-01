import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFinalizeHandler } from "../api/finalize.js";
import { createMockReq, createMockRes } from "./test-utils.js";

describe("finalize handler", () => {
  it("rejects non-POST methods", async () => {
    const handler = createFinalizeHandler({
      fetchImpl() {
        throw new Error("fetch should not be used");
      },
      dropboxFactory() {
        throw new Error("dropbox should not be used");
      },
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 405);
  });

  it("requires render_id and job_id", async () => {
    const handler = createFinalizeHandler();
    const req = createMockReq({ method: "POST", body: {} });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Missing render_id or job_id" });
  });

  it("creates an unwatermarked Dropbox asset", async () => {
    process.env.DROPBOX_ACCESS_TOKEN = "dropbox";
    process.env.VSAI_API_KEY = "vsai";

    const uploadCalls = [];
    const linkCalls = [];
    const fetchCalls = [];

    const handler = createFinalizeHandler({
      dropboxFactory(options) {
        assert.equal(options.accessToken, "dropbox");
        return {
          async filesUpload(args) {
            uploadCalls.push(args);
            return {};
          },
          async sharingCreateSharedLinkWithSettings(args) {
            linkCalls.push(args);
            return { result: { url: "https://dropbox/final?dl=0" } };
          },
          async sharingListSharedLinks() {
            return { result: { links: [] } };
          },
        };
      },
      async fetchImpl(url, options) {
        fetchCalls.push({ url, options });
        if (url === "https://api.virtualstagingai.app/v1/render/create-variation") {
          return {
            ok: true,
            async text() {
              return JSON.stringify({
                result_image_url: "https://vsai/final",
                render_id: "render-variation",
              });
            },
            async json() {
              return {
                result_image_url: "https://vsai/final",
                render_id: "render-variation",
              };
            },
          };
        }

        return {
          ok: true,
          async text() {
            return "";
          },
          async arrayBuffer() {
            return new TextEncoder().encode("final").buffer;
          },
        };
      },
    });

    const req = createMockReq({
      method: "POST",
      body: {
        render_id: "render-original",
        job_id: "job_123",
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      job_id: "job_123",
      render_id: "render-variation",
      download_url: "https://dropbox/final?raw=1",
      download_dropbox_path: "/renders/job_123/final.jpg",
      vsai_result_url: "https://vsai/final",
    });

    assert.equal(uploadCalls.length, 1);
    const [uploadArgs] = uploadCalls;
    assert.equal(uploadArgs.path, "/renders/job_123/final.jpg");
    assert(uploadArgs.contents instanceof Buffer);
    assert(uploadArgs.contents.equals(Buffer.from("final")));

    assert.equal(linkCalls.length, 1);
    assert.equal(linkCalls[0].path, uploadArgs.path);

    assert.equal(fetchCalls.length, 2);
    const [variationCall] = fetchCalls;
    assert.equal(variationCall.url, "https://api.virtualstagingai.app/v1/render/create-variation");
    assert.equal(variationCall.options.method, "POST");
    assert.equal(variationCall.options.headers["Authorization"], "Api-Key vsai");
    const parsedBody = JSON.parse(variationCall.options.body);
    assert.equal(parsedBody.render_id, "render-original");
    assert.equal(parsedBody.wait_for_completion, true);
    assert.equal(parsedBody.add_virtually_staged_watermark, false);
  });
});
