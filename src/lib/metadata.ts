import type { Metadata, MetadataInput } from "../api/types";
import type { Flags } from "./args";

type MetadataValue = string | number | boolean;
type MetadataInputValue = MetadataValue | null;

const KEY_PATTERN = /^[A-Za-z0-9_]{1,40}$/;
const NUMBER_PATTERN = /^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseScalar(raw: string): MetadataInputValue {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (NUMBER_PATTERN.test(value)) {
    const numberValue = Number(value);
    // Only coerce to number when the value round-trips losslessly. This
    // preserves strings like "00123", "1.10", or "1e2" that a user clearly
    // wants to keep as strings (e.g. SKUs, phone numbers, zip codes).
    if (Number.isFinite(numberValue) && String(numberValue) === value) {
      return numberValue;
    }
  }
  return value;
}

/**
 * Split a key=value list on commas while respecting backslash escapes.
 * `\,` inserts a literal comma; `\\` inserts a literal backslash. This lets
 * users embed commas in values (e.g. `note=hello\,world`) without dropping
 * to JSON form.
 */
function splitEntries(raw: string): string[] {
  const entries: string[] = [];
  let current = "";
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (char === "\\" && i + 1 < raw.length) {
      current += raw[i + 1]!;
      i++;
      continue;
    }
    if (char === ",") {
      entries.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  entries.push(current);
  return entries.filter((part) => part.trim());
}

function validateMetadataValue(
  key: string,
  value: unknown,
  allowNull: boolean,
): MetadataInputValue {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(
      `Invalid metadata key: ${key}. Use 1-40 alphanumeric or underscore characters.`,
    );
  }

  if (value === null) {
    if (allowNull) return null;
    throw new Error(`Metadata value for ${key} cannot be null here.`);
  }

  if (typeof value === "string" || typeof value === "boolean") return value;

  if (typeof value === "number" && Number.isFinite(value)) return value;

  throw new Error(
    `Invalid metadata value for ${key}. Expected string, number, boolean${
      allowNull ? ", or null" : ""
    }.`,
  );
}

function parseMetadataObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) throw new Error("--metadata JSON must be an object");
    return parsed;
  }

  return Object.fromEntries(
    splitEntries(trimmed).map((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) {
        throw new Error(
          `Invalid metadata entry: ${part}. Use key=value pairs or a JSON object.`,
        );
      }
      const key = part.slice(0, separator).trim();
      const value = parseScalar(part.slice(separator + 1));
      return [key, value];
    }),
  );
}

export function parseMetadata(
  raw: string,
  options: { allowNull?: boolean } = {},
): Metadata | MetadataInput {
  const allowNull = options.allowNull ?? false;
  const parsed = parseMetadataObject(raw);
  const entries = Object.entries(parsed);

  if (entries.length > 50) {
    throw new Error("Metadata supports at most 50 keys.");
  }

  const metadata: Record<string, MetadataInputValue> = {};
  for (const [key, value] of entries) {
    metadata[key] = validateMetadataValue(key, value, allowNull);
  }

  return metadata as Metadata | MetadataInput;
}

export function metadataFlag(
  flags: Flags,
  key = "metadata",
  options: { allowNull?: boolean } = {},
): Metadata | MetadataInput | undefined {
  const value = flags[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`--${key} requires a value`);
  return parseMetadata(value, options);
}

export function entityMetadataFlag(
  flags: Flags,
  key = "metadata",
): Metadata | undefined {
  return metadataFlag(flags, key, { allowNull: false }) as Metadata | undefined;
}

export function metadataInputFlag(
  flags: Flags,
  key = "metadata",
): MetadataInput | undefined {
  return metadataFlag(flags, key, { allowNull: true }) as
    | MetadataInput
    | undefined;
}

export function requireMetadataInputFlag(
  flags: Flags,
  key = "metadata",
): MetadataInput {
  const metadata = metadataInputFlag(flags, key);
  if (!metadata) throw new Error(`Missing required flag: --${key}`);
  return metadata;
}

export function formatMetadata(metadata: Metadata | null | undefined): string {
  if (!metadata || Object.keys(metadata).length === 0) return "";
  return Object.entries(metadata)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
}
