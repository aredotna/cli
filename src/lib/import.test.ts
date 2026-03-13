import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    batchSize: 100,
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
    batchSize: 100,
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
    batchSize: 100,
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
    batchSize: 100,
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
