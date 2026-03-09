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
