import createClient, { type Middleware } from "openapi-fetch";
import { loadEnv } from "../lib/env";
import { config } from "../lib/config";
import { vcrFetch } from "../lib/vcr";
import { withRequestSignal } from "../lib/network";
import type { paths } from "./schema";

// Ensure env is populated before reading API URL at module init time.
loadEnv();

export class ArenaError extends Error {
  status: number;
  rateLimit?: {
    retryAfterMs?: number;
    resetAtMs?: number;
    limit?: string;
    remaining?: string;
    tier?: string;
    window?: string;
    bucket?: string;
    cost?: string;
    policy?: string;
  };

  constructor(
    message: string,
    status: number,
    options: {
      rateLimit?: ArenaError["rateLimit"];
    } = {},
  ) {
    super(message);
    this.name = "ArenaError";
    this.status = status;
    this.rateLimit = options.rateLimit;
  }
}

export async function getData<T>(request: Promise<{ data?: T }>): Promise<T> {
  const response = await request;
  return response.data!;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValidationErrors(errors: unknown): string | undefined {
  if (Array.isArray(errors)) {
    const messages = errors
      .map((error) => {
        if (typeof error === "string") return error;
        if (isRecord(error) && typeof error["message"] === "string") {
          return error["message"];
        }
        return undefined;
      })
      .filter((message): message is string => Boolean(message));
    return messages.length > 0 ? messages.join("; ") : undefined;
  }

  if (!isRecord(errors)) return undefined;

  const messages = Object.entries(errors)
    .map(([key, value]) => {
      if (typeof value === "string") return `${key}: ${value}`;
      if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
      if (isRecord(value) && typeof value["message"] === "string") {
        return `${key}: ${value["message"]}`;
      }
      return undefined;
    })
    .filter((message): message is string => Boolean(message));

  return messages.length > 0 ? messages.join("; ") : undefined;
}

function toArenaMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;

  const messages: string[] = [];
  const details = body["details"];
  if (isRecord(details)) {
    if (typeof details["message"] === "string") {
      messages.push(details["message"]);
    }
    const validation = formatValidationErrors(details["errors"]);
    if (validation) messages.push(validation);
  }

  const error = body["error"];
  if (isRecord(error) && typeof error["message"] === "string") {
    messages.push(error["message"]);
  }

  if (typeof body["message"] === "string") {
    messages.push(body["message"]);
  }

  const unique = [...new Set(messages.filter(Boolean))];
  if (unique.length > 0) return unique.join("; ");
  return typeof error === "string" && error ? error : fallback;
}

function retryAfterHeaderMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return Math.max(0, timestamp - Date.now());
  return undefined;
}

function unixTimestampHeaderMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds * 1000;
}

function numericBodyRetryAfterMs(body: unknown): number | undefined {
  if (!isRecord(body) || !isRecord(body["error"])) return undefined;
  const retryAfter = body["error"]["retry_after"];
  if (
    typeof retryAfter !== "number" ||
    !Number.isFinite(retryAfter) ||
    retryAfter < 0
  )
    return undefined;
  return retryAfter * 1000;
}

function rateLimitFromResponse(
  response: Response,
  body: unknown,
): ArenaError["rateLimit"] {
  if (response.status !== 429) return undefined;

  const retryAfterMs =
    retryAfterHeaderMs(response.headers.get("Retry-After")) ??
    numericBodyRetryAfterMs(body);
  const resetAtMs = unixTimestampHeaderMs(
    response.headers.get("X-RateLimit-Reset"),
  );

  return {
    retryAfterMs,
    resetAtMs,
    limit: response.headers.get("X-RateLimit-Limit") ?? undefined,
    remaining: response.headers.get("X-RateLimit-Remaining") ?? undefined,
    tier: response.headers.get("X-RateLimit-Tier") ?? undefined,
    window: response.headers.get("X-RateLimit-Window") ?? undefined,
    bucket: response.headers.get("X-RateLimit-Bucket") ?? undefined,
    cost: response.headers.get("X-RateLimit-Cost") ?? undefined,
    policy: response.headers.get("X-RateLimit-Policy") ?? undefined,
  };
}

const baseUrlMiddleware: Middleware = {
  async onRequest({ request }) {
    const customUrl = process.env["ARENA_API_URL"];
    if (customUrl) {
      const url = new URL(request.url);
      const base = new URL(customUrl);
      url.protocol = base.protocol;
      url.host = base.host;
      return new Request(url, request);
    }
    return request;
  },
};

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = config.getToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
};

const timeoutMiddleware: Middleware = {
  async onRequest({ request }) {
    return new Request(request, {
      signal: withRequestSignal(request.signal),
    });
  },
};

const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) {
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      const rateLimit = rateLimitFromResponse(response, body);
      throw new ArenaError(
        toArenaMessage(body, response.statusText),
        response.status,
        {
          rateLimit,
        },
      );
    }
    return response;
  },
};

export const arenaApiBaseUrl =
  process.env["ARENA_API_URL"] || "https://api.are.na";

export const client = createClient<paths>({
  baseUrl: arenaApiBaseUrl,
  fetch: vcrFetch,
});

client.use(baseUrlMiddleware);
client.use(authMiddleware);
client.use(timeoutMiddleware);
client.use(errorMiddleware);
