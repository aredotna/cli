import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fetchWithTimeout } from "./network";

type VcrMode = "off" | "record" | "replay" | "auto";

interface RecordedEntry {
  method: string;
  url: string;
  requestBody: string | null;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

interface Cassette {
  entries: RecordedEntry[];
}

let cassette: Cassette | null = null;
let canReplay = false;
let replayIndex = 0;
let dirty = false;

function modeFromEnv(): VcrMode {
  const mode = process.env["ARENA_VCR_MODE"]?.toLowerCase();
  if (mode === "record" || mode === "replay" || mode === "auto") return mode;
  return "off";
}

function cassettePath(): string {
  const dir = process.env["ARENA_VCR_DIR"] || join(process.cwd(), ".vcr");
  const name = process.env["ARENA_VCR_NAME"]?.trim() || "default";
  return join(dir, `${name}.json`);
}

function loadCassette(): Cassette {
  const path = cassettePath();
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8")) as Cassette;
  }
  return { entries: [] };
}

function saveCassette(): void {
  if (!cassette || !dirty) return;
  const path = cassettePath();
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(cassette, null, 2));
}

function ensureCassette(): Cassette {
  if (!cassette) {
    cassette = loadCassette();
    canReplay = cassette.entries.length > 0;
    process.once("beforeExit", saveCassette);
  }
  return cassette;
}

const REDACTED_HEADERS = new Set([
  "set-cookie",
  "authorization",
  "x-csrf-token",
]);

function sanitizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!REDACTED_HEADERS.has(k.toLowerCase())) clean[k] = v;
  }
  return clean;
}

function buildResponse(
  body: string,
  status: number,
  statusText: string,
  headers: Record<string, string>,
): Response {
  const nullBody = [101, 204, 205, 304].includes(status);
  return new Response(nullBody ? null : body, { status, statusText, headers });
}

export async function vcrFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const mode = modeFromEnv();
  if (mode === "off") return fetchWithTimeout(input, init);

  const normalized = new Request(input, init);
  const method = normalized.method.toUpperCase();
  const url = normalized.url;
  const requestBody =
    method === "GET" || method === "HEAD" ? null : await normalized.text();

  const tape = ensureCassette();

  if (canReplay && (mode === "replay" || mode === "auto")) {
    const entry = tape.entries[replayIndex];
    if (entry && entry.method === method && entry.url === url) {
      replayIndex++;
      return buildResponse(
        entry.body,
        entry.status,
        entry.statusText,
        entry.headers,
      );
    }
    if (mode === "replay") {
      throw new Error(
        `VCR replay miss at index ${replayIndex}: expected ${entry?.method} ${entry?.url}, got ${method} ${url}`,
      );
    }
  }

  const headers = Object.fromEntries(normalized.headers.entries());
  const response = await fetchWithTimeout(url, {
    method,
    headers,
    body: requestBody,
    signal: normalized.signal,
  });
  const responseBody = await response.text();

  tape.entries.push({
    method,
    url,
    requestBody,
    status: response.status,
    statusText: response.statusText,
    headers: sanitizeHeaders(Object.fromEntries(response.headers.entries())),
    body: responseBody,
  });
  dirty = true;

  return buildResponse(
    responseBody,
    response.status,
    response.statusText,
    Object.fromEntries(response.headers.entries()),
  );
}
