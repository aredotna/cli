import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Load a .env file into process.env. Does not override existing values.
 * Silently does nothing if the file doesn't exist.
 */
export function loadEnv(dir: string = process.cwd()): void {
  let content: string;
  try {
    content = readFileSync(resolve(dir, ".env"), "utf-8");
  } catch {
    return;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Don't override existing env vars
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
