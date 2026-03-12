import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { client, getData } from "../api/client";
import { uploadLocalFile } from "./upload";

export interface ImportFile {
  absolutePath: string;
  relativePath: string;
}

export interface UploadFailure {
  file: string;
  error: string;
}

export interface BatchFailure {
  file: string;
  error: string;
  batch_id: string;
}

export interface ImportSummary {
  channel: string;
  directory: string;
  recursive: boolean;
  discovered: number;
  selected: number;
  uploaded: number;
  upload_failed: number;
  batch_successful: number;
  batch_failed: number;
  upload_failures: UploadFailure[];
  batch_failures: BatchFailure[];
  batch_ids: string[];
}

export interface BatchStatus {
  batch_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  total: number;
  successful_count: number;
  failed_count: number;
  successful?: Array<{ index: number; block_id: number }>;
  failed?: Array<{ index: number; error: string }>;
  error?: string;
}

export type ImportEvent =
  | { type: "discover_started"; directory: string; recursive: boolean }
  | { type: "discover_completed"; discovered: number }
  | { type: "selection_completed"; selected: number }
  | {
      type: "upload_progress";
      index: number;
      file: string;
      completed: number;
      total: number;
      uploaded: number;
      failed: number;
    }
  | {
      type: "upload_file_failed";
      index: number;
      file: string;
      error: string;
    }
  | {
      type: "upload_completed";
      uploaded: number;
      failed: number;
      total: number;
    }
  | {
      type: "batch_submitted";
      batch_id: string;
      batch_index: number;
      batch_total: number;
      items: number;
    }
  | {
      type: "batch_status";
      batch_id: string;
      status: BatchStatus["status"];
      successful_count: number;
      failed_count: number;
      total: number;
    }
  | {
      type: "batch_progress";
      processed: number;
      total: number;
      completed_batches: number;
      total_batches: number;
    }
  | { type: "completed"; summary: ImportSummary };

interface UploadedSelection {
  index: number;
  file: ImportFile;
  s3Url: string;
}

interface ImportBatch {
  batchId: string;
  entries: UploadedSelection[];
  status?: BatchStatus;
}

export interface ImportAdapter {
  uploadFile: (file: ImportFile) => Promise<{ s3Url: string }>;
  submitBatch: (
    channel: string,
    blocks: Array<{ value: string }>,
  ) => Promise<{ batch_id: string }>;
  getBatchStatus: (batchId: string) => Promise<BatchStatus>;
  sleep: (ms: number) => Promise<void>;
}

export interface ExecuteImportOptions {
  channel: string;
  directory: string;
  recursive: boolean;
  selectedFiles?: ImportFile[];
  discoveredCount?: number;
  batchSize: number;
  uploadConcurrency: number;
  pollIntervalMs: number;
  adapter?: ImportAdapter;
  discover?: (directory: string, recursive: boolean) => Promise<ImportFile[]>;
  onEvent?: (event: ImportEvent) => void | Promise<void>;
}

export function importExitCode(summary: ImportSummary): number {
  return summary.upload_failed > 0 || summary.batch_failed > 0 ? 1 : 0;
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`Invalid chunk size: ${size}`);
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function discoverImportFiles(
  directory: string,
  recursive: boolean,
): Promise<ImportFile[]> {
  const root = resolve(directory);
  const files: ImportFile[] = [];

  const walk = async (currentAbsolute: string, currentRelative: string) => {
    const entries = await readdir(currentAbsolute, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const nextRelative = currentRelative
        ? `${currentRelative}/${entry.name}`
        : entry.name;
      const normalizedAbsolute = join(currentAbsolute, entry.name);

      if (entry.isFile()) {
        files.push({
          absolutePath: normalizedAbsolute,
          relativePath: nextRelative,
        });
        continue;
      }

      if (recursive && entry.isDirectory()) {
        await walk(normalizedAbsolute, nextRelative);
      }
    }
  };

  await walk(root, "");
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

function defaultAdapter(): ImportAdapter {
  return {
    async uploadFile(file) {
      const { s3Url } = await uploadLocalFile(file.absolutePath);
      return { s3Url };
    },
    async submitBatch(channel, blocks) {
      return getData(
        client.POST("/v3/blocks/batch", {
          body: {
            channel_ids: [channel],
            blocks,
          },
        }),
      );
    },
    async getBatchStatus(batchId) {
      return getData(
        client.GET("/v3/blocks/batch/{batch_id}", {
          params: { path: { batch_id: batchId } },
        }),
      );
    },
    async sleep(ms) {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
    },
  };
}

async function emit(
  onEvent: ((event: ImportEvent) => void | Promise<void>) | undefined,
  event: ImportEvent,
): Promise<void> {
  if (!onEvent) return;
  await onEvent(event);
}

function terminal(status: BatchStatus["status"]): boolean {
  return status === "completed" || status === "failed";
}

function aggregateBatchProgress(batches: ImportBatch[]): {
  processed: number;
  completedBatches: number;
} {
  let processed = 0;
  let completedBatches = 0;

  for (const batch of batches) {
    const status = batch.status;
    if (!status) continue;
    processed += status.successful_count + status.failed_count;
    if (terminal(status.status)) completedBatches++;
  }

  return { processed, completedBatches };
}

function mapBatchFailures(batches: ImportBatch[]): BatchFailure[] {
  const failures: BatchFailure[] = [];

  for (const batch of batches) {
    const status = batch.status;
    if (!status || status.failed_count <= 0) continue;

    if (status.failed && status.failed.length > 0) {
      for (const failed of status.failed) {
        const entry = batch.entries[failed.index];
        if (!entry) continue;
        failures.push({
          batch_id: batch.batchId,
          file: entry.file.relativePath,
          error: failed.error,
        });
      }
      continue;
    }

    const successfulIndexes = new Set(
      (status.successful ?? []).map((successful) => successful.index),
    );
    const fallbackError = status.error ?? "Batch item failed";
    let addedForBatch = 0;

    for (let i = 0; i < batch.entries.length; i++) {
      if (successfulIndexes.has(i)) continue;
      failures.push({
        batch_id: batch.batchId,
        file: batch.entries[i]!.file.relativePath,
        error: fallbackError,
      });
      addedForBatch += 1;
      if (addedForBatch >= status.failed_count) break;
    }
  }

  return failures;
}

async function runImportPipeline(options: {
  channel: string;
  directory: string;
  recursive: boolean;
  discoveredCount: number;
  selectedFiles: ImportFile[];
  batchSize: number;
  uploadConcurrency: number;
  pollIntervalMs: number;
  adapter: ImportAdapter;
  onEvent?: (event: ImportEvent) => void | Promise<void>;
}): Promise<ImportSummary> {
  const {
    channel,
    directory,
    recursive,
    discoveredCount,
    selectedFiles,
    batchSize,
    uploadConcurrency,
    pollIntervalMs,
    adapter,
    onEvent,
  } = options;

  await emit(onEvent, {
    type: "selection_completed",
    selected: selectedFiles.length,
  });

  const uploadedByIndex: Array<UploadedSelection | undefined> = [];
  const uploadFailures: UploadFailure[] = [];
  let completedUploads = 0;
  let successfulUploads = 0;
  let failedUploads = 0;

  let cursor = 0;
  const workerCount = Math.max(
    1,
    Math.min(uploadConcurrency, Math.max(1, selectedFiles.length)),
  );

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= selectedFiles.length) return;

      const file = selectedFiles[index]!;

      try {
        const uploaded = await adapter.uploadFile(file);
        uploadedByIndex[index] = { index, file, s3Url: uploaded.s3Url };
        successfulUploads += 1;
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        uploadFailures.push({ file: file.relativePath, error });
        failedUploads += 1;
        await emit(onEvent, {
          type: "upload_file_failed",
          index,
          file: file.relativePath,
          error,
        });
      } finally {
        completedUploads += 1;
        await emit(onEvent, {
          type: "upload_progress",
          index,
          file: file.relativePath,
          completed: completedUploads,
          total: selectedFiles.length,
          uploaded: successfulUploads,
          failed: failedUploads,
        });
      }
    }
  });

  await Promise.all(workers);

  await emit(onEvent, {
    type: "upload_completed",
    uploaded: successfulUploads,
    failed: failedUploads,
    total: selectedFiles.length,
  });

  const uploadedEntries = uploadedByIndex.filter(
    (entry): entry is UploadedSelection => Boolean(entry),
  );
  const chunks = chunkItems(uploadedEntries, batchSize);
  const batches: ImportBatch[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const response = await adapter.submitBatch(
      channel,
      chunk.map((entry) => ({ value: entry.s3Url })),
    );

    batches.push({
      batchId: response.batch_id,
      entries: chunk,
    });

    await emit(onEvent, {
      type: "batch_submitted",
      batch_id: response.batch_id,
      batch_index: i + 1,
      batch_total: chunks.length,
      items: chunk.length,
    });
  }

  const pending = new Set(batches.map((batch) => batch.batchId));
  while (pending.size > 0) {
    for (const batch of batches) {
      if (!pending.has(batch.batchId)) continue;

      const status = await adapter.getBatchStatus(batch.batchId);
      batch.status = status;

      await emit(onEvent, {
        type: "batch_status",
        batch_id: batch.batchId,
        status: status.status,
        successful_count: status.successful_count,
        failed_count: status.failed_count,
        total: status.total,
      });

      if (terminal(status.status)) {
        pending.delete(batch.batchId);
      }
    }

    const aggregate = aggregateBatchProgress(batches);
    await emit(onEvent, {
      type: "batch_progress",
      processed: aggregate.processed,
      total: uploadedEntries.length,
      completed_batches: aggregate.completedBatches,
      total_batches: batches.length,
    });

    if (pending.size > 0) {
      await adapter.sleep(pollIntervalMs);
    }
  }

  const batchFailures = mapBatchFailures(batches);

  const batchSuccessful = batches.reduce((sum, batch) => {
    return sum + (batch.status?.successful_count ?? 0);
  }, 0);

  const batchFailed = batches.reduce((sum, batch) => {
    return sum + (batch.status?.failed_count ?? 0);
  }, 0);

  return {
    channel,
    directory,
    recursive,
    discovered: discoveredCount,
    selected: selectedFiles.length,
    uploaded: uploadedEntries.length,
    upload_failed: uploadFailures.length,
    batch_successful: batchSuccessful,
    batch_failed: batchFailed,
    upload_failures: uploadFailures,
    batch_failures: batchFailures,
    batch_ids: batches.map((batch) => batch.batchId),
  };
}

export async function executeImport(
  options: ExecuteImportOptions,
): Promise<ImportSummary> {
  const {
    directory,
    recursive,
    selectedFiles,
    discoveredCount,
    discover,
    onEvent,
  } = options;

  let files = selectedFiles;
  let totalDiscovered = discoveredCount;

  if (!files) {
    await emit(onEvent, {
      type: "discover_started",
      directory,
      recursive,
    });

    const discoverFiles = discover ?? discoverImportFiles;
    files = await discoverFiles(directory, recursive);
    totalDiscovered = files.length;

    await emit(onEvent, {
      type: "discover_completed",
      discovered: files.length,
    });
  }

  const adapter = options.adapter ?? defaultAdapter();
  const summary = await runImportPipeline({
    channel: options.channel,
    directory,
    recursive,
    discoveredCount: totalDiscovered ?? files.length,
    selectedFiles: files,
    batchSize: options.batchSize,
    uploadConcurrency: options.uploadConcurrency,
    pollIntervalMs: options.pollIntervalMs,
    adapter,
    onEvent,
  });

  await emit(onEvent, { type: "completed", summary });
  return summary;
}
