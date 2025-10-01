import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStageHandler } from "../api/stage.js";
import { createMockReq, createMockRes } from "./test-utils.js";

function pick(obj, keys) {
  return keys.reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {});
}

describe("stage handler", () => {
  it("rejects non-POST methods", async () => {
    const handler = createStageHandler({
      fetchImpl() {
        throw new Error("fetch should not be called");
      },
      dropboxFactory() {
        throw new Error("dropbox should not be constructed");
      },
    });

    const req = createMockReq({ method: "GET" });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 405);
    assert.deepEqual(res.body, { error: "Method not allowed" });
  });

  it("validates required body fields", async () => {
    let dropboxCreated = false;
    const handler = createStageHandler({
      dropboxFactory() {
        dropboxCreated = true;
        return {};
      },
    });

    const req = createMockReq({ method: "POST", body: {} });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Missing required fields" });
    assert.equal(dropboxCreated, false);
  });

  it("rejects invalid base64 payloads", async () => {
    const uploadCalls = [];
    const handler = createStageHandler({
      dropboxFactory() {
        return {
          async filesUpload(args) {
            uploadCalls.push(args);
          },
          async sharingCreateSharedLinkWithSettings() {
            return { result: { url: "https://dropbox?dl=0" } };
          },
        };
      },
    });

    const req = createMockReq({
      method: "POST",
      body: {
        image_base64: "data:image/jpeg;base64, ",
        room_type: "bedroom",
        style: "modern",
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Invalid image payload" });
    assert.equal(uploadCalls.length, 0);
  });

  it("uploads to Dropbox, stores preview, and requests staging when input is valid", async () => {
    process.env.DROPBOX_ACCESS_TOKEN = "token";
    process.env.VSAI_API_KEY = "vsai";

    const uploadCalls = [];
    const linkCalls = [];
    const fetchCalls = [];

    const handler = createStageHandler({
      idGenerator: () => "123",
      dropboxFactory(options) {
        assert.equal(options.accessToken, "token");
        return {
          async filesUpload(args) {
            uploadCalls.push(args);
            return {};
          },
          async sharingCreateSharedLinkWithSettings(args) {
            linkCalls.push(args);
            if (args.path.includes("preview")) {
              return { result: { url: "https://dropbox/preview?dl=0" } };
            }

            return { result: { url: "https://dropbox/original?dl=0" } };
          },
          async sharingListSharedLinks() {
            return { result: { links: [] } };
          },
        };
      },
      async fetchImpl(url, options) {
        fetchCalls.push({ url, options });
        if (url === "https://api.virtualstagingai.app/v1/render/create") {
          return {
            ok: true,
            async json() {
              return {
                result_image_url: "https://vsai/result",
                render_id: "render-1",
              };
            },
          };
        }

        return {
          ok: true,
          async arrayBuffer() {
            return new TextEncoder().encode("preview").buffer;
          },
        };
      },
    });

    const req = createMockReq({
      method: "POST",
      body: {
        image_base64: "data:image/jpeg;base64,Zm9v",
        room_type: "living_room",
        style: "scandinavian",
      },
    });
    const res = createMockRes();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.preview_url, "https://dropbox/preview?raw=1");
    assert.equal(res.body.preview_vsai_url, "https://vsai/result");
    assert.deepEqual(
      pick(res.body, [
        "job_id",
        "render_id",
        "dropbox_path",
        "preview_dropbox_path",
        "image_url",
        "room_type",
        "style",
      ]),
      {
        job_id: "job_123",
        render_id: "render-1",
        dropbox_path: "/renders/job_123/original.jpg",
        preview_dropbox_path: "/renders/job_123/preview.jpg",
        image_url: "https://dropbox/original?raw=1",
        room_type: "living_room",
        style: "scandinavian",
      },
    );

    assert.equal(uploadCalls.length, 2);
    const [originalUpload, previewUpload] = uploadCalls;
    assert(originalUpload.contents instanceof Buffer);
    assert(originalUpload.contents.equals(Buffer.from("foo")));
    assert.equal(originalUpload.path, "/renders/job_123/original.jpg");

    assert(previewUpload.contents instanceof Buffer);
    assert(previewUpload.contents.equals(Buffer.from("preview")));
    assert.equal(previewUpload.path, "/renders/job_123/preview.jpg");

    assert.equal(linkCalls.length, 2);
    assert.equal(linkCalls[0].path, originalUpload.path);
    assert.equal(linkCalls[1].path, previewUpload.path);

    assert.equal(fetchCalls.length, 2);
    const [{ url, options }] = fetchCalls;
    assert.equal(url, "https://api.virtualstagingai.app/v1/render/create");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Authorization"], "Api-Key vsai");
    const parsedBody = JSON.parse(options.body);
    assert.equal(parsedBody.image_url, "https://dropbox/original?raw=1");
    assert.equal(parsedBody.room_type, "living_room");
    assert.equal(parsedBody.style, "scandinavian");
    assert.equal(parsedBody.wait_for_completion, true);
    assert.equal(parsedBody.add_virtually_staged_watermark, true);
  });
});
