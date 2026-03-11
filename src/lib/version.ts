import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_PACKAGE_NAME = "@aredotna/cli";

let cachedVersion: string | null = null;

function resolvePackageJsonPath(): string | null {
  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(base, "../../package.json"),
    resolve(base, "../package.json"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  return null;
}

export function getCliVersion(): string {
  if (cachedVersion) return cachedVersion;

  const fromEnv = process.env["npm_package_version"]?.trim();
  if (fromEnv) {
    cachedVersion = fromEnv;
    return cachedVersion;
  }

  try {
    const packageJsonPath = resolvePackageJsonPath();
    if (!packageJsonPath) return "0.0.0";

    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      version?: unknown;
    };
    const version = typeof parsed.version === "string" ? parsed.version : null;
    cachedVersion = version ?? "0.0.0";
    return cachedVersion;
  } catch {
    return "0.0.0";
  }
}
