import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArenaError } from "../api/client";
import { parseImportOptions } from "../commands/import";
import {
  chunkItems,
  discoverImportFiles,
  executeImport,
  importExitCode,
  type ImportAdapter,
  type ImportEvent,
  type ImportFile,
} from "./import";

test("discoverImportFiles defaults to top-level files only", async () => {
  const root = await mkdtemp(join(tmpdir(), "arena-import-"));

  try {
    await writeFile(join(root, "b.txt"), "b");
    await writeFile(join(root, "a.txt"), "a");
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "c.txt"), "c");

    const files = await discoverImportFiles(root, false);
    assert.deepEqual(
      files.map((file) => file.relativePath),
      ["a.txt", "b.txt"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discoverImportFiles supports recursive mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "arena-import-"));

  try {
    await writeFile(join(root, "b.txt"), "b");
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "a.txt"), "a");

    const files = await discoverImportFiles(root, true);
    assert.deepEqual(
      files.map((file) => file.relativePath),
      ["b.txt", "nested/a.txt"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("chunkItems splits input by chunk size", () => {
  assert.deepEqual(chunkItems([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkItems([], 3), []);
});

test("executeImport handles success path and emits terminal completed event", async () => {
  const files: ImportFile[] = [
    { absolutePath: "/tmp/a.txt", relativePath: "a.txt" },
    { absolutePath: "/tmp/b.txt", relativePath: "b.txt" },
  ];

  const calls: string[] = [];
  const statusCalls = new Map<string, number>();

  const adapter: ImportAdapter = {
    async uploadFile(file) {
      calls.push(`upload:${file.relativePath}`);
      return { s3Url: `https://s3/${file.relativePath}` };
    },
    async submitBatch(_channel, blocks) {
      calls.push(`submit:${blocks.length}`);
      return { batch_id: "batch-1" };
    },
    async getBatchStatus(batchId) {
      const count = (statusCalls.get(batchId) ?? 0) + 1;
      statusCalls.set(batchId, count);
      if (count === 1) {
        return {
          batch_id: batchId,
          status: "processing",
          total: 2,
          successful_count: 1,
          failed_count: 0,
        };
      }
      return {
        batch_id: batchId,
        status: "completed",
        total: 2,
        successful_count: 2,
        failed_count: 0,
      };
    },
    async sleep() {
      calls.push("sleep");
    },
  };

  const events: ImportEvent[] = [];

  const summary = await executeImport({
    channel: "test-channel",
    directory: ".",
    recursive: false,
    batchSize: 50,
    uploadConcurrency: 1,
    pollIntervalMs: 1,
    adapter,
    discover: async () => files,
    onEvent(event) {
      events.push(event);
    },
  });

  assert.equal(summary.discovered, 2);
  assert.equal(summary.selected, 2);
  assert.equal(summary.uploaded, 2);
  assert.equal(summary.upload_failed, 0);
  assert.equal(summary.batch_successful, 2);
  assert.equal(summary.batch_failed, 0);
  assert.equal(importExitCode(summary), 0);

  assert.deepEqual(
    events.slice(0, 3).map((event) => event.type),
    ["discover_started", "discover_completed", "selection_completed"],
  );
  assert.equal(events.at(-1)?.type, "completed");
  assert.ok(
    calls.includes("sleep"),
    "expected polling sleep before completion",
  );
});

test("executeImport captures upload and batch failures", async () => {
  const files: ImportFile[] = [
    { absolutePath: "/tmp/a.txt", relativePath: "a.txt" },
    { absolutePath: "/tmp/b.txt", relativePath: "b.txt" },
    { absolutePath: "/tmp/c.txt", relativePath: "c.txt" },
  ];

  const adapter: ImportAdapter = {
    async uploadFile(file) {
      if (file.relativePath === "b.txt") {
        throw new Error("network");
      }
      return { s3Url: `https://s3/${file.relativePath}` };
    },
    async submitBatch() {
      return { batch_id: "batch-1" };
    },
    async getBatchStatus(batchId) {
      return {
        batch_id: batchId,
        status: "completed",
        total: 2,
        successful_count: 1,
        failed_count: 1,
        failed: [{ index: 1, error: "unprocessable" }],
      };
    },
    async sleep() {},
  };

  const summary = await executeImport({
    channel: "test-channel",
    directory: ".",
    recursive: false,
    batchSize: 50,
    uploadConcurrency: 1,
    pollIntervalMs: 1,
    adapter,
    discover: async () => files,
  });

  assert.equal(summary.uploaded, 2);
  assert.equal(summary.upload_failed, 1);
  assert.equal(summary.batch_successful, 1);
  assert.equal(summary.batch_failed, 1);
  assert.equal(summary.upload_failures[0]?.file, "b.txt");
  assert.equal(summary.batch_failures[0]?.file, "c.txt");
  assert.equal(importExitCode(summary), 1);
});

test("executeImport retries transient upload failures", async () => {
  const files: ImportFile[] = [
    { absolutePath: "/tmp/retry.txt", relativePath: "retry.txt" },
  ];
  let uploadAttempts = 0;
  let sleepCalls = 0;

  const adapter: ImportAdapter = {
    async uploadFile(file) {
      uploadAttempts += 1;
      if (uploadAttempts < 3) {
        throw new Error("fetch failed");
      }
      return { s3Url: `https://s3/${file.relativePath}` };
    },
    async submitBatch() {
      return { batch_id: "batch-1" };
    },
    async getBatchStatus(batchId) {
      return {
        batch_id: batchId,
        status: "completed",
        total: 1,
        successful_count: 1,
        failed_count: 0,
      };
    },
    async sleep() {
      sleepCalls += 1;
    },
  };

  const summary = await executeImport({
    channel: "test-channel",
    directory: ".",
    recursive: false,
    batchSize: 50,
    uploadConcurrency: 1,
    pollIntervalMs: 1,
    adapter,
    discover: async () => files,
  });

  assert.equal(uploadAttempts, 3);
  assert.ok(sleepCalls >= 2);
  assert.equal(summary.uploaded, 1);
  assert.equal(summary.upload_failed, 0);
  assert.equal(importExitCode(summary), 0);
});

test("executeImport tolerates transient batch status errors", async () => {
  const files: ImportFile[] = [
    { absolutePath: "/tmp/a.txt", relativePath: "a.txt" },
  ];
  let statusAttempts = 0;
  let sleepCalls = 0;

  const adapter: ImportAdapter = {
    async uploadFile(file) {
      return { s3Url: `https://s3/${file.relativePath}` };
    },
    async submitBatch() {
      return { batch_id: "batch-1" };
    },
    async getBatchStatus(batchId) {
      statusAttempts += 1;
      if (statusAttempts < 3) {
        throw new Error("network timeout");
      }
      return {
        batch_id: batchId,
        status: "completed",
        total: 1,
        successful_count: 1,
        failed_count: 0,
      };
    },
    async sleep() {
      sleepCalls += 1;
    },
  };

  const summary = await executeImport({
    channel: "test-channel",
    directory: ".",
    recursive: false,
    batchSize: 50,
    uploadConcurrency: 1,
    pollIntervalMs: 1,
    adapter,
    discover: async () => files,
  });

  assert.equal(statusAttempts, 3);
  assert.ok(sleepCalls >= 2);
  assert.equal(summary.batch_successful, 1);
  assert.equal(summary.batch_failed, 0);
  assert.equal(importExitCode(summary), 0);
});

test("executeImport rejects oversized batch size before discovery or upload", async () => {
  let discovered = false;
  let uploaded = false;

  const adapter: ImportAdapter = {
    async uploadFile(file) {
      uploaded = true;
      return { s3Url: `https://s3/${file.relativePath}` };
    },
    async submitBatch() {
      return { batch_id: "batch-1" };
    },
    async getBatchStatus(batchId) {
      return {
        batch_id: batchId,
        status: "completed",
        total: 1,
        successful_count: 1,
        failed_count: 0,
      };
    },
    async sleep() {},
  };

  await assert.rejects(
    executeImport({
      channel: "test-channel",
      directory: ".",
      recursive: false,
      batchSize: 51,
      uploadConcurrency: 1,
      pollIntervalMs: 1,
      adapter,
      discover: async () => {
        discovered = true;
        return [{ absolutePath: "/tmp/a.txt", relativePath: "a.txt" }];
      },
    }),
    /permits at most 50/,
  );

  assert.equal(discovered, false);
  assert.equal(uploaded, false);
});

test("executeImport does not retry ambiguous batch submission failures", async () => {
  const files: ImportFile[] = [
    { absolutePath: "/tmp/a.txt", relativePath: "a.txt" },
  ];
  let submitAttempts = 0;

  const adapter: ImportAdapter = {
    async uploadFile(file) {
      return { s3Url: `https://s3/${file.relativePath}` };
    },
    async submitBatch() {
      submitAttempts += 1;
      throw new ArenaError("response lost after write", 500);
    },
    async getBatchStatus() {
      throw new Error("status should not be checked");
    },
    async sleep() {},
  };

  await assert.rejects(
    executeImport({
      channel: "test-channel",
      directory: ".",
      recursive: false,
      batchSize: 50,
      uploadConcurrency: 1,
      pollIntervalMs: 1,
      adapter,
      discover: async () => files,
    }),
    /response lost after write/,
  );

  assert.equal(submitAttempts, 1);
});

test("executeImport honors Retry-After for upload rate limits", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const files: ImportFile[] = [
    { absolutePath: "/tmp/rate-limited.txt", relativePath: "rate-limited.txt" },
  ];
  const sleepCalls: number[] = [];
  let uploadAttempts = 0;

  const adapter: ImportAdapter = {
    async uploadFile(file) {
      uploadAttempts += 1;
      if (uploadAttempts === 1) {
        throw new ArenaError("write rate limit exceeded", 429, {
          rateLimit: { retryAfterMs: 1_200 },
        });
      }
      return { s3Url: `https://s3/${file.relativePath}` };
    },
    async submitBatch() {
      return { batch_id: "batch-1" };
    },
    async getBatchStatus(batchId) {
      return {
        batch_id: batchId,
        status: "completed",
        total: 1,
        successful_count: 1,
        failed_count: 0,
      };
    },
    async sleep(ms) {
      sleepCalls.push(ms);
      now += ms;
    },
  };

  const summary = await executeImport({
    channel: "test-channel",
    directory: ".",
    recursive: false,
    batchSize: 50,
    uploadConcurrency: 1,
    pollIntervalMs: 1,
    adapter,
    discover: async () => files,
  });

  assert.equal(uploadAttempts, 2);
  assert.ok(sleepCalls.includes(1_200));
  assert.equal(summary.upload_failed, 0);
});

test("batch submission retries only explicit rate-limit rejections", async () => {
  const sleeps: number[] = [];
  let submissions = 0;
  const summary = await executeImport({
    channel: "test",
    directory: ".",
    recursive: false,
    batchSize: 50,
    uploadConcurrency: 1,
    pollIntervalMs: 1,
    selectedFiles: [{ absolutePath: "/mock/a", relativePath: "a" }],
    adapter: {
      uploadFile: async () => ({ s3Url: "https://example.com/a" }),
      submitBatch: async () => {
        submissions++;
        if (submissions === 1)
          throw new ArenaError("rate limited", 429, {
            rateLimit: { retryAfterMs: 60_000 },
          });
        return { batch_id: "batch" };
      },
      getBatchStatus: async () => ({
        batch_id: "batch",
        status: "completed",
        total: 1,
        successful_count: 1,
        failed_count: 0,
      }),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
  });
  assert.equal(submissions, 2);
  assert.deepEqual(sleeps, [60_000]);
  assert.equal(summary.batch_successful, 1);
});

test("workers respect a cooldown extended while they are asleep", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => now);
  const pending: Array<{ at: number; resolve: () => void }> = [];
  const calls: Array<{ file: number; attempt: number; at: number }> = [];
  const attempts = new Map<number, number>();
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      pending.push({ at: now + ms, resolve });
    });
  let settled = false;
  const job = executeImport({
    channel: "test",
    directory: ".",
    recursive: false,
    batchSize: 50,
    uploadConcurrency: 3,
    pollIntervalMs: 1,
    selectedFiles: Array.from({ length: 4 }, (_, i) => ({
      absolutePath: `/mock/${i}`,
      relativePath: String(i),
    })),
    adapter: {
      sleep,
      uploadFile: async (file) => {
        const id = Number(file.relativePath);
        const attempt = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, attempt);
        calls.push({ file: id, attempt, at: now });
        if (id === 0 && attempt === 1)
          throw new ArenaError("limited", 429, {
            rateLimit: { retryAfterMs: 100 },
          });
        if (id === 1 && attempt === 1) {
          await sleep(50);
          throw new ArenaError("limited", 429, {
            rateLimit: { retryAfterMs: 200 },
          });
        }
        return { s3Url: `https://example.com/${id}` };
      },
      submitBatch: async () => ({ batch_id: "batch" }),
      getBatchStatus: async () => ({
        batch_id: "batch",
        status: "completed",
        total: 4,
        successful_count: 4,
        failed_count: 0,
      }),
    },
  }).finally(() => {
    settled = true;
  });

  // Drain promise continuations before advancing the controlled clock.
  for (let step = 0; step < 20 && !settled; step++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    pending.sort((a, b) => a.at - b.at);
    const next = pending.shift();
    if (next) {
      now = next.at;
      next.resolve();
    }
  }
  assert.equal(settled, true, "import should finish with the controlled clock");
  assert.equal((await job).batch_successful, 4);
  assert.deepEqual(
    calls.filter((call) => call.at > 0).map((call) => call.at),
    [250, 250, 250],
  );
});

test("51 files are submitted as batches of 50 and 1", async () => {
  const sizes: number[] = [];
  await executeImport({
    channel: "test",
    directory: ".",
    recursive: false,
    batchSize: 50,
    uploadConcurrency: 4,
    pollIntervalMs: 1,
    selectedFiles: Array.from({ length: 51 }, (_, i) => ({
      absolutePath: `/mock/${i}`,
      relativePath: String(i),
    })),
    adapter: {
      uploadFile: async () => ({ s3Url: "https://example.com/file" }),
      submitBatch: async (_channel, blocks) => {
        sizes.push(blocks.length);
        return { batch_id: String(blocks.length) };
      },
      getBatchStatus: async (id) => ({
        batch_id: id,
        status: "completed",
        total: Number(id),
        successful_count: Number(id),
        failed_count: 0,
      }),
      sleep: async () => {},
    },
  });
  assert.deepEqual(sizes, [50, 1]);
});

test("import options default to 50 and reject oversized batches", () => {
  assert.equal(parseImportOptions(["example"], {}).batchSize, 50);
  assert.throws(
    () => parseImportOptions(["example"], { "batch-size": "51" }),
    /at most 50/,
  );
});
