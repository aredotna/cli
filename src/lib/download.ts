import { createWriteStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ArenaError, client, getData } from "../api/client";
import type { Block, Connectable, PaginationMeta } from "../api/types";
import { cancellationSignal, fetchWithTimeout } from "./network";

export type ImageSize = "original" | "large" | "medium" | "small" | "square";

export interface DownloadOptions {
  slug: string;
  directory?: string;
  size: ImageSize;
  concurrency: number;
  includeText: boolean;
  type?: string;
  overwrite: boolean;
}

export interface DownloadFailure {
  file: string;
  error: string;
}

export interface ManifestEntry {
  id: number;
  type: string;
  title: string | null;
  filename: string | null;
  source_url: string | null;
  description: string | null;
  created_at: string;
}

export interface DownloadSummary {
  channel: string;
  directory: string;
  listed: number;
  downloaded: number;
  skipped: number;
  failed: number;
  failures: DownloadFailure[];
}

export type DownloadEvent =
  | { type: "list_started"; slug: string }
  | { type: "list_progress"; fetched: number; total: number }
  | { type: "list_completed"; total: number; downloadable: number }
  | {
      type: "file_progress";
      index: number;
      file: string;
      completed: number;
      total: number;
      downloaded: number;
      skipped: number;
      failed: number;
    }
  | { type: "file_failed"; index: number; file: string; error: string }
  | { type: "completed"; summary: DownloadSummary };

/** A unit of work: either a remote asset to fetch or local text to write. */
export type DownloadTarget =
  | { kind: "fetch"; url: string; filename: string }
  | { kind: "text"; content: string; filename: string };

/**
 * Injectable seam for network access, mirroring the import command's adapter.
 * The default implementation hits the real API/CDN; tests substitute their own.
 */
export interface DownloadAdapter {
  listContents(
    slug: string,
    page: number,
    per: number,
  ): Promise<{ data: Connectable[]; meta: PaginationMeta }>;
  /** Open a remote asset for reading, throwing on a non-OK response. */
  openAsset(url: string, signal: AbortSignal): Promise<Readable>;
  sleep(ms: number): Promise<void>;
}

const MAX_DOWNLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;
const PER_PAGE = 100;

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "application/pdf": "pdf",
};

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new Error("Operation cancelled by user");
}

function isTransientError(err: unknown): boolean {
  if (err instanceof ArenaError) {
    return err.status >= 500 || err.status === 429;
  }
  const message =
    err instanceof Error ? err.message.toLowerCase() : String(err);
  return (
    message.includes("timed out") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("socket")
  );
}

async function retryWithBackoff<T>(
  run: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      return await run();
    } catch (err: unknown) {
      lastError = err;
      if (attempt >= MAX_DOWNLOAD_ATTEMPTS || !isTransientError(err)) throw err;
      await sleep(Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), 5_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Strip path separators and control characters so a block filename is safe to join. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/[\x00-\x1f]/g, "")
    .trim();
}

function extensionForContentType(contentType?: string | null): string {
  if (!contentType) return "bin";
  return CONTENT_TYPE_EXTENSIONS[contentType.toLowerCase()] ?? "bin";
}

async function emit(
  onEvent: ((event: DownloadEvent) => void | Promise<void>) | undefined,
  event: DownloadEvent,
): Promise<void> {
  if (onEvent) await onEvent(event);
}

/** Page through a channel's contents, accumulating every block. */
async function listChannelBlocks(
  slug: string,
  adapter: DownloadAdapter,
  onEvent: ((event: DownloadEvent) => void | Promise<void>) | undefined,
  signal?: AbortSignal,
): Promise<Block[]> {
  const blocks: Block[] = [];
  let page = 1;

  while (true) {
    throwIfAborted(signal);
    const response = await retryWithBackoff(
      () => adapter.listContents(slug, page, PER_PAGE),
      adapter.sleep,
    );

    // Channel contents can include nested channels; we only download blocks.
    for (const item of response.data) {
      if ("base_type" in item && item.base_type === "Block") blocks.push(item);
    }
    await emit(onEvent, {
      type: "list_progress",
      fetched: blocks.length,
      total: response.meta.total_count,
    });

    if (!response.meta.has_more_pages || response.data.length === 0) break;
    page = response.meta.next_page ?? page + 1;
  }

  return blocks;
}

/** Map a block to a downloadable target, or null if it has no local artifact. */
export function resolveTarget(
  block: Block,
  index: number,
  options: DownloadOptions,
): DownloadTarget | null {
  const prefix = String(index + 1).padStart(4, "0");

  switch (block.type) {
    case "Image": {
      const image = block.image;
      const url =
        options.size === "original" ? image.src : image[options.size]?.src;
      if (!url) return null;
      const base =
        image.filename ??
        `${block.id}.${extensionForContentType(image.content_type)}`;
      return {
        kind: "fetch",
        url,
        filename: `${prefix}_${sanitizeFilename(base)}`,
      };
    }

    case "Attachment": {
      const attachment = block.attachment;
      const base =
        attachment.filename ??
        `${block.id}.${attachment.file_extension ?? extensionForContentType(attachment.content_type)}`;
      return {
        kind: "fetch",
        url: attachment.url,
        filename: `${prefix}_${sanitizeFilename(base)}`,
      };
    }

    case "Text": {
      if (!options.includeText) return null;
      const content = block.content?.markdown ?? block.content?.plain ?? "";
      return {
        kind: "text",
        content,
        filename: `${prefix}_${block.id}.md`,
      };
    }

    default:
      // Link, Embed, PendingBlock: no Are.na-hosted file. Captured in the manifest.
      return null;
  }
}

export function buildManifest(blocks: Block[]): ManifestEntry[] {
  return blocks.map((block) => ({
    id: block.id,
    type: block.type,
    title: block.title ?? null,
    filename:
      block.type === "Image"
        ? (block.image.filename ?? null)
        : block.type === "Attachment"
          ? (block.attachment.filename ?? null)
          : null,
    source_url: block.source?.url ?? null,
    description: block.description?.plain ?? null,
    created_at: block.created_at,
  }));
}

async function writeTarget(
  target: DownloadTarget,
  destDir: string,
  overwrite: boolean,
  adapter: DownloadAdapter,
  signal: AbortSignal,
): Promise<"written" | "skipped"> {
  const destPath = join(destDir, target.filename);

  if (!overwrite) {
    const exists = await access(destPath).then(
      () => true,
      () => false,
    );
    if (exists) return "skipped";
  }

  if (target.kind === "text") {
    await writeFile(destPath, target.content, "utf-8");
    return "written";
  }

  const source = await adapter.openAsset(target.url, signal);
  await pipeline(source, createWriteStream(destPath));
  return "written";
}

/** Real adapter: paginated API listing + a CDN fetch that streams to disk. */
export function defaultDownloadAdapter(): DownloadAdapter {
  return {
    async listContents(slug, page, per) {
      return getData(
        client.GET("/v3/channels/{id}/contents", {
          params: {
            path: { id: slug },
            query: { page, per, sort: "position_desc" },
          },
        }),
      );
    },
    async openAsset(url, signal) {
      // Are.na's CloudFront CDN returns 202 + empty body when no User-Agent is
      // sent, silently producing 0-byte files. Send one explicitly.
      const response = await fetchWithTimeout(url, {
        signal,
        headers: { "User-Agent": "@aredotna/cli (arena download)" },
      });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} fetching ${url}`);
      }
      return Readable.fromWeb(
        response.body as Parameters<typeof Readable.fromWeb>[0],
      );
    },
    async sleep(ms) {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
    },
  };
}

export interface ExecuteDownloadOptions extends DownloadOptions {
  adapter?: DownloadAdapter;
  onEvent?: (event: DownloadEvent) => void | Promise<void>;
  signal?: AbortSignal;
}

export function downloadExitCode(summary: DownloadSummary): number {
  return summary.failed > 0 ? 1 : 0;
}

export async function executeDownload(
  options: ExecuteDownloadOptions,
): Promise<DownloadSummary> {
  const { slug, onEvent } = options;
  const adapter = options.adapter ?? defaultDownloadAdapter();
  const signal = options.signal ?? cancellationSignal();

  throwIfAborted(signal);
  await emit(onEvent, { type: "list_started", slug });

  const blocks = await listChannelBlocks(slug, adapter, onEvent, signal);

  const destDir = resolve(options.directory ?? slug);
  await mkdir(destDir, { recursive: true });

  const typeFilter = options.type?.toLowerCase();
  const targets: Array<{ index: number; target: DownloadTarget }> = [];
  blocks.forEach((block, index) => {
    if (typeFilter && block.type.toLowerCase() !== typeFilter) return;
    const target = resolveTarget(block, index, options);
    if (target) targets.push({ index, target });
  });

  await emit(onEvent, {
    type: "list_completed",
    total: blocks.length,
    downloadable: targets.length,
  });

  // Always write a manifest so Link/Embed/Text metadata is preserved.
  await writeFile(
    join(destDir, "manifest.json"),
    JSON.stringify(buildManifest(blocks), null, 2),
    "utf-8",
  );

  const failures: DownloadFailure[] = [];
  let completed = 0;
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  let cursor = 0;
  const workerCount = Math.max(
    1,
    Math.min(options.concurrency, Math.max(1, targets.length)),
  );

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      throwIfAborted(signal);
      const current = cursor;
      cursor += 1;
      if (current >= targets.length) return;

      const { target } = targets[current]!;
      try {
        const result = await retryWithBackoff(
          () =>
            writeTarget(target, destDir, options.overwrite, adapter, signal),
          adapter.sleep,
        );
        if (result === "written") downloaded += 1;
        else skipped += 1;
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        failures.push({ file: target.filename, error });
        failed += 1;
        await emit(onEvent, {
          type: "file_failed",
          index: current,
          file: target.filename,
          error,
        });
      } finally {
        completed += 1;
        await emit(onEvent, {
          type: "file_progress",
          index: current,
          file: target.filename,
          completed,
          total: targets.length,
          downloaded,
          skipped,
          failed,
        });
      }
    }
  });

  await Promise.all(workers);

  const summary: DownloadSummary = {
    channel: slug,
    directory: destDir,
    listed: blocks.length,
    downloaded,
    skipped,
    failed,
    failures,
  };

  await emit(onEvent, { type: "completed", summary });
  return summary;
}
