import test from "node:test";
import assert from "node:assert/strict";
import {
  link,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
  symlink,
  utimes,
} from "node:fs/promises";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { inflateRawSync } from "node:zlib";
import { ArenaError } from "../api/client";
import type { Block, Channel, Connectable } from "../api/types";
import {
  buildDownloadCsv,
  executeDownload,
  downloadExitCode,
  defaultDownloadAdapter,
  type DownloadAdapter,
  type DownloadManifest,
  type DownloadOptions,
  type DownloadEvent,
  type ManagedFile,
} from "./download";
import {
  blockFileName,
  resolveTarget,
  safeFilename,
  urlShortcut,
} from "./download-format";
import { parseDownloadOptions } from "../commands/download";
import { parseArgs, type Flags } from "./args";

const user = {
  id: 1,
  type: "User" as const,
  slug: "owner",
  name: "Owner",
  avatar: null,
  initials: "O",
};
const channel = {
  id: 10,
  type: "Channel",
  slug: "test-channel",
  title: "Collection",
  state: "available",
  visibility: "public",
  created_at: "2026-01-01",
  updated_at: "2026-01-02",
  owner: user,
  counts: { contents: 1 },
  _links: { self: { href: "https://api.are.na/v3/blocks/1" } },
} as Channel;
const base = {
  id: 1,
  base_type: "Block" as const,
  title: "Note",
  state: "available" as const,
  visibility: "public" as const,
  comment_count: 0,
  created_at: "2026-01-01",
  updated_at: "2026-01-02",
  user,
  _links: { self: { href: "https://api.are.na/v3/blocks/1" } },
};
function textBlock(
  id = 1,
  content = "hello",
): Extract<Block, { type: "Text" }> {
  return {
    ...base,
    id,
    type: "Text",
    content: { markdown: content, plain: content, html: `<p>${content}</p>` },
  };
}
function imageBlock(id = 2): Block {
  const version = { src: `https://cdn.example/${id}/large.jpg`, src_2x: "" };
  return {
    ...base,
    id,
    title: "photo.png?w=800",
    type: "Image",
    image: {
      filename: "photo.png",
      content_type: "image/png",
      src: `https://cdn.example/${id}/original.png`,
      small: version,
      medium: version,
      large: version,
      square: version,
    },
  };
}
function adapter(
  items: Connectable[],
  overrides: Partial<DownloadAdapter> = {},
): DownloadAdapter {
  return {
    async getChannel() {
      return channel;
    },
    async listContents() {
      return {
        data: items,
        meta: {
          current_page: 1,
          per_page: 100,
          total_pages: 1,
          total_count: items.length,
          has_more_pages: false,
        },
      };
    },
    async openAsset(url) {
      return Readable.from([`bytes:${url}`]);
    },
    async sleep() {},
    ...overrides,
  };
}
const options: DownloadOptions = {
  channel: "test-channel",
  size: "original",
  linkFormat: "webloc",
  concurrency: 2,
  overwrite: false,
  prune: false,
};
async function directory(t: test.TestContext) {
  const path = await mkdtemp(join(tmpdir(), "arena-export-"));
  t.after(() => rm(path, { force: true, recursive: true }));
  return path;
}
async function manifest(path: string): Promise<DownloadManifest> {
  return JSON.parse(await readFile(join(path, "manifest.json"), "utf8"));
}
function filename(item: Connectable, position = 1) {
  return resolveTarget(item, position, options)!.filename;
}

// A small reader for our archive assertions, using the ZIP central directory rather than a shell dependency.
function unzip(buffer: Buffer): Map<string, Buffer> {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < buffer.readUInt16LE(eocd + 10); i++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const compression = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString();
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files.set(name, compression === 8 ? inflateRawSync(data) : data);
    offset +=
      46 +
      nameLength +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return files;
}

test("exports every content type, connection metadata, escaped offline index, and real ZIP contents", async (t) => {
  const dir = await directory(t);
  const text = textBlock(1, '<script>alert("x")</script>');
  const items: Connectable[] = [
    text,
    imageBlock(),
    {
      ...base,
      id: 3,
      type: "Attachment",
      attachment: { url: "https://cdn.example/file.pdf", filename: "file.pdf" },
    },
    {
      ...base,
      id: 4,
      type: "Link",
      source: { url: "https://example.com/?a=1&b=2" },
    },
    {
      ...base,
      id: 5,
      type: "Embed",
      embed: { html: "<script>bad()</script>", type: "video" },
    } as Block,
    { ...channel, id: 6, slug: "child" },
    { ...base, id: 7, type: "PendingBlock" },
  ];
  text.connection = {
    id: 22,
    position: 4,
    pinned: true,
    connected_at: "2026-01-01",
    connected_by: null,
    metadata: { note: "context" },
  };
  const zip = join(dir, "export.zip");
  const events: DownloadEvent[] = [];
  const result = await executeDownload({
    ...options,
    directory: dir,
    zip,
    adapter: adapter(items),
    onEvent: (event) => events.push(event),
  });
  assert.equal(result.downloaded, 6);
  assert.equal(result.metadata_only, 1);
  assert.equal(result.failed, 0);
  const data = await manifest(dir);
  assert.equal(data.complete, true);
  assert.deepEqual(data.entries[0].item.connection, text.connection);
  assert.ok(data.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
  const html = await readFile(join(dir, "index.html"), "utf8");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(
    (await readFile(join(dir, filename(items[3], 4)), "utf8")).includes(
      "&amp;b=2",
    ),
  );
  const zipped = unzip(await readFile(zip));
  assert.equal(zipped.size, 9);
  const csv = zipped.get("test-channel.csv")!.toString();
  assert.equal(csv, await readFile(join(dir, "test-channel.csv"), "utf8"));
  const [header, first] = csv.split("\n");
  assert.equal(
    header,
    "ID,Filename,Title,Description,Created At,Updated At,Source",
  );
  assert.equal(first, `1,${filename(text)},Note,,2026-01-01,2026-01-02,`);
  assert.equal(csv.split("\n").length, 7);
  assert.equal(zipped.get(filename(text))?.toString(), text.content.markdown);
  assert.deepEqual(JSON.parse(zipped.get("manifest.json")!.toString()), data);
  assert.equal(events.at(-1)?.type, "completed");
});

test("sync skips unchanged assets, updates changed text, and preserves local edits unless forced", async (t) => {
  const dir = await directory(t);
  let fetches = 0;
  const network = {
    async openAsset() {
      fetches++;
      return Readable.from(["image"]);
    },
  };
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([imageBlock(), textBlock()], network),
  });
  const unchanged = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock(), imageBlock()], network),
  });
  assert.equal(unchanged.unchanged, 2);
  assert.equal(fetches, 1);
  const changed = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([imageBlock(), textBlock(1, "changed")], network),
  });
  assert.equal(changed.downloaded, 1);
  assert.equal(changed.unchanged, 1);
  await writeFile(join(dir, filename(textBlock())), "local edit");
  const conflict = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock(1, "remote edit")]),
  });
  assert.equal(downloadExitCode(conflict), 1);
  assert.match(conflict.failures[0].error, /modified/);
  assert.equal(
    await readFile(join(dir, filename(textBlock())), "utf8"),
    "local edit",
  );
  const forced = await executeDownload({
    ...options,
    directory: dir,
    overwrite: true,
    adapter: adapter([textBlock(1, "remote edit")]),
  });
  assert.equal(forced.downloaded, 1);
  assert.equal(
    await readFile(join(dir, filename(textBlock())), "utf8"),
    "remote edit",
  );
});

test("sync detects changed assets at the same URL and restores missing managed files", async (t) => {
  const dir = await directory(t);
  const image = imageBlock();
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([image]),
  });
  image.updated_at = "2026-02-01";
  const changed = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([image], {
      async openAsset() {
        return Readable.from(["new bytes"]);
      },
    }),
  });
  assert.equal(changed.downloaded, 1);
  await rm(join(dir, filename(image)));
  const restored = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([image]),
  });
  assert.equal(restored.downloaded, 1);
});

test("retains removed files by default; prune deletes only unchanged tracked files and includes prior retained exports", async (t) => {
  const dir = await directory(t);
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock(1), textBlock(2), textBlock(3)]),
  });
  await writeFile(join(dir, "unrelated.txt"), "keep");
  await writeFile(join(dir, filename(textBlock(3), 3)), "local edit");
  const kept = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock(1)]),
  });
  assert.equal(kept.retained, 2);
  const pruned = await executeDownload({
    ...options,
    directory: dir,
    prune: true,
    adapter: adapter([textBlock(1)]),
  });
  assert.equal(pruned.pruned, 1);
  assert.equal(pruned.failed, 1);
  assert.equal(pruned.retained, 1);
  assert.ok((await readdir(dir)).includes("unrelated.txt"));
  assert.equal(
    await readFile(join(dir, filename(textBlock(3), 3)), "utf8"),
    "local edit",
  );
});

test("never prunes after a failed download", async (t) => {
  const dir = await directory(t);
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock()]),
  });
  const result = await executeDownload({
    ...options,
    directory: dir,
    prune: true,
    adapter: adapter([imageBlock()], {
      async openAsset() {
        throw new ArenaError("gone", 404);
      },
    }),
  });
  assert.equal(result.failed, 1);
  assert.equal(result.pruned, 0);
  assert.equal(result.retained, 1);
  assert.ok((await readdir(dir)).includes(filename(textBlock())));
});

test("retries interrupted streams from scratch and leaves no partial destination", async (t) => {
  const dir = await directory(t);
  let attempts = 0;
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([imageBlock()], {
      async openAsset() {
        attempts++;
        if (attempts === 1)
          return Readable.from(
            (async function* () {
              yield "partial";
              throw Object.assign(new Error("socket reset"), {
                code: "ECONNRESET",
              });
            })(),
          );
        return Readable.from(["complete"]);
      },
    }),
  });
  assert.equal(result.downloaded, 1);
  assert.equal(attempts, 2);
  assert.equal(
    await readFile(join(dir, filename(imageBlock())), "utf8"),
    "complete",
  );
  assert.ok(!(await readdir(dir)).some((name) => name.endsWith(".part")));
});

test("failed replacement preserves the old file; empty assets are failures and empty text is valid", async (t) => {
  const dir = await directory(t);
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([imageBlock()]),
  });
  const old = await readFile(join(dir, filename(imageBlock())), "utf8");
  let attempts = 0;
  const result = await executeDownload({
    ...options,
    directory: dir,
    overwrite: true,
    adapter: adapter([imageBlock(), textBlock(1, "")], {
      async openAsset() {
        attempts++;
        return Readable.from([]);
      },
    }),
  });
  assert.equal(result.failed, 1);
  assert.equal(result.downloaded, 1);
  assert.equal(attempts, 3);
  assert.equal(await readFile(join(dir, filename(imageBlock())), "utf8"), old);
  assert.equal((await manifest(dir)).complete, false);
});

test("recovers an identical untracked file but refuses unrelated content and symlinks", async (t) => {
  const dir = await directory(t);
  await writeFile(join(dir, filename(textBlock())), "hello");
  const recovered = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock()]),
  });
  assert.equal(recovered.unchanged, 1);
  await writeFile(join(dir, filename(textBlock(2), 2)), "unrelated");
  await symlink(
    join(dir, filename(textBlock())),
    join(dir, filename(textBlock(3), 3)),
  );
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock(), textBlock(2), textBlock(3)]),
  });
  assert.equal(result.failed, 2);
  assert.equal(
    await readFile(join(dir, filename(textBlock(2), 2)), "utf8"),
    "unrelated",
  );
});

test("paginates in order and rejects duplicate or looping pages before modifying the destination", async (t) => {
  const dir = await directory(t);
  const calls: number[] = [];
  const paginated = adapter([], {
    async listContents(_id, page) {
      calls.push(page);
      return {
        data: [textBlock(page)],
        meta: {
          current_page: page,
          per_page: 1,
          total_pages: 2,
          total_count: 2,
          has_more_pages: page === 1,
          next_page: 2,
        },
      };
    },
  });
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: paginated,
  });
  assert.equal(result.downloaded, 2);
  assert.deepEqual(calls, [1, 2]);
  const before = await readFile(join(dir, "manifest.json"), "utf8");
  await assert.rejects(
    executeDownload({
      ...options,
      directory: dir,
      adapter: adapter([], {
        async listContents() {
          return {
            data: [textBlock()],
            meta: {
              current_page: 1,
              per_page: 1,
              total_count: 2,
              total_pages: 2,
              has_more_pages: true,
              next_page: 1,
            },
          };
        },
      }),
    }),
    /pagination/,
  );
  assert.equal(await readFile(join(dir, "manifest.json"), "utf8"), before);
});

test("bounded concurrency and cancellation settle active workers and preserve a resumable manifest", async (t) => {
  const dir = await directory(t);
  const controller = new AbortController();
  let active = 0;
  let peak = 0;
  const result = await executeDownload({
    ...options,
    directory: dir,
    signal: controller.signal,
    adapter: adapter([imageBlock(1), imageBlock(2), imageBlock(3)], {
      async openAsset(_url, signal) {
        active++;
        peak = Math.max(active, peak);
        return Readable.from(
          (async function* () {
            try {
              yield "part";
              await new Promise<void>((resolve) => {
                signal.addEventListener("abort", () => resolve(), {
                  once: true,
                });
                setTimeout(() => controller.abort(new Error("cancelled")), 20);
              });
              signal.throwIfAborted();
            } finally {
              active--;
            }
          })(),
        );
      },
    }),
  });
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.equal(downloadExitCode(result), 130);
  assert.equal((await manifest(dir)).complete, false);
  assert.ok(
    !(await readdir(dir)).some(
      (name) => name.endsWith(".part") || name.endsWith(".lock"),
    ),
  );
});

test("validates flags before any work, including booleans before positional arguments", () => {
  const parsed = parseArgs([
    "--prune",
    "--overwrite",
    "test-channel",
    "./export",
  ]);
  assert.equal(parseDownloadOptions(parsed.args, parsed.flags).prune, true);
  assert.equal(
    parseDownloadOptions(["channel"], { overwrite: "false" }).overwrite,
    false,
  );
  const invalidFlags: Flags[] = [
    { size: "huge" },
    { concurrency: "17" },
    { type: "Imag" },
    { dir: true },
    { zip: true },
    { prune: true, type: "Image" },
    { "link-format": "html" },
  ];
  for (const flags of invalidFlags)
    assert.throws(() => parseDownloadOptions(["channel"], flags));
  assert.throws(() =>
    parseDownloadOptions(["channel", "here"], { dir: "there" }),
  );
});

test("filenames are portable, bounded, distinct across types; shortcuts escape XML and reject executable URLs", () => {
  assert.equal(safeFilename("../../a:b?.png"), ".._.._a_b_.png");
  assert.ok(Buffer.byteLength(safeFilename("😀".repeat(200))) <= 150);
  assert.equal(safeFilename("CON"), "_CON");
  assert.match(
    urlShortcut("https://example.com/?x=1&y=2", "webloc"),
    /&amp;y=2/,
  );
  assert.match(
    urlShortcut("https://example.com", "url"),
    /^\[InternetShortcut\]\r\nURL=/,
  );
  assert.throws(() => urlShortcut("javascript:alert(1)", "webloc"));
  assert.throws(() =>
    urlShortcut("https://user:password@example.com", "webloc"),
  );
  assert.notEqual(filename(textBlock(10)), filename(channel));
  assert.equal(
    resolveTarget(imageBlock(), 1, { ...options, size: "large" })!.filename,
    "1_photo-png-w-800.jpg",
  );
});

test("rejects foreign manifests and malicious managed paths without touching files", async (t) => {
  const dir = await directory(t);
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock()]),
  });
  const data = await manifest(dir);
  data.files[0].filename = "../escape";
  await writeFile(join(dir, "manifest.json"), JSON.stringify(data));
  await assert.rejects(
    executeDownload({
      ...options,
      directory: dir,
      prune: true,
      adapter: adapter([]),
    }),
    /incompatible/,
  );
  assert.ok((await readdir(dir)).includes(filename(textBlock())));
});

test("CDN adapter requires HTTP 200, sends a user agent, and honors Retry-After", async (t) => {
  let init: RequestInit | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, request: RequestInit) => {
      init = request;
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": "2" },
      });
    },
  );
  const network = defaultDownloadAdapter();
  await assert.rejects(
    network.openAsset(
      "https://cdn.example/image",
      new AbortController().signal,
    ),
    (error: unknown) =>
      error instanceof ArenaError && error.rateLimit?.retryAfterMs === 2000,
  );
  assert.ok(new Headers(init?.headers).get("user-agent"));
  assert.equal(new Headers(init?.headers).get("authorization"), null);
});

test("rate limiting uses the server delay and permanent HTTP errors do not retry", async (t) => {
  const dir = await directory(t);
  let attempts = 0;
  const delays: number[] = [];
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([imageBlock()], {
      async openAsset() {
        if (++attempts === 1)
          throw new ArenaError("limited", 429, {
            rateLimit: { retryAfterMs: 2000 },
          });
        return Readable.from(["bytes"]);
      },
      async sleep(ms) {
        delays.push(ms);
      },
    }),
  });
  assert.equal(result.downloaded, 1);
  assert.deepEqual(delays, [2000]);
  attempts = 0;
  const failed = await executeDownload({
    ...options,
    directory: dir,
    overwrite: true,
    adapter: adapter([imageBlock()], {
      async openAsset() {
        attempts++;
        throw new ArenaError("gone", 404);
      },
    }),
  });
  assert.equal(failed.failed, 1);
  assert.equal(attempts, 1);
});

test("prune rechecks actual channel contents even when channel timestamps do not change", async (t) => {
  const dir = await directory(t);
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock(1), textBlock(2)]),
  });
  let listings = 0;
  const changing = adapter([], {
    async listContents(id, page, signal) {
      return adapter(
        ++listings === 1 ? [textBlock(1)] : [textBlock(1), textBlock(2)],
      ).listContents(id, page, signal);
    },
  });
  const result = await executeDownload({
    ...options,
    directory: dir,
    prune: true,
    adapter: changing,
  });
  assert.equal(result.pruned, 0);
  assert.equal(result.failed, 1);
  assert.ok((await readdir(dir)).includes(filename(textBlock(2), 2)));
});

test("prune preserves assets for pending blocks, and filtering preserves metadata without fetching excluded files", async (t) => {
  const dir = await directory(t);
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([imageBlock(2)]),
  });
  const pending: Block = { ...base, id: 2, type: "PendingBlock" };
  const result = await executeDownload({
    ...options,
    directory: dir,
    prune: true,
    adapter: adapter([pending]),
  });
  assert.equal(result.pruned, 0);
  assert.equal(result.retained, 1);
  const filtered = await executeDownload({
    ...options,
    directory: dir,
    type: "Text",
    adapter: adapter([imageBlock(2), textBlock()], {
      async openAsset() {
        throw new Error("should not fetch");
      },
    }),
  });
  assert.equal(filtered.downloaded, 1);
  assert.equal((await manifest(dir)).entries[0].status, "filtered");
});

test("missing requested image sizes are explicit failures; ZIP cannot overwrite the manifest", async (t) => {
  const dir = await directory(t);
  const image = imageBlock();
  if (image.type === "Image") image.image.src = undefined;
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([image]),
  });
  assert.equal(result.failed, 1);
  assert.match(result.failures[0].error, /No original image/);
  const before = await readFile(join(dir, "manifest.json"), "utf8");
  await assert.rejects(
    executeDownload({
      ...options,
      directory: dir,
      zip: join(dir, "manifest.json"),
      overwrite: true,
      adapter: adapter([]),
    }),
    /conflicts/,
  );
  assert.equal(await readFile(join(dir, "manifest.json"), "utf8"), before);
});

test("asset adapter rejects accepted, empty, and truncated responses", async (t) => {
  const responses = [
    new Response(null, { status: 202 }),
    new Response("", { status: 200 }),
    new Response("short", { status: 200, headers: { "Content-Length": "50" } }),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift()!);
  const network = defaultDownloadAdapter();
  const signal = new AbortController().signal;
  await assert.rejects(
    network.openAsset("https://cdn.example/a", signal),
    /202/,
  );
  for (const expected of [/empty/, /truncated/]) {
    const body = await network.openAsset("https://cdn.example/a", signal);
    await assert.rejects(async () => {
      for await (const _chunk of body) {
        /* Drain the response. */
      }
    }, expected);
  }
});

test("filenames match Are.na's web channel export: <position>_<file_name>.<extension>", () => {
  const image = imageBlock();
  assert.equal(image.type, "Image");
  assert.equal(
    resolveTarget(image, 3, options)?.filename,
    "3_photo-png-w-800.png",
  );
  image.title = "Ünïcödé Straße / Æsthetics & Co.";
  assert.equal(blockFileName(image), "unicode-strasse-aesthetics-co");
  image.title =
    "A very long title that keeps going well beyond fifty characters";
  assert.equal(
    blockFileName(image),
    "a-very-long-title-that-keeps-going-well-beyond-...",
  );
  image.title = "Строка";
  assert.equal(blockFileName(image), "");
  image.title = null;
  image.image.content_type = "image/tiff";
  assert.equal(resolveTarget(image, 1, options)?.filename, "1_untitled.tif");
  image.image.small.src = "https://images.are.na/eyJvcGFxdWUiOnRydWV9";
  assert.equal(
    resolveTarget(image, 1, { ...options, size: "small" })?.filename,
    "1_untitled.jpg",
  );
  image.image.content_type = "image/gif";
  assert.equal(
    resolveTarget(image, 1, { ...options, size: "small" })?.filename,
    "1_untitled.gif",
  );
  assert.equal(
    resolveTarget(
      {
        ...textBlock(5, "Some <b>bold</b> & longer text content"),
        title: null,
      },
      2,
      options,
    )?.filename,
    "2_some-bold-amp-longer-tex.txt",
  );
  assert.equal(
    resolveTarget(
      {
        ...base,
        type: "Attachment",
        attachment: { url: "https://cdn.example/a", file_extension: "PDF" },
      },
      4,
      options,
    )?.filename,
    "4_note.pdf",
  );
  assert.equal(filename(channel, 6), "6_test-channel.webloc");
  assert.match(
    (resolveTarget(channel, 6, options) as { content: string }).content,
    /www.are.na\/owner\/test-channel/,
  );
});

test("transfers time out only when data stops arriving, then retry", async (t) => {
  const previous = process.env["ARENA_REQUEST_TIMEOUT_MS"];
  process.env["ARENA_REQUEST_TIMEOUT_MS"] = "60";
  t.after(() => {
    if (previous === undefined) delete process.env["ARENA_REQUEST_TIMEOUT_MS"];
    else process.env["ARENA_REQUEST_TIMEOUT_MS"] = previous;
  });
  const dir = await directory(t);
  let attempts = 0;
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([imageBlock(1), imageBlock(2)], {
      async openAsset(url, signal) {
        if (url.includes("/1/"))
          // A slow but steady transfer that outlasts the idle timeout overall.
          return Readable.from(
            (async function* () {
              for (let i = 0; i < 6; i++) {
                await new Promise((resolve) => setTimeout(resolve, 25));
                yield "chunk";
              }
            })(),
          );
        if (++attempts > 1) return Readable.from(["complete"]);
        return Readable.from(
          (async function* () {
            yield "partial";
            await new Promise((resolve) =>
              signal.addEventListener("abort", resolve, { once: true }),
            );
            signal.throwIfAborted();
          })(),
        );
      },
    }),
  });
  assert.equal(result.failed, 0);
  assert.equal(attempts, 2);
  assert.equal(
    await readFile(join(dir, filename(imageBlock(1))), "utf8"),
    "chunk".repeat(6),
  );
  assert.equal(
    await readFile(join(dir, filename(imageBlock(2), 2)), "utf8"),
    "complete",
  );
});

test("reclaims a lock left by a dead process and removes its partial files, but respects a live lock", async (t) => {
  const dir = await directory(t);
  const lock = join(dir, ".arena-download.lock");
  const dead = spawnSync(process.execPath, ["-e", ""]).pid;
  await writeFile(lock, `${dead}@${hostname()}`);
  const partial = join(dir, ".arena-00000000-0000-0000-0000-000000000000.part");
  await writeFile(partial, "partial");
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock()]),
  });
  assert.equal(result.downloaded, 1);
  const names = await readdir(dir);
  assert.ok(!names.some((name) => name.endsWith(".part")));
  assert.ok(!names.includes(".arena-download.lock"));
  await writeFile(lock, `${process.pid}@${hostname()}`);
  await assert.rejects(
    executeDownload({
      ...options,
      directory: dir,
      adapter: adapter([textBlock()]),
    }),
    /locked/,
  );
  await writeFile(lock, `${dead}@another-host`);
  await assert.rejects(
    executeDownload({
      ...options,
      directory: dir,
      adapter: adapter([textBlock()]),
    }),
    /locked/,
  );
});

test("re-exporting replaces an earlier ZIP without forcing downloads, but never clobbers other files", async (t) => {
  const dir = await directory(t);
  const zip = `${dir}.zip`;
  t.after(() => rm(zip, { force: true }));
  let fetches = 0;
  const network = {
    async openAsset() {
      fetches++;
      return Readable.from(["image"]);
    },
  };
  await executeDownload({
    ...options,
    directory: dir,
    zip,
    adapter: adapter([imageBlock()], network),
  });
  const result = await executeDownload({
    ...options,
    directory: dir,
    zip,
    adapter: adapter([imageBlock(), textBlock()], network),
  });
  assert.equal(result.zip, zip);
  assert.equal(fetches, 1);
  assert.equal(unzip(await readFile(zip)).size, 5);
  const unrelated = join(dir, "notes.txt");
  await writeFile(unrelated, "keep");
  await assert.rejects(
    executeDownload({
      ...options,
      directory: dir,
      zip: unrelated,
      adapter: adapter([textBlock()]),
    }),
    /not a ZIP archive/,
  );
  assert.equal(await readFile(unrelated, "utf8"), "keep");
});

test("detects same-size local edits and reports a corrupt manifest clearly", async (t) => {
  const dir = await directory(t);
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock()]),
  });
  await writeFile(join(dir, filename(textBlock())), "HELLO");
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock(1, "remote")]),
  });
  assert.match(result.failures[0].error, /modified/);
  await writeFile(join(dir, "manifest.json"), "{");
  await assert.rejects(
    executeDownload({
      ...options,
      directory: dir,
      adapter: adapter([textBlock()]),
    }),
    /manifest.json is not valid JSON/,
  );
});

test("offline index links to the original source of links", async (t) => {
  const dir = await directory(t);
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([
      {
        ...base,
        id: 4,
        type: "Link",
        source: { url: "https://example.com/article" },
      },
      {
        ...base,
        id: 5,
        type: "Link",
        source: { url: "javascript:alert(1)" },
      },
    ]),
  });
  const html = await readFile(join(dir, "index.html"), "utf8");
  assert.ok(html.includes('href="https://example.com/article">Source</a>'));
  assert.ok(!html.includes("javascript:"));
});

test("reordering, removing, and retitling blocks renames files without downloading them", async (t) => {
  const dir = await directory(t);
  let fetches = 0;
  const network = {
    async openAsset() {
      fetches++;
      return Readable.from(["image"]);
    },
  };
  const first = { ...textBlock(1, "first"), title: null };
  const second = { ...textBlock(2, "second"), title: null };
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([first, second, imageBlock(3)], network),
  });
  // Two blocks trade places, so each file's new name is the other's old name.
  const twin = { ...textBlock(4, "same"), title: "Same" };
  const other = { ...textBlock(5, "different"), title: "Same" };
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([twin, other], network),
  });
  const swapped = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([other, twin, imageBlock(3)], network),
  });
  assert.equal(swapped.downloaded, 0);
  assert.equal(swapped.renamed, 2);
  assert.equal(await readFile(join(dir, "1_same.txt"), "utf8"), "different");
  assert.equal(await readFile(join(dir, "2_same.txt"), "utf8"), "same");
  assert.equal(fetches, 1);
  const retitled = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([{ ...imageBlock(3), title: "Renamed" }], network),
  });
  assert.equal(retitled.downloaded, 0);
  assert.equal(retitled.renamed, 1);
  assert.ok((await readdir(dir)).includes("1_renamed.png"));
  assert.equal(fetches, 1);
  assert.ok(!(await readdir(dir)).some((name) => name.endsWith(".part")));
});

test("CSV quotes commas, quotes, and newlines", () => {
  const manifest = {
    entries: [
      {
        item: {
          ...textBlock(),
          title: 'Say "hi", then',
          description: { markdown: "two\nlines", plain: "", html: "" },
          source: { url: "https://example.com" },
        },
        filename: "1_say-hi-then.txt",
        status: "downloaded",
      },
    ],
  } as unknown as DownloadManifest;
  assert.equal(
    buildDownloadCsv(manifest).split("\n").slice(1).join("\n"),
    '1,1_say-hi-then.txt,"Say ""hi"", then","two\nlines",2026-01-01,2026-01-02,https://example.com',
  );
});

test("moving a block onto a removed block's name keeps the removed file until --prune", async (t) => {
  const dir = await directory(t);
  const removed = { ...textBlock(11, "removed"), title: "Same" };
  const kept = { ...textBlock(12, "kept"), title: "Same" };
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([removed, kept]),
  });
  const events: DownloadEvent[] = [];
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([kept]),
    onEvent: (event) => events.push(event),
  });
  assert.equal(result.renamed, 1);
  assert.equal(result.pruned, 0);
  assert.equal(result.retained, 1);
  assert.equal(await readFile(join(dir, "1_same.txt"), "utf8"), "kept");
  assert.equal(
    await readFile(join(dir, "1_same~block-11.txt"), "utf8"),
    "removed",
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === "file_retained" && event.file === "1_same~block-11.txt",
    ),
  );
  // A new block taking a removed block's name is the same hazard without a rename.
  const added = { ...textBlock(13, "added"), title: "Same" };
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([added]),
  });
  assert.equal(await readFile(join(dir, "1_same.txt"), "utf8"), "added");
  assert.equal(
    await readFile(join(dir, "1_same~block-12.txt"), "utf8"),
    "kept",
  );
  const pruned = await executeDownload({
    ...options,
    directory: dir,
    prune: true,
    adapter: adapter([added]),
  });
  assert.equal(pruned.pruned, 2);
  assert.deepEqual(
    (await readdir(dir)).filter((name) => name.includes("same")),
    ["1_same.txt"],
  );
});

test("an interrupted rename is completed from its journal, even when assets are unavailable", async (t) => {
  const dir = await directory(t);
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([imageBlock(1), imageBlock(2)], {
      async openAsset(url) {
        return Readable.from([`bytes:${url}`]);
      },
    }),
  });
  const [first, second] = (await manifest(dir)).files;
  // Simulate a run killed after staging both files of a swap.
  const moves = [
    { record: first, from: first.filename, to: second.filename },
    { record: second, from: second.filename, to: first.filename },
  ].map((move) => ({
    ...move,
    staged: `.arena-move-${crypto.randomUUID()}`,
  }));
  for (const move of moves)
    await rename(join(dir, move.from), join(dir, move.staged));
  await writeFile(join(dir, ".arena-moves.json"), JSON.stringify({ moves }));
  const result = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([imageBlock(2), imageBlock(1)], {
      async openAsset() {
        throw new ArenaError("gone", 404);
      },
    }),
  });
  assert.equal(result.failed, 0);
  assert.equal(result.downloaded, 0);
  assert.equal(result.unchanged, 2);
  assert.equal(
    await readFile(join(dir, filename(imageBlock(2), 1)), "utf8"),
    "bytes:https://cdn.example/2/original.png",
  );
  assert.equal(
    await readFile(join(dir, filename(imageBlock(1), 2)), "utf8"),
    "bytes:https://cdn.example/1/original.png",
  );
  assert.ok(
    !(await readdir(dir)).some((name) => name.startsWith(".arena-move")),
  );
  assert.ok(!(await readdir(dir)).includes(".arena-moves.json"));
});

test("a rename stopped between any link() and rm() is recovered", async (t) => {
  const assets = {
    async openAsset(url: string) {
      return Readable.from([`bytes:${url}`]);
    },
  };
  const gone = {
    async openAsset(): Promise<Readable> {
      throw new ArenaError("gone", 404);
    },
  };
  const staged = () => `.arena-move-${crypto.randomUUID()}`;
  const scenarios = [
    {
      name: "swap",
      before: [imageBlock(1), imageBlock(2)],
      after: [imageBlock(2), imageBlock(1)],
      expected: {
        [filename(imageBlock(2), 1)]:
          "bytes:https://cdn.example/2/original.png",
        [filename(imageBlock(1), 2)]:
          "bytes:https://cdn.example/1/original.png",
      },
      journal: ([first, second]: ManagedFile[]) => [
        {
          record: first,
          from: first.filename,
          to: second.filename,
          staged: staged(),
        },
        {
          record: second,
          from: second.filename,
          to: first.filename,
          staged: staged(),
        },
      ],
    },
    {
      name: "displacement",
      before: [
        { ...textBlock(11, "removed"), title: "Same" },
        { ...textBlock(12, "kept"), title: "Same" },
      ],
      after: [{ ...textBlock(12, "kept"), title: "Same" }],
      expected: { "1_same.txt": "kept", "1_same~block-11.txt": "removed" },
      journal: ([removed, kept]: ManagedFile[]) => [
        { record: removed, from: removed.filename, to: "1_same~block-11.txt" },
        {
          record: kept,
          from: kept.filename,
          to: removed.filename,
          staged: staged(),
        },
      ],
    },
  ];
  // Replays a run's renames: displacements, then staging, then publishing.
  const steps = (
    moves: Array<{ from: string; to: string; staged?: string }>,
  ) => {
    const all: Array<[string, string?]> = [];
    for (const move of moves.filter((move) => !move.staged))
      all.push([move.from, move.to], [move.from]);
    for (const move of moves.filter((move) => move.staged))
      all.push([move.from, move.staged], [move.from]);
    for (const move of moves.filter((move) => move.staged))
      all.push([move.staged!, move.to], [move.staged!]);
    return all;
  };
  for (const scenario of scenarios) {
    for (let stop = 0, total = 0; stop <= total; stop++) {
      const dir = await directory(t);
      await executeDownload({
        ...options,
        directory: dir,
        adapter: adapter(scenario.before, assets),
      });
      // Records are saved in completion order; the journals expect channel order.
      const records = (await manifest(dir)).files.sort(
        (a, b) => Number(a.item.split("-")[1]) - Number(b.item.split("-")[1]),
      );
      const moves = scenario.journal(records);
      total = steps(moves).length;
      const label = `${scenario.name}, stopped after ${stop} of ${total} steps`;
      await writeFile(
        join(dir, ".arena-moves.json"),
        JSON.stringify({ moves }),
      );
      for (const [from, to] of steps(moves).slice(0, stop))
        if (to) await link(join(dir, from), join(dir, to));
        else await rm(join(dir, from));
      const recovered = await executeDownload({
        ...options,
        directory: dir,
        adapter: adapter(scenario.after, gone),
      });
      assert.equal(recovered.failed, 0, label);
      assert.equal(recovered.downloaded, 0, label);
      const names = (await readdir(dir)).filter(
        (name) => !name.startsWith(".") && name.includes("_"),
      );
      assert.deepEqual(
        names.sort(),
        Object.keys(scenario.expected).sort(),
        label,
      );
      for (const [name, text] of Object.entries(scenario.expected))
        assert.equal(await readFile(join(dir, name), "utf8"), text, label);
      assert.ok(
        !(await readdir(dir)).some((name) => name.startsWith(".arena-move")),
        label,
      );
      const resync = await executeDownload({
        ...options,
        directory: dir,
        adapter: adapter(scenario.after, gone),
      });
      assert.equal(resync.failed, 0, label);
      assert.equal(resync.unchanged, scenario.after.length, label);
    }
  }
});

test("an edit that preserves size and mtime is never pruned or replaced", async (t) => {
  const dir = await directory(t);
  const one = textBlock(1, "one");
  const two = textBlock(2, "two");
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([one, two]),
  });
  const pinned = new Date(1_000_000_000_000);
  for (const position of [1, 2])
    await utimes(join(dir, `${position}_note.txt`), pinned, pinned);
  // Record the pinned mtime so the size-and-mtime fast path matches.
  await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([one, two]),
  });
  assert.ok(
    (await manifest(dir)).files.every(
      (file) => file.mtime_ms === pinned.getTime(),
    ),
  );
  for (const [position, edit] of [
    [1, "ONE"],
    [2, "TWO"],
  ] as const) {
    await writeFile(join(dir, `${position}_note.txt`), edit);
    await utimes(join(dir, `${position}_note.txt`), pinned, pinned);
  }
  const pruned = await executeDownload({
    ...options,
    directory: dir,
    prune: true,
    adapter: adapter([one]),
  });
  assert.equal(pruned.pruned, 0);
  assert.match(pruned.failures[0].error, /modified/);
  const replaced = await executeDownload({
    ...options,
    directory: dir,
    adapter: adapter([textBlock(1, "remote")]),
  });
  assert.equal(replaced.downloaded, 0);
  assert.match(replaced.failures[0].error, /modified/);
  assert.equal(await readFile(join(dir, "1_note.txt"), "utf8"), "ONE");
  assert.equal(await readFile(join(dir, "2_note.txt"), "utf8"), "TWO");
});
