import test from "node:test";
import assert from "node:assert/strict";
import { ArenaError, client } from "./client";
import { formatJsonError } from "../lib/exit-codes";

// Exercise the middleware with real Response objects and no network or cassette.
process.env.ARENA_VCR_MODE = "off";

for (const { body, status, message } of [
  {
    body: {
      error: "Bad Request",
      details: { message: "No more than 50 blocks permitted" },
    },
    status: 400,
    message: "No more than 50 blocks permitted",
  },
  {
    body: {
      error: "Unprocessable Entity",
      details: { errors: ["Title is required", "Value is invalid"] },
    },
    status: 422,
    message: "Title is required; Value is invalid",
  },
  {
    body: {
      details: { errors: { title: ["is required"], value: "is invalid" } },
    },
    status: 422,
    message: "title: is required; value: is invalid",
  },
  {
    body: { error: { message: "Write budget exhausted" } },
    status: 429,
    message: "Write budget exhausted",
  },
  { body: { error: "Forbidden" }, status: 403, message: "Forbidden" },
]) {
  test(`API errors retain details: ${message}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json(body, { status }),
    );
    await assert.rejects(client.GET("/v3/ping"), (error: unknown) => {
      assert.ok(error instanceof ArenaError);
      assert.equal(error.status, status);
      assert.equal(error.message, message);
      assert.equal(formatJsonError(error).error, message);
      return true;
    });
  });
}

for (const { headers, retryAfter, expectedDelay, expectedReset } of [
  {
    headers: { "Retry-After": "60", "X-RateLimit-Reset": "1700000060" },
    retryAfter: 5,
    expectedDelay: 60_000,
    expectedReset: 1700000060000,
  },
  {
    headers: { "Retry-After": "Tue, 14 Nov 2023 22:14:20 GMT" },
    retryAfter: 5,
    expectedDelay: 60_000,
  },
  { headers: {}, retryAfter: 30, expectedDelay: 30_000 },
  {
    headers: { "X-RateLimit-Reset": "1700000060" },
    expectedReset: 1700000060000,
  },
  { headers: { "Retry-After": "invalid" }, retryAfter: -1 },
]) {
  test(`rate-limit timing: ${JSON.stringify({ headers, retryAfter })}`, async (t) => {
    t.mock.method(Date, "now", () => 1700000000000);
    t.mock.method(globalThis, "fetch", async () =>
      Response.json(
        { error: { message: "Rate limited", retry_after: retryAfter } },
        {
          status: 429,
          headers: { ...headers, "X-RateLimit-Bucket": "write-hour" },
        },
      ),
    );
    await assert.rejects(client.GET("/v3/ping"), (error: unknown) => {
      assert.ok(error instanceof ArenaError);
      assert.equal(error.rateLimit?.retryAfterMs, expectedDelay);
      assert.equal(error.rateLimit?.resetAtMs, expectedReset);
      assert.equal(error.rateLimit?.bucket, "write-hour");
      assert.equal(formatJsonError(error).retry_after_ms, expectedDelay);
      return true;
    });
  });
}

test("non-JSON errors retain the HTTP fallback", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("unavailable", {
        status: 502,
        statusText: "Bad Gateway",
      }),
  );
  await assert.rejects(client.GET("/v3/ping"), /Bad Gateway/);
});
