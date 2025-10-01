import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStageHandler } from "../api/stage.js";
import { createMockReq, createMockRes } from "./test-utils.js";

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

  it("uploads to Dropbox and requests staging when input is valid", async () => {
    process.env.DROPBOX_ACCESS_TOKEN = "token";
    process.env.VSAI_API_KEY = "vsai";

    const uploadCalls = [];
    const linkCalls = [];
    const fetchCalls = [];

    const handler = createStageHandler({
      dropboxFactory(options) {
        assert.equal(options.accessToken, "token");
        return {
          async filesUpload(args) {
            uploadCalls.push(args);
            return {};
          },
          async sharingCreateSharedLinkWithSettings(args) {
            linkCalls.push(args);
            return { result: { url: "https://dropbox/link?dl=0" } };
          },
        };
      },
      async fetchImpl(url, options) {
        fetchCalls.push({ url, options });
        return {
          async json() {
            return { result_image_url: "https://vsai/result" };
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
    assert.deepEqual(res.body, { preview_url: "https://vsai/result" });

    assert.equal(uploadCalls.length, 1);
    const [uploadArgs] = uploadCalls;
    assert(uploadArgs.contents instanceof Buffer);
    assert(uploadArgs.contents.equals(Buffer.from("foo")));

    assert.equal(linkCalls.length, 1);
    assert.equal(linkCalls[0].path, uploadArgs.path);

    assert.equal(fetchCalls.length, 1);
    const [{ url, options }] = fetchCalls;
    assert.equal(url, "https://api.virtualstagingai.app/v1/render/create");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Authorization"], "Api-Key vsai");
    const parsedBody = JSON.parse(options.body);
    assert.equal(parsedBody.image_url, "https://dropbox/link?raw=1");
    assert.equal(parsedBody.room_type, "living_room");
    assert.equal(parsedBody.style, "scandinavian");
    assert.equal(parsedBody.wait_for_completion, true);
    assert.equal(parsedBody.add_virtually_staged_watermark, true);
  });
});
