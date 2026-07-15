import assert from "node:assert/strict";
import test from "node:test";
import worker, { type WorkerEnvironment } from "./index.js";

function environment(): WorkerEnvironment {
  return {
    ASSETS: {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/index.html" || path === "/") {
          return new Response("<!doctype html><title>Gradient Type Lab</title>", {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
        return new Response("Not found", { status: 404 });
      },
    },
  };
}

test("serves static assets with security headers", async () => {
  const response = await worker.fetch(new Request("https://example.com/"), environment());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(await response.text(), /Gradient Type Lab/);
});

test("falls back to index.html for HTML navigation", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/editor", { headers: { accept: "text/html" } }),
    environment(),
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Gradient Type Lab/);
});

test("preserves a missing response for non-HTML assets", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/missing.svg", { headers: { accept: "image/svg+xml" } }),
    environment(),
  );
  assert.equal(response.status, 404);
});
