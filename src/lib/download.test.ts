import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { Block, Connectable, PaginationMeta } from "../api/types";
import {
  buildManifest,
  executeDownload,
  downloadExitCode,
  resolveTarget,
  type DownloadAdapter,
  type DownloadEvent,
  type DownloadOptions,
} from "./download";

// ── Minimal block factories ────────────────────────────────────────────────
// resolveTarget/buildManifest only touch a handful of fields, so we cast small
// partials rather than constructing the full discriminated union.

function imageBlock(
  id: number,
  overrides: Record<string, unknown> = {},
): Block {
  return {
    id,
    base_type: "Block",
    type: "Image",
    created_at: "2023-01-01T00:00:00Z",
    image: {
      src: `https://cdn.example/${id}/original.jpg`,
      large: { src: `https://cdn.example/${id}/large.jpg`, src_2x: "" },
      filename: `photo-${id}.jpg`,
      content_type: "image/jpeg",
    },
    ...overrides,
  } as unknown as Block;
}

function attachmentBlock(id: number): Block {
  return {
    id,
    base_type: "Block",
    type: "Attachment",
    created_at: "2023-01-01T00:00:00Z",
    attachment: {
      url: `https://attachments.example/${id}/doc.pdf`,
      filename: `doc-${id}.pdf`,
      content_type: "application/pdf",
    },
  } as unknown as Block;
}

function textBlock(id: number): Block {
  return {
    id,
    base_type: "Block",
    type: "Text",
    created_at: "2023-01-01T00:00:00Z",
    content: { markdown: `# note ${id}`, html: "", plain: `note ${id}` },
  } as unknown as Block;
}

function linkBlock(id: number, url: string): Block {
  return {
    id,
    base_type: "Block",
    type: "Link",
    title: `link ${id}`,
    created_at: "2023-01-01T00:00:00Z",
    source: { url },
  } as unknown as Block;
}

const baseOptions: DownloadOptions = {
  slug: "test-channel",
  size: "original",
  concurrency: 2,
  includeText: false,
  overwrite: false,
};

function meta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
  return {
    current_page: 1,
    per_page: 100,
    total_pages: 1,
    total_count: 0,
    has_more_pages: false,
    ...overrides,
  };
}

/** Adapter whose assets are in-memory buffers; records which URLs were fetched. */
function fakeAdapter(
  pages: Array<{ data: Connectable[]; meta: PaginationMeta }>,
  opts: {
    onOpen?: (url: string) => void;
    failUrls?: Map<string, number>; // url -> times to throw before succeeding
  } = {},
): DownloadAdapter {
  let pageCursor = 0;
  return {
    async listContents() {
      return pages[pageCursor++] ?? { data: [], meta: meta() };
    },
    async openAsset(url) {
      opts.onOpen?.(url);
      const remaining = opts.failUrls?.get(url) ?? 0;
      if (remaining > 0) {
        opts.failUrls!.set(url, remaining - 1);
        throw new Error("fetch failed"); // transient
      }
      return Readable.from([Buffer.from(`bytes:${url}`)]);
    },
    async sleep() {},
  };
}

// ── resolveTarget ───────────────────────────────────────────────────────────

test("resolveTarget maps an image to its original URL with a position prefix", () => {
  const target = resolveTarget(imageBlock(7), 0, baseOptions);
  assert.deepEqual(target, {
    kind: "fetch",
    url: "https://cdn.example/7/original.jpg",
    filename: "0001_photo-7.jpg",
  });
});

test("resolveTarget honors --size by selecting a resized version", () => {
  const target = resolveTarget(imageBlock(7), 4, {
    ...baseOptions,
    size: "large",
  });
  assert.equal(target?.kind, "fetch");
  assert.equal(
    target && target.kind === "fetch" ? target.url : null,
    "https://cdn.example/7/large.jpg",
  );
  assert.equal(target?.filename, "0005_photo-7.jpg");
});

test("resolveTarget falls back to id + content-type extension when filename is absent", () => {
  const block = imageBlock(9, {
    image: {
      src: "https://cdn.example/9/original.jpg",
      content_type: "image/png",
    },
  });
  const target = resolveTarget(block, 0, baseOptions);
  assert.equal(target?.filename, "0001_9.png");
});

test("resolveTarget maps attachments to their download URL", () => {
  const target = resolveTarget(attachmentBlock(3), 1, baseOptions);
  assert.deepEqual(target, {
    kind: "fetch",
    url: "https://attachments.example/3/doc.pdf",
    filename: "0002_doc-3.pdf",
  });
});

test("resolveTarget skips text blocks unless includeText is set", () => {
  assert.equal(resolveTarget(textBlock(1), 0, baseOptions), null);
  const target = resolveTarget(textBlock(1), 0, {
    ...baseOptions,
    includeText: true,
  });
  assert.deepEqual(target, {
    kind: "text",
    content: "# note 1",
    filename: "0001_1.md",
  });
});

test("resolveTarget skips link blocks (no hosted file)", () => {
  assert.equal(
    resolveTarget(linkBlock(1, "https://example.com"), 0, baseOptions),
    null,
  );
});

// ── buildManifest ─────────────────────────────────────────────────────────

test("buildManifest captures every block including link source URLs", () => {
  const manifest = buildManifest([
    imageBlock(1),
    linkBlock(2, "https://example.com/ref"),
  ]);
  assert.equal(manifest.length, 2);
  assert.equal(manifest[0]?.type, "Image");
  assert.equal(manifest[0]?.filename, "photo-1.jpg");
  assert.equal(manifest[1]?.type, "Link");
  assert.equal(manifest[1]?.source_url, "https://example.com/ref");
});

// ── executeDownload ─────────────────────────────────────────────────────────

test("executeDownload downloads assets, writes a manifest, and emits completed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arena-dl-"));
  try {
    const blocks = [
      imageBlock(1),
      attachmentBlock(2),
      linkBlock(3, "https://x.io"),
    ];
    const adapter = fakeAdapter([
      { data: blocks, meta: meta({ total_count: 3 }) },
    ]);
    const events: DownloadEvent[] = [];

    const summary = await executeDownload({
      ...baseOptions,
      directory: dir,
      adapter,
      onEvent: (event) => {
        events.push(event);
      },
    });

    assert.equal(summary.listed, 3);
    assert.equal(summary.downloaded, 2); // image + attachment; link is skipped
    assert.equal(summary.failed, 0);
    assert.equal(downloadExitCode(summary), 0);

    const files = (await readdir(dir)).sort();
    assert.deepEqual(files, [
      "0001_photo-1.jpg",
      "0002_doc-2.pdf",
      "manifest.json",
    ]);

    const manifest = JSON.parse(
      await readFile(join(dir, "manifest.json"), "utf-8"),
    );
    assert.equal(manifest.length, 3); // all blocks recorded, including the link

    assert.equal(events.at(-1)?.type, "completed");
    assert.ok(events.some((e) => e.type === "list_completed"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("executeDownload paginates across pages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arena-dl-"));
  try {
    const adapter = fakeAdapter([
      {
        data: [imageBlock(1)],
        meta: meta({
          total_count: 2,
          total_pages: 2,
          has_more_pages: true,
          next_page: 2,
        }),
      },
      {
        data: [imageBlock(2)],
        meta: meta({ current_page: 2, total_count: 2, total_pages: 2 }),
      },
    ]);

    const summary = await executeDownload({
      ...baseOptions,
      directory: dir,
      adapter,
    });
    assert.equal(summary.listed, 2);
    assert.equal(summary.downloaded, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("executeDownload records failures and returns a non-zero exit code", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arena-dl-"));
  try {
    // Permanent failure (more than the retry budget) on one asset.
    const failUrls = new Map([["https://cdn.example/2/original.jpg", 99]]);
    const adapter = fakeAdapter(
      [
        {
          data: [imageBlock(1), imageBlock(2)],
          meta: meta({ total_count: 2 }),
        },
      ],
      { failUrls },
    );

    const summary = await executeDownload({
      ...baseOptions,
      concurrency: 1,
      directory: dir,
      adapter,
    });

    assert.equal(summary.downloaded, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.failures[0]?.file, "0002_photo-2.jpg");
    assert.equal(downloadExitCode(summary), 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("executeDownload retries transient asset failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arena-dl-"));
  try {
    const failUrls = new Map([["https://cdn.example/1/original.jpg", 2]]); // fail twice, then succeed
    const adapter = fakeAdapter(
      [{ data: [imageBlock(1)], meta: meta({ total_count: 1 }) }],
      { failUrls },
    );

    const summary = await executeDownload({
      ...baseOptions,
      directory: dir,
      adapter,
    });
    assert.equal(summary.downloaded, 1);
    assert.equal(summary.failed, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("executeDownload skips existing files unless overwrite is set", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arena-dl-"));
  try {
    await writeFile(join(dir, "0001_photo-1.jpg"), "preexisting");
    const opened: string[] = [];
    const adapter = fakeAdapter(
      [{ data: [imageBlock(1)], meta: meta({ total_count: 1 }) }],
      { onOpen: (url) => opened.push(url) },
    );

    const summary = await executeDownload({
      ...baseOptions,
      directory: dir,
      adapter,
    });
    assert.equal(summary.skipped, 1);
    assert.equal(summary.downloaded, 0);
    assert.equal(
      opened.length,
      0,
      "should not fetch an asset that already exists",
    );

    // Untouched on disk.
    assert.equal(
      await readFile(join(dir, "0001_photo-1.jpg"), "utf-8"),
      "preexisting",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("executeDownload filters by --type", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arena-dl-"));
  try {
    const adapter = fakeAdapter([
      {
        data: [imageBlock(1), attachmentBlock(2)],
        meta: meta({ total_count: 2 }),
      },
    ]);

    const summary = await executeDownload({
      ...baseOptions,
      type: "Attachment",
      directory: dir,
      adapter,
    });

    assert.equal(summary.listed, 2);
    assert.equal(summary.downloaded, 1); // only the attachment
    const files = (await readdir(dir)).filter((f) => f !== "manifest.json");
    assert.deepEqual(files, ["0002_doc-2.pdf"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
