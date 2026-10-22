import { createReadStream, createWriteStream, type Stats } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { ZipFile } from "yazl";
import { ArenaError, client, getData } from "../api/client";
import type { Channel, Connectable, PaginationMeta } from "../api/types";
import { cancellationSignal, configuredTimeoutMs } from "./network";
import {
  arenaUrl,
  escapeMarkup,
  httpUrl,
  safeFilename,
  itemKey,
  resolveTarget,
  IMAGE_SIZES,
  DOWNLOAD_TYPES,
  type DownloadTarget,
  type DownloadType,
  type ImageSize,
  type LinkFormat,
} from "./download-format";

export interface DownloadOptions {
  channel: string;
  directory?: string;
  size: ImageSize;
  linkFormat: LinkFormat;
  concurrency: number;
  type?: DownloadType;
  overwrite: boolean;
  prune: boolean;
  zip?: string;
}
export interface DownloadAdapter {
  getChannel(id: string, signal: AbortSignal): Promise<Channel>;
  listContents(
    id: string,
    page: number,
    signal: AbortSignal,
  ): Promise<{ data: Connectable[]; meta: PaginationMeta }>;
  openAsset(url: string, signal: AbortSignal): Promise<Readable>;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}
export interface ManagedFile {
  filename: string;
  /** The block or channel the file was exported from, e.g. `block-123`. */
  item: string;
  bytes: number;
  sha256: string;
  source_key: string;
  /** Lets later syncs skip hashing files whose size and mtime are unchanged. */
  mtime_ms?: number;
}
export interface DownloadEntry {
  item: Connectable;
  filename: string | null;
  status:
    | "pending"
    | "downloaded"
    | "unchanged"
    | "filtered"
    | "metadata_only"
    | "failed";
  error?: string;
}
export interface DownloadManifest {
  version: 1;
  channel: Channel;
  exported_at: string;
  complete: boolean;
  options: { size: ImageSize; link_format: LinkFormat; type?: DownloadType };
  entries: DownloadEntry[];
  /** Includes retained files from earlier runs so later --prune can find them. */
  files: ManagedFile[];
}
export interface DownloadSummary {
  channel: string;
  directory: string;
  listed: number;
  downloaded: number;
  unchanged: number;
  failed: number;
  pruned: number;
  /** Unchanged files moved because their position or title changed. */
  renamed: number;
  retained: number;
  metadata_only: number;
  cancelled: boolean;
  zip?: string;
  failures: Array<{ file: string; error: string }>;
}
export type DownloadEvent =
  | { type: "list_started"; channel: string }
  | { type: "list_progress"; fetched: number; total: number }
  | { type: "list_completed"; total: number }
  | {
      type: "file_progress";
      file: string;
      status: DownloadEntry["status"];
      completed: number;
      total: number;
    }
  | { type: "file_failed"; file: string; error: string }
  | { type: "file_renamed"; file: string; from: string }
  /** A file of another block was moved aside to make room; --prune removes it. */
  | { type: "file_retained"; file: string; from: string }
  | { type: "file_pruned"; file: string }
  | { type: "archive_started"; path: string }
  | { type: "completed"; summary: DownloadSummary };

export function validateDownloadOptions(options: DownloadOptions): void {
  if (!options.channel.trim())
    throw new Error("A channel ID or slug is required");
  if (!IMAGE_SIZES.includes(options.size))
    throw new Error(`Invalid --size: ${options.size}`);
  if (!["webloc", "url"].includes(options.linkFormat))
    throw new Error("--link-format must be webloc or url");
  if (options.type && !DOWNLOAD_TYPES.includes(options.type))
    throw new Error(`Invalid --type: ${options.type}`);
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 16
  )
    throw new Error("--concurrency must be an integer from 1 to 16");
  if (options.prune && options.type)
    throw new Error(
      "--prune cannot be combined with --type; pruning requires a full channel sync",
    );
}

export function defaultDownloadAdapter(): DownloadAdapter {
  return {
    getChannel: (id, signal) =>
      getData(
        client.GET("/v3/channels/{id}", { params: { path: { id } }, signal }),
      ),
    listContents: (id, page, signal) =>
      getData(
        client.GET("/v3/channels/{id}/contents", {
          params: {
            path: { id },
            query: { page, per: 100, sort: "position_asc" },
          },
          signal,
        }),
      ),
    async openAsset(url, signal) {
      // Use a standalone request: never forward the API's bearer token to assets.
      const response = await fetch(url, {
        signal,
        headers: {
          "User-Agent": "@aredotna/cli (arena download)",
          "Accept-Encoding": "identity",
        },
      });
      if (response.status !== 200 || !response.body) {
        await response.body?.cancel();
        const raw = response.headers.get("retry-after");
        const seconds = raw === null ? NaN : Number(raw);
        const delay = Number.isFinite(seconds)
          ? seconds * 1000
          : raw
            ? Date.parse(raw) - Date.now()
            : undefined;
        throw new ArenaError(
          `Asset returned HTTP ${response.status}`,
          response.status,
          { rateLimit: { retryAfterMs: delay } },
        );
      }
      const expected = response.headers.get("content-encoding")
        ? null
        : response.headers.get("content-length");
      let bytes = 0;
      const body = Readable.fromWeb(
        response.body as Parameters<typeof Readable.fromWeb>[0],
      );
      return Readable.from(
        (async function* () {
          for await (const chunk of body) {
            bytes += chunk.length;
            yield chunk;
          }
          if (bytes === 0)
            throw new ArenaError("Asset returned an empty body", 502);
          if (expected !== null && bytes !== Number(expected))
            throw new ArenaError("Asset download was truncated", 502);
        })(),
      );
    },
    sleep: async (ms, signal) => {
      await sleep(ms, undefined, { signal });
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function isTransient(error: unknown): boolean {
  if (error instanceof ArenaError)
    return [202, 408, 425, 429].includes(error.status) || error.status >= 500;
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    error.name === "TimeoutError" ||
    error instanceof TypeError ||
    [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ECONNREFUSED",
      "ERR_STREAM_PREMATURE_CLOSE",
    ].includes(code ?? "") ||
    /fetch failed|terminated|socket/i.test(error.message)
  );
}
async function retry<T>(
  run: () => Promise<T>,
  adapter: DownloadAdapter,
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      return await run();
    } catch (error) {
      signal.throwIfAborted();
      if (attempt >= 2 || !isTransient(error)) throw error;
      const requested =
        error instanceof ArenaError ? error.rateLimit?.retryAfterMs : undefined;
      // If the server asks for a long pause, surface it instead of retrying early.
      if (requested !== undefined && requested > 60_000) throw error;
      await adapter.sleep(
        Math.max(
          300 * 2 ** attempt,
          Number.isFinite(requested) ? requested! : 0,
        ),
        signal,
      );
    }
  }
}

async function fileInfo(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function digestFile(
  path: string,
  signal?: AbortSignal,
): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash("sha256");
  let bytes = 0;
  const stream = createReadStream(path, { signal });
  for await (const chunk of stream) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}
/**
 * Size and mtime are enough to skip an unchanged file, but anything that
 * deletes or replaces a file must `verify` its hash: an edit can preserve both.
 */
async function matchesRecord(
  path: string,
  info: Stats,
  record: ManagedFile,
  signal?: AbortSignal,
  verify = false,
): Promise<boolean> {
  if (info.size !== record.bytes) return false;
  if (!verify && info.mtimeMs === record.mtime_ms) return true;
  return (await digestFile(path, signal)).sha256 === record.sha256;
}
const NO_HARD_LINK_CODES = [
  "EPERM",
  "ENOTSUP",
  "EOPNOTSUPP",
  "ENOSYS",
  "EXDEV",
];
/** Move a finished temporary file into place without replacing a file created meanwhile. */
async function publishExclusive(
  temporary: string,
  destination: string,
): Promise<void> {
  const conflict = () =>
    new Error(
      `${basename(destination)} was created by another process; rerun to resolve it`,
    );
  try {
    await link(temporary, destination);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "";
    if (code === "EEXIST") throw conflict();
    if (!NO_HARD_LINK_CODES.includes(code)) throw error;
    // Filesystems such as exFAT lack hard links; a checked rename is the closest equivalent.
    if (await fileInfo(destination)) throw conflict();
    await rename(temporary, destination);
  }
}
/** Rename without ever replacing an existing file. */
async function moveExclusive(from: string, to: string): Promise<void> {
  await publishExclusive(from, to);
  await rm(from, { force: true });
}
async function atomicText(path: string, text: string): Promise<void> {
  const temporary = join(dirname(path), `.arena-${randomUUID()}.part`);
  try {
    await writeFile(temporary, text, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
const LOCK_FILENAME = ".arena-download.lock";
const TEMPORARY_FILENAME = /^\.arena-[0-9a-f-]{36}\.part$/;
function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
/** Take the directory lock, reclaiming one left by a crashed process on this machine. */
async function acquireLock(lockPath: string) {
  const owner = `${process.pid}@${hostname()}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const lock = await open(lockPath, "wx");
      try {
        await lock.writeFile(owner);
      } catch (error) {
        await lock.close();
        await rm(lockPath, { force: true });
        throw error;
      }
      return lock;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const [pid, host] = (
        await readFile(lockPath, "utf8").catch(() => "")
      ).split("@");
      const stale =
        attempt === 0 &&
        host === hostname() &&
        Number.isSafeInteger(Number(pid)) &&
        Number(pid) > 0 &&
        !processIsRunning(Number(pid));
      if (!stale)
        throw new Error(
          `Export directory is locked by another sync. If none is running, remove ${lockPath} and retry.`,
        );
      await rm(lockPath, { force: true });
    }
  }
}
function validManagedFile(value: unknown): value is ManagedFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<ManagedFile>;
  return (
    typeof file.filename === "string" &&
    /^\d+_/.test(file.filename) &&
    typeof file.item === "string" &&
    /^(block|channel)-\d+$/.test(file.item) &&
    !/[\\/\x00-\x1f]/.test(file.filename) &&
    file.filename === basename(file.filename) &&
    typeof file.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(file.sha256) &&
    typeof file.bytes === "number" &&
    Number.isSafeInteger(file.bytes) &&
    file.bytes >= 0 &&
    typeof file.source_key === "string" &&
    (file.mtime_ms === undefined || Number.isFinite(file.mtime_ms))
  );
}
async function readPrevious(
  directory: string,
  channel: Channel,
): Promise<ManagedFile[]> {
  const path = join(directory, "manifest.json");
  const info = await fileInfo(path);
  if (!info) {
    for (const generated of ["index.html", csvFilename(channel)])
      if (await fileInfo(join(directory, generated)))
        throw new Error(
          `Destination has a ${generated} without an export manifest; choose another directory`,
        );
    return [];
  }
  if (!info.isFile()) throw new Error("manifest.json must be a regular file");
  let previous: Partial<DownloadManifest> | null;
  try {
    previous = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(
      "manifest.json is not valid JSON; restore it or choose another directory",
    );
  }
  if (
    !previous ||
    previous.version !== 1 ||
    previous.channel?.id !== channel.id ||
    !Array.isArray(previous.files) ||
    !previous.files.every(validManagedFile)
  ) {
    throw new Error(
      "Destination contains an incompatible manifest or belongs to another channel; choose another directory",
    );
  }
  return previous.files;
}
function sourceKey(item: Connectable, target: DownloadTarget): string {
  const revision =
    item.type === "Image"
      ? (item.image.updated_at ?? item.updated_at)
      : item.type === "Attachment"
        ? (item.attachment.updated_at ?? item.updated_at)
        : "";
  return createHash("sha256")
    .update(
      target.kind === "text" ? target.content : `${target.url}\n${revision}`,
    )
    .digest("hex");
}

async function syncTarget(
  target: DownloadTarget,
  item: Connectable,
  directory: string,
  previous: ManagedFile | undefined,
  options: DownloadOptions,
  adapter: DownloadAdapter,
  signal: AbortSignal,
): Promise<{ status: "downloaded" | "unchanged"; file: ManagedFile }> {
  const destination = join(directory, target.filename);
  const info = await fileInfo(destination);
  if (info && !info.isFile())
    throw new Error("Destination is not a regular file");
  const key = sourceKey(item, target);
  const owner = itemKey(item);
  const modified = () =>
    new Error("Local file has been modified; use --overwrite to replace it");
  if (
    info &&
    previous?.item === owner &&
    previous.source_key === key &&
    !options.overwrite &&
    (await matchesRecord(destination, info, previous, signal))
  )
    return {
      status: "unchanged",
      file: { ...previous, mtime_ms: info.mtimeMs },
    };
  // Files of other blocks were moved aside already; one still here was edited.
  if (
    info &&
    previous &&
    !options.overwrite &&
    (previous.item !== owner ||
      !(await matchesRecord(destination, info, previous, signal, true)))
  )
    throw modified();

  return retry(
    async () => {
      const temporary = join(directory, `.arena-${randomUUID()}.part`);
      // Large files may legitimately take a long time, so time out only when data stops arriving.
      const idleMs = configuredTimeoutMs();
      const stalled = new AbortController();
      let idleTimer: NodeJS.Timeout | undefined;
      const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(
          () =>
            stalled.abort(
              new DOMException(
                `Transfer stalled for ${idleMs}ms`,
                "TimeoutError",
              ),
            ),
          idleMs,
        );
      };
      const transferSignal = AbortSignal.any([signal, stalled.signal]);
      try {
        resetIdleTimer();
        let bytes = 0;
        const hash = createHash("sha256");
        const meter = new Transform({
          transform(chunk, _encoding, callback) {
            resetIdleTimer();
            bytes += chunk.length;
            hash.update(chunk);
            callback(null, chunk);
          },
        });
        const source =
          target.kind === "text"
            ? Readable.from([Buffer.from(target.content)])
            : await adapter.openAsset(target.url, transferSignal);
        await pipeline(
          source,
          meter,
          createWriteStream(temporary, { flags: "wx" }),
          { signal: transferSignal },
        );
        clearTimeout(idleTimer);
        if (target.kind === "fetch" && bytes === 0)
          throw new ArenaError("Asset returned an empty body", 502);
        const sha256 = hash.digest("hex");
        const record = (mtimeMs: number): ManagedFile => ({
          filename: target.filename,
          bytes,
          sha256,
          item: itemKey(item),
          source_key: key,
          mtime_ms: mtimeMs,
        });
        signal.throwIfAborted();
        // Recover completed files left by an interrupted run, but never adopt different bytes.
        if (info && !previous && !options.overwrite) {
          if ((await digestFile(destination, signal)).sha256 !== sha256)
            throw new Error(
              "An unmanaged file already exists; use --overwrite or another directory",
            );
          return { status: "unchanged" as const, file: record(info.mtimeMs) };
        }
        if (info) {
          // Check again before replacing: a local edit made during transfer wins.
          const current = await fileInfo(destination);
          const unchanged =
            current?.isFile() &&
            (previous && !options.overwrite
              ? await matchesRecord(
                  destination,
                  current,
                  previous,
                  signal,
                  true,
                )
              : current.size === info.size && current.mtimeMs === info.mtimeMs);
          if (!unchanged)
            throw new Error(
              "Local file changed during download; rerun to resolve it",
            );
          await rename(temporary, destination);
        } else {
          await publishExclusive(temporary, destination);
        }
        const published = await lstat(destination);
        return {
          status: "downloaded" as const,
          file: record(published.mtimeMs),
        };
      } catch (error) {
        if (transferSignal.aborted && !signal.aborted)
          throw transferSignal.reason;
        throw error;
      } finally {
        clearTimeout(idleTimer);
        await rm(temporary, { force: true });
      }
    },
    adapter,
    signal,
  );
}

const MOVE_JOURNAL = ".arena-moves.json";
const STAGED_FILENAME = /^\.arena-move-[0-9a-f-]{36}$/;

interface Move {
  record: ManagedFile;
  from: string;
  to: string;
  /** Moves of files trading places pass through a staged name. */
  staged?: string;
}

/** A name that no export target can take: targets never contain "~". */
async function retainedName(
  directory: string,
  record: ManagedFile,
  taken: (name: string) => boolean,
): Promise<string> {
  const extension = extname(record.filename);
  const stem = record.filename.slice(0, -extension.length || undefined);
  for (let n = 1; ; n++) {
    const name = `${stem}~${record.item}${n > 1 ? `-${n}` : ""}${extension}`;
    if (!taken(name) && !(await fileInfo(join(directory, name)))) return name;
  }
}

function validMove(value: unknown): value is Move {
  if (!value || typeof value !== "object") return false;
  const move = value as Partial<Move>;
  return (
    validManagedFile(move.record) &&
    move.from === move.record.filename &&
    typeof move.to === "string" &&
    validManagedFile({ ...move.record, filename: move.to }) &&
    (move.staged === undefined ||
      (typeof move.staged === "string" && STAGED_FILENAME.test(move.staged)))
  );
}

/**
 * Another name for the same file, left by a move stopped between `link()` and
 * `rm()`: the move's source or destination, or a retained name it fell back to.
 */
async function linkedName(
  directory: string,
  name: string,
  move: Move,
): Promise<string | undefined> {
  const info = await fileInfo(join(directory, name));
  if (!info?.isFile() || info.nlink < 2) return undefined;
  const extension = extname(move.from);
  const retained = `${move.from.slice(0, -extension.length || undefined)}~${move.record.item}`;
  const candidates = [
    move.from,
    move.to,
    ...(await readdir(directory)).filter((other) => other.startsWith(retained)),
  ];
  for (const other of candidates) {
    if (other === name) continue;
    const twin = await fileInfo(join(directory, other));
    if (twin?.isFile() && twin.dev === info.dev && twin.ino === info.ino)
      return other;
  }
  return undefined;
}

/**
 * Finish moves interrupted by a terminated run, locating each file by its
 * hash. Returns whether a journal was found; the caller saves the manifest and
 * then removes the journal.
 */
async function recoverMoves(
  directory: string,
  files: Map<string, ManagedFile>,
): Promise<boolean> {
  const path = join(directory, MOVE_JOURNAL);
  if (!(await fileInfo(path))) return false;
  let moves: unknown;
  try {
    moves = (JSON.parse(await readFile(path, "utf8")) as { moves?: unknown })
      .moves;
  } catch {
    moves = undefined;
  }
  if (!Array.isArray(moves) || !moves.every(validMove))
    throw new Error(
      `${MOVE_JOURNAL} is damaged; restore it or choose another directory`,
    );
  const holds = async (name: string, record: ManagedFile) => {
    const info = await fileInfo(join(directory, name));
    return Boolean(
      info?.isFile() &&
      (await digestFile(join(directory, name))).sha256 === record.sha256,
    );
  };
  for (const move of moves) {
    for (const name of [move.from, move.to]) {
      const current = files.get(name);
      if (
        current?.item === move.record.item &&
        current.sha256 === move.record.sha256
      )
        files.delete(name);
    }
    let location: string | undefined;
    const staged = move.staged && join(directory, move.staged);
    if (staged && (await fileInfo(staged))) {
      const twin = await linkedName(directory, move.staged!, move);
      if (twin) {
        // Staging had not finished or publishing had: keep the other name.
        await rm(staged, { force: true });
        location = twin;
      } else {
        location = !(await fileInfo(join(directory, move.to)))
          ? move.to
          : !(await fileInfo(join(directory, move.from)))
            ? move.from
            : await retainedName(directory, move.record, (name) =>
                files.has(name),
              );
        await moveExclusive(staged, join(directory, location));
      }
    } else if ((await linkedName(directory, move.from, move)) === move.to) {
      await rm(join(directory, move.from), { force: true });
      location = move.to;
    } else if (await holds(move.to, move.record)) location = move.to;
    else if (await holds(move.from, move.record)) location = move.from;
    if (location) files.set(location, { ...move.record, filename: location });
  }
  return true;
}

/**
 * Filenames start with the channel position, so reordering, removing, or
 * retitling blocks changes them. Move unchanged files to their new names
 * instead of downloading them again, and move files of other blocks out of the
 * way under a retained name so that nothing is replaced without --prune.
 *
 * Everything is verified before the first rename, and the plan is journaled so
 * an interrupted run can be completed. Returns whether anything moved; the
 * caller saves the manifest and then removes the journal.
 */
async function reconcileNames(
  directory: string,
  planned: Array<{ item: Connectable; target: DownloadTarget }>,
  files: Map<string, ManagedFile>,
  signal: AbortSignal,
  onMove: (move: Move, retained: boolean) => void,
): Promise<boolean> {
  const unchanged = async (name: string, record: ManagedFile) => {
    const info = await fileInfo(join(directory, name));
    return Boolean(
      info?.isFile() &&
      (await matchesRecord(join(directory, name), info, record, signal)),
    );
  };
  const moving = new Map<string, Move>();
  for (const { item, target } of planned) {
    const owner = itemKey(item);
    if (files.get(target.filename)?.item === owner) continue;
    const key = sourceKey(item, target);
    const record = [...files.values()].find(
      (file) =>
        file.item === owner &&
        file.source_key === key &&
        !moving.has(file.filename),
    );
    if (record && (await unchanged(record.filename, record)))
      moving.set(record.filename, {
        record,
        from: record.filename,
        to: target.filename,
      });
  }
  const displaced: Move[] = [];
  const reserved = new Set<string>();
  for (const { item, target } of planned) {
    const occupant = files.get(target.filename);
    if (
      !occupant ||
      occupant.item === itemKey(item) ||
      moving.has(occupant.filename) ||
      !(await unchanged(occupant.filename, occupant))
    )
      continue;
    const to = await retainedName(
      directory,
      occupant,
      (name) => files.has(name) || reserved.has(name),
    );
    reserved.add(to);
    displaced.push({ record: occupant, from: occupant.filename, to });
  }
  // Moving onto an unmanaged or edited file would destroy it, so skip such
  // moves, and any move that depended on a skipped one vacating its name.
  let moves = [...moving.values()];
  for (let changed = true; changed; ) {
    const vacated = new Set([
      ...moves.map((move) => move.from),
      ...displaced.map((move) => move.from),
    ]);
    const kept: Move[] = [];
    for (const move of moves)
      if (vacated.has(move.to) || !(await fileInfo(join(directory, move.to))))
        kept.push(move);
    changed = kept.length !== moves.length;
    moves = kept;
  }
  if (!moves.length && !displaced.length) return false;
  for (const move of moves) move.staged = `.arena-move-${randomUUID()}`;
  await atomicText(
    join(directory, MOVE_JOURNAL),
    JSON.stringify({ moves: [...displaced, ...moves] }, null, 2) + "\n",
  );
  // No cancellation checks from here: the renames are quick and all-or-nothing.
  for (const move of displaced) {
    await moveExclusive(join(directory, move.from), join(directory, move.to));
    files.delete(move.from);
    files.set(move.to, { ...move.record, filename: move.to });
    onMove(move, true);
  }
  for (const move of moves) {
    await moveExclusive(
      join(directory, move.from),
      join(directory, move.staged!),
    );
    files.delete(move.from);
  }
  for (const move of moves) {
    // Something created at the destination meanwhile is kept; so is this file.
    const to = (await fileInfo(join(directory, move.to)))
      ? await retainedName(directory, move.record, (name) => files.has(name))
      : move.to;
    await moveExclusive(join(directory, move.staged!), join(directory, to));
    files.set(to, { ...move.record, filename: to });
    onMove({ ...move, to }, to !== move.to);
  }
  return true;
}

function sourceUrl(item: Connectable): string | null {
  if (item.type === "Channel" || !item.source?.url) return null;
  try {
    return httpUrl(item.source.url);
  } catch {
    return null;
  }
}

function csvFilename(channel: Channel): string {
  return `${safeFilename(channel.slug)}.csv`;
}

function csvField(value: string | number | null | undefined): string {
  const text = value?.toString() ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The same columns as Are.na's web channel export. */
export function buildDownloadCsv(manifest: DownloadManifest): string {
  const header = [
    "ID",
    "Filename",
    "Title",
    "Description",
    "Created At",
    "Updated At",
    "Source",
  ];
  const rows = manifest.entries
    .filter((entry) => entry.filename)
    .map(({ item, filename }) => [
      item.id,
      filename,
      item.title,
      item.description?.markdown,
      item.created_at,
      item.updated_at,
      item.type === "Channel" ? null : item.source?.url,
    ]);
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\n");
}

export function buildDownloadIndex(manifest: DownloadManifest): string {
  const esc = escapeMarkup;
  const items = manifest.entries
    .map((entry) => {
      const item = entry.item;
      const local =
        entry.filename && ["downloaded", "unchanged"].includes(entry.status)
          ? encodeURIComponent(entry.filename)
          : null;
      const source = sourceUrl(item);
      const text =
        item.type === "Text"
          ? `<pre>${esc(item.content.plain ?? item.content.markdown ?? "")}</pre>`
          : "";
      const image =
        item.type === "Image" && local
          ? `<a href="${local}"><img loading="lazy" src="${local}" alt="${esc(item.image.alt_text ?? item.title ?? "")}"></a>`
          : "";
      const description = item.description?.plain
        ? `<p>${esc(item.description.plain)}</p>`
        : "";
      return `<li><article><h2>${esc(item.title || `${item.type} ${item.id}`)}</h2><p class="meta">${esc(item.type)} · ${esc(entry.status)} · <a href="${esc(arenaUrl(item))}">View on Are.na</a>${source ? ` · <a href="${esc(source)}">Source</a>` : ""}${local ? ` · <a href="${local}">Open local file</a>` : ""}</p>${image}${text}${description}${entry.error ? `<p class="error">${esc(entry.error)}</p>` : ""}</article></li>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(manifest.channel.title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:800px;margin:48px auto;padding:0 24px;color:#222;background:#fff}a{color:inherit}ol{padding:0;list-style:none}article{border-top:1px solid #ddd;padding:24px 0}h1,h2{font-size:1.25rem}img{max-width:100%;max-height:600px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.meta{font-size:13px;color:#666}.error{color:#a00}</style></head><body><h1>${esc(manifest.channel.title)}</h1><p>${esc(manifest.channel.description?.plain ?? "")}</p><p class="meta">Exported ${esc(manifest.exported_at)} · ${manifest.entries.length} items · ${manifest.complete ? "Complete" : "Incomplete"} · <a href="manifest.json">JSON manifest</a></p><ol>${items}</ol></body></html>\n`;
}

/** Whether an existing file at the ZIP path may be replaced; throws if it must be protected. */
async function archiveReplaceable(
  path: string,
  overwrite: boolean,
): Promise<boolean> {
  const info = await fileInfo(path);
  if (!info) return false;
  if (!info.isFile()) throw new Error("--zip must point to a file");
  if (overwrite) return true;
  const handle = await open(path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(4), 0, 4, 0);
    const magic = buffer.subarray(0, bytesRead).toString("latin1");
    if (magic === "PK\x03\x04" || magic === "PK\x05\x06") return true;
  } finally {
    await handle.close();
  }
  throw new Error(
    "--zip path exists and is not a ZIP archive; use --overwrite or choose another path",
  );
}

async function createArchive(
  path: string,
  directory: string,
  filenames: string[],
  replace: boolean,
  signal: AbortSignal,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  // Distinct from download temporaries, which a sync of this directory may clean up.
  const temporary = join(dirname(path), `.arena-zip-${randomUUID()}.part`);
  const zip = new ZipFile();
  const output = zip.outputStream as Readable;
  let activeInput: Readable | undefined;
  zip.on("error", (error: Error) => output.destroy(error));
  const abort = () => {
    activeInput?.destroy();
    output.destroy(new Error("Archive cancelled"));
  };
  signal.addEventListener("abort", abort, { once: true });
  const writing = pipeline(
    output,
    createWriteStream(temporary, { flags: "wx" }),
    { signal },
  );
  // Attach immediately so an asynchronous file error cannot become an unhandled rejection.
  void writing.catch(() => {});
  try {
    for (const filename of filenames) {
      zip.addReadStreamLazy(
        filename,
        { compress: /\.(json|html|csv|txt|url|webloc)$/.test(filename) },
        (callback) => {
          if (signal.aborted) {
            callback(new Error("Archive cancelled"), Readable.from([]));
            return;
          }
          activeInput = createReadStream(join(directory, filename), { signal });
          callback(null, activeInput);
        },
      );
    }
    zip.end();
    await writing;
    signal.throwIfAborted();
    if (replace) await rename(temporary, path);
    else await publishExclusive(temporary, path);
  } finally {
    signal.removeEventListener("abort", abort);
    activeInput?.destroy();
    output.destroy();
    await writing.catch(() => {});
    await rm(temporary, { force: true });
  }
}

export function downloadExitCode(summary: DownloadSummary): number {
  return summary.cancelled ? 130 : summary.failed > 0 ? 1 : 0;
}

async function listContents(
  channel: Channel,
  adapter: DownloadAdapter,
  signal: AbortSignal,
  onPage?: (fetched: number, total: number) => void,
): Promise<Connectable[]> {
  const contents: Connectable[] = [];
  const seen = new Set<string>();
  let page = 1;
  while (true) {
    const response = await retry(
      () => adapter.listContents(String(channel.id), page, signal),
      adapter,
      signal,
    );
    for (const item of response.data) {
      const key = itemKey(item);
      if (seen.has(key))
        throw new Error(
          "Channel contents changed while listing; rerun the sync",
        );
      seen.add(key);
      contents.push(item);
    }
    onPage?.(contents.length, response.meta.total_count);
    if (!response.meta.has_more_pages) {
      if (contents.length !== response.meta.total_count)
        throw new Error(
          "Channel contents changed while listing; rerun the sync",
        );
      break;
    }
    const next = response.meta.next_page ?? page + 1;
    if (response.data.length === 0 || next <= page)
      throw new Error(
        "Invalid channel pagination; export stopped before modifying files",
      );
    page = next;
  }
  return contents;
}

export async function executeDownload(
  options: DownloadOptions & {
    adapter?: DownloadAdapter;
    signal?: AbortSignal;
    onEvent?: (event: DownloadEvent) => void;
  },
): Promise<DownloadSummary> {
  validateDownloadOptions(options);
  const adapter = options.adapter ?? defaultDownloadAdapter();
  const signal = options.signal ?? cancellationSignal();
  const emit = (event: DownloadEvent) => options.onEvent?.(event);
  signal.throwIfAborted();
  const archivePath = options.zip ? resolve(options.zip) : undefined;
  const replaceArchive = archivePath
    ? await archiveReplaceable(archivePath, options.overwrite)
    : false;
  emit({ type: "list_started", channel: options.channel });
  const channel = await retry(
    () => adapter.getChannel(options.channel, signal),
    adapter,
    signal,
  );
  const directory = resolve(options.directory ?? safeFilename(channel.slug));
  const contents = await listContents(
    channel,
    adapter,
    signal,
    (fetched, total) => emit({ type: "list_progress", fetched, total }),
  );
  // Reject a moving snapshot before any disk changes, especially before pruning.
  const currentChannel = await retry(
    () => adapter.getChannel(String(channel.id), signal),
    adapter,
    signal,
  );
  if (currentChannel.updated_at !== channel.updated_at)
    throw new Error("Channel changed while listing; rerun the sync");
  signal.throwIfAborted();
  await mkdir(directory, { recursive: true });
  const lockPath = join(directory, LOCK_FILENAME);
  const lock = await acquireLock(lockPath);
  try {
    // Holding the lock means any temporary files here were left by a terminated run.
    for (const name of await readdir(directory))
      if (TEMPORARY_FILENAME.test(name))
        await rm(join(directory, name), { force: true });
    const previous = await readPrevious(directory, channel);
    const files = new Map(previous.map((file) => [file.filename, file]));
    const manifest: DownloadManifest = {
      version: 1,
      channel,
      exported_at: new Date().toISOString(),
      complete: false,
      options: {
        size: options.size,
        link_format: options.linkFormat,
        type: options.type,
      },
      entries: [],
      files: previous,
    };
    const summary: DownloadSummary = {
      channel: channel.slug,
      directory,
      listed: contents.length,
      downloaded: 0,
      unchanged: 0,
      failed: 0,
      pruned: 0,
      renamed: 0,
      retained: 0,
      metadata_only: 0,
      cancelled: false,
      failures: [],
    };
    const targets = new Map<DownloadEntry, DownloadTarget>();
    for (const [index, item] of contents.entries()) {
      const entry: DownloadEntry = { item, filename: null, status: "pending" };
      manifest.entries.push(entry);
      if (options.type && item.type !== options.type) {
        entry.status = "filtered";
        continue;
      }
      try {
        const target = resolveTarget(item, index + 1, options);
        if (target) {
          entry.filename = target.filename;
          targets.set(entry, target);
        } else {
          entry.status = "metadata_only";
          summary.metadata_only++;
        }
      } catch (error) {
        entry.status = "failed";
        entry.error = errorMessage(error);
      }
    }
    const activeNames = new Set(
      [...targets.values()].map((target) => target.filename),
    );
    if (
      archivePath &&
      (((activeNames.has(basename(archivePath)) ||
        files.has(basename(archivePath))) &&
        dirname(archivePath) === directory) ||
        [
          join(directory, "manifest.json"),
          join(directory, "index.html"),
          join(directory, csvFilename(channel)),
          join(directory, MOVE_JOURNAL),
          lockPath,
        ].includes(archivePath))
    )
      throw new Error("ZIP path conflicts with an export file");
    const saveManifest = async () => {
      manifest.files = [...files.values()];
      await atomicText(
        join(directory, "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );
    };
    // The journal may only be removed once the manifest records where files are.
    if (await recoverMoves(directory, files)) {
      await saveManifest();
      await rm(join(directory, MOVE_JOURNAL));
    }
    const moved = await reconcileNames(
      directory,
      [...targets].map(([entry, target]) => ({ item: entry.item, target })),
      files,
      signal,
      (move, retained) => {
        if (!retained) summary.renamed++;
        emit({
          type: retained ? "file_retained" : "file_renamed",
          file: move.to,
          from: move.from,
        });
      },
    );
    await saveManifest();
    if (moved) await rm(join(directory, MOVE_JOURNAL));
    emit({ type: "list_completed", total: contents.length });
    const recordFailure = (file: string, error: string) => {
      summary.failed++;
      summary.failures.push({ file, error });
      emit({ type: "file_failed", file, error });
    };
    let cursor = 0;
    let completed = 0;
    const workers = Array.from(
      { length: Math.min(options.concurrency, contents.length) },
      async () => {
        while (!signal.aborted) {
          const entry = manifest.entries[cursor++];
          if (!entry) return;
          const target = targets.get(entry);
          if (target) {
            try {
              const result = await syncTarget(
                target,
                entry.item,
                directory,
                files.get(target.filename),
                options,
                adapter,
                signal,
              );
              entry.status = result.status;
              files.set(target.filename, result.file);
              summary[result.status]++;
            } catch (error) {
              if (signal.aborted) return;
              entry.status = "failed";
              entry.error = errorMessage(error);
            }
          }
          if (entry.status === "failed")
            recordFailure(
              entry.filename ?? `${entry.item.type} ${entry.item.id}`,
              entry.error!,
            );
          emit({
            type: "file_progress",
            file: entry.filename ?? `${entry.item.type} ${entry.item.id}`,
            status: entry.status,
            completed: ++completed,
            total: contents.length,
          });
        }
      },
    );
    await Promise.all(workers);
    summary.cancelled = signal.aborted;
    // Never remove files following an incomplete sync or a channel modified during downloads.
    if (options.prune && !summary.cancelled && summary.failed === 0) {
      const latest = await retry(
        () => adapter.getChannel(String(channel.id), signal),
        adapter,
        signal,
      ).catch((error) => {
        recordFailure("prune", errorMessage(error));
        return null;
      });
      if (latest && latest.updated_at !== channel.updated_at)
        recordFailure(
          "prune",
          "Channel changed during download; rerun before pruning",
        );
      if (latest && summary.failed === 0) {
        try {
          const refreshed = await listContents(channel, adapter, signal);
          if (JSON.stringify(refreshed) !== JSON.stringify(contents)) {
            recordFailure(
              "prune",
              "Channel contents changed during download; rerun before pruning",
            );
          }
        } catch (error) {
          if (!signal.aborted) recordFailure("prune", errorMessage(error));
        }
      }
      if (latest && summary.failed === 0 && !signal.aborted) {
        for (const [filename, file] of files) {
          if (
            activeNames.has(filename) ||
            contents.some(
              (item) =>
                item.type === "PendingBlock" && file.item === itemKey(item),
            )
          )
            continue;
          try {
            signal.throwIfAborted();
            const path = join(directory, filename);
            const info = await fileInfo(path);
            if (info) {
              if (
                !info.isFile() ||
                !(await matchesRecord(path, info, file, signal, true))
              )
                throw new Error("Retained locally modified file");
              await rm(path);
              summary.pruned++;
              emit({ type: "file_pruned", file: filename });
            }
            files.delete(filename);
          } catch (error) {
            if (signal.aborted) break;
            recordFailure(filename, errorMessage(error));
          }
        }
      }
    }
    summary.cancelled = signal.aborted;
    summary.retained = [...files.keys()].filter(
      (filename) => !activeNames.has(filename),
    ).length;
    manifest.files = [...files.values()];
    manifest.complete = !summary.cancelled && summary.failed === 0;
    await atomicText(
      join(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    await atomicText(
      join(directory, "index.html"),
      buildDownloadIndex(manifest),
    );
    await atomicText(
      join(directory, csvFilename(channel)),
      buildDownloadCsv(manifest),
    );
    if (archivePath && !summary.cancelled) {
      emit({ type: "archive_started", path: archivePath });
      const names = manifest.entries
        .filter(
          (entry) =>
            entry.filename &&
            ["downloaded", "unchanged"].includes(entry.status),
        )
        .map((entry) => entry.filename!);
      try {
        await createArchive(
          archivePath,
          directory,
          ["manifest.json", "index.html", csvFilename(channel), ...names],
          replaceArchive,
          signal,
        );
        summary.zip = archivePath;
      } catch (error) {
        if (signal.aborted) summary.cancelled = true;
        else recordFailure(archivePath, errorMessage(error));
      }
    }
    emit({ type: "completed", summary });
    return summary;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
