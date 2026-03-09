import createClient, { type Middleware } from "openapi-fetch";
import { config } from "../lib/config";
import type { paths } from "./schema";

export class ArenaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ArenaError";
    this.status = status;
  }
}

export async function getData<T>(request: Promise<{ data?: T }>): Promise<T> {
  const response = await request;
  return response.data!;
}

function toArenaMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) {
    return fallback;
  }
  const errorBody = body as {
    error?: unknown;
    details?: {
      message?: unknown;
    };
  };
  if (typeof errorBody.error === "string") return errorBody.error;
  if (typeof errorBody.details?.message === "string")
    return errorBody.details.message;
  return fallback;
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = config.getToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
};

const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) {
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      throw new ArenaError(
        toArenaMessage(body, response.statusText),
        response.status,
      );
    }
    return response;
  },
};

export const client = createClient<paths>({
  baseUrl: process.env["ARENA_API_URL"] || "https://api.are.na",
});

client.use(authMiddleware);
client.use(errorMiddleware);
