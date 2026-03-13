export type Flags = Record<string, string | boolean>;

interface ParsedArgs {
  args: string[];
  flags: Flags;
}

const KNOWN_BOOLEAN_LONG_FLAGS = new Set([
  "help",
  "json",
  "quiet",
  "version",
  "yes",
  "recursive",
  "interactive",
]);

const KNOWN_BOOLEAN_SHORT_FLAGS = new Set(["h", "j", "q", "v", "y"]);

export function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = [];
  const flags: Flags = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === "--") {
      args.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      const key = eq >= 0 ? body.slice(0, eq) : body;
      const inlineValue = eq >= 0 ? body.slice(eq + 1) : undefined;

      if (!key) {
        args.push(arg);
        continue;
      }

      if (inlineValue !== undefined) {
        flags[key] = inlineValue;
        continue;
      }

      if (KNOWN_BOOLEAN_LONG_FLAGS.has(key)) {
        flags[key] = true;
        continue;
      }

      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }

    if (arg.startsWith("-") && arg.length > 1) {
      const shorts = arg.slice(1);
      if (shorts.length > 1) {
        for (const shortFlag of shorts) flags[shortFlag] = true;
      } else {
        const key = shorts;
        if (KNOWN_BOOLEAN_SHORT_FLAGS.has(key)) {
          flags[key] = true;
          continue;
        }
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
      continue;
    }

    args.push(arg);
  }

  return { args, flags };
}

export function flag(flags: Flags, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function requireFlag(flags: Flags, key: string, label = key): string {
  const value = flag(flags, key)?.trim();
  if (!value) throw new Error(`Missing required flag: --${label}`);
  return value;
}

export function requireArg(
  args: string[],
  index: number,
  label: string,
): string {
  const value = args[index]?.trim();
  if (!value) throw new Error(`Missing required argument: ${label}`);
  return value;
}

export function parsePositiveInt(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${label}: ${value}. Expected a positive integer.`);
  }
  return n;
}

export function idArg(args: string[], index: number, label = "id"): number {
  return parsePositiveInt(requireArg(args, index, label), label);
}

function parseOptionalPositiveInt(
  flags: Flags,
  key: string,
  label: string,
): number | undefined {
  const raw = flags[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") throw new Error(`--${key} requires a value`);
  return parsePositiveInt(raw, label);
}

export function page(flags: Flags): number {
  return parseOptionalPositiveInt(flags, "page", "page") ?? 1;
}

export function per(flags: Flags): number {
  return parseOptionalPositiveInt(flags, "per", "per") ?? 24;
}

export function optPage(flags: Flags): number | undefined {
  return parseOptionalPositiveInt(flags, "page", "page");
}

export function optPer(flags: Flags): number | undefined {
  return parseOptionalPositiveInt(flags, "per", "per");
}

/** Read all of stdin as a string. Returns undefined if stdin is a TTY. */
export async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf-8").trimEnd();
  return text || undefined;
}

/** Read a flag and cast its string value to `T`. Returns `undefined` if absent. */
export function flagAs<T extends string>(
  flags: Flags,
  key: string,
): T | undefined {
  return flag(flags, key) as T | undefined;
}

/** Read a flag as an optional positive integer. */
export function intFlag(flags: Flags, key: string): number | undefined {
  return parseOptionalPositiveInt(flags, key, key);
}
