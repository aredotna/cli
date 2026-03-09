import { ArenaError } from "../api/client";

export function exitCodeFromError(err: unknown): number {
  if (!(err instanceof ArenaError)) return 1;
  switch (err.status) {
    case 401:
      return 2;
    case 404:
      return 3;
    case 400:
    case 422:
      return 4;
    case 429:
      return 5;
    case 403:
      return 6;
    default:
      return 1;
  }
}

export function errorType(err: unknown): string {
  if (!(err instanceof ArenaError)) return "client_error";
  switch (err.status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 422:
      return "validation_error";
    case 429:
      return "rate_limited";
    default:
      return "api_error";
  }
}

export function formatJsonError(err: unknown): {
  error: string;
  code: number | null;
  type: string;
} {
  if (err instanceof ArenaError) {
    return { error: err.message, code: err.status, type: errorType(err) };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { error: message, code: null, type: errorType(err) };
}
