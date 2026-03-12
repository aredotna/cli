import { loadEnv } from "./lib/env";
loadEnv();

import React, { useEffect } from "react";
import { render, Box, Text, useApp } from "ink";
import { SWRConfig } from "swr";
import { parseArgs, type Flags } from "./lib/args";
import { commandMap, groupedCommands } from "./lib/registry";
import { exitCodeFromError, formatJsonError } from "./lib/exit-codes";
import { CLI_PACKAGE_NAME, getCliVersion } from "./lib/version";
import { confirmDestructiveIfNeeded } from "./lib/destructive-confirmation";
import { SessionMode } from "./commands/session";

// ── Help ──

function Help() {
  const { exit } = useApp();
  useEffect(() => exit(), [exit]);

  const groups = groupedCommands();

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">
          **
        </Text>
        <Text bold> Are.na</Text>
        <Text dimColor> v{getCliVersion()}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Usage</Text>
        <Text> $ arena &lt;command&gt; [options]</Text>
      </Box>

      {groups.map(([group, cmds]) => (
        <Box key={group} flexDirection="column" marginBottom={1}>
          <Text dimColor>{group}</Text>
          {cmds.flatMap((cmd) =>
            cmd.help.map((h) => (
              <Text key={h.usage}>
                {" "}
                {h.usage.padEnd(32)}
                {h.description}
              </Text>
            )),
          )}
        </Box>
      ))}

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Global Options</Text>
        <Text> --json Output as JSON (import streams NDJSON events)</Text>
        <Text> --quiet Compact JSON output when supported</Text>
        <Text> --yes Bypass destructive confirmation prompts</Text>
        <Text> --version Show CLI version</Text>
        <Text> --help Show help</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Common Query Flags</Text>
        <Text> --page &lt;n&gt;, --per &lt;n&gt; Pagination</Text>
        <Text> --sort &lt;s&gt; Sort order</Text>
        <Text> --type &lt;t&gt; Type filter</Text>
        <Text>
          {" "}
          --filter &lt;f&gt; Connection filter (ALL, OWN, EXCLUDE_OWN)
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Command-Specific Flags</Text>
        <Text> channel create/update: --title --description --visibility</Text>
        <Text> block update: --title --description --content --alt-text</Text>
        <Text> add/batch: --title --description</Text>
        <Text> upload: --channel --title --description</Text>
        <Text> connect: --type --position</Text>
        <Text> connection move: --movement --position</Text>
        <Text> import: --dir --recursive --interactive --batch-size</Text>
        <Text> import: --upload-concurrency --poll-interval</Text>
        <Text>
          search: --scope --ext --after --seed --user-id --group-id --channel-id
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text dimColor>Examples</Text>
        <Text> $ arena channel worldmaking</Text>
        <Text> $ arena search "brutalist architecture" --type Image</Text>
        <Text> $ arena add my-channel "Hello world"</Text>
        <Text> $ echo "piped text" | arena add my-channel --json</Text>
        <Text> $ arena block 12345 --json</Text>
        <Text> $ arena channel create "My Research" --visibility private</Text>
        <Text> $ arena user damon-zucconi</Text>
        <Text> $ arena upload photo.jpg --channel my-channel</Text>
        <Text> $ arena import my-channel --dir ./assets --recursive</Text>
      </Box>
    </Box>
  );
}

function RenderError({ message }: { message: string }) {
  const { exit } = useApp();
  useEffect(() => {
    process.exitCode = 1;
    exit();
  }, [exit]);

  return <Text color="red">✕ {message}</Text>;
}

function quietResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  if (Array.isArray(result)) return result.map(quietResult);
  const obj = result as Record<string, unknown>;
  if ("id" in obj) return { id: obj.id };
  if ("slug" in obj) return { slug: obj.slug };
  return result;
}

// ── JSON handler ──

async function handleJson(command: string, args: string[], flags: Flags) {
  const def = commandMap.get(command);

  if (!def || (!def.json && !def.jsonStream)) {
    process.stderr.write(
      JSON.stringify({
        error: `Unknown command: ${command}`,
        code: null,
        type: "unknown_command",
      }) + "\n",
    );
    process.exit(1);
  }

  try {
    await confirmDestructiveIfNeeded(def.name, args, flags, def.destructive);
    if (def.jsonStream) {
      const exitCode = await def.jsonStream(args, flags, (event) => {
        process.stdout.write(JSON.stringify(event) + "\n");
      });
      if (typeof exitCode === "number" && exitCode !== 0) {
        process.exit(exitCode);
      }
      return;
    }

    if (!def.json) {
      throw new Error(`Unknown command: ${command}`);
    }

    const result = await def.json(args, flags);
    const output = flags.quiet ? quietResult(result) : result;
    const indent = flags.quiet ? undefined : 2;
    process.stdout.write(JSON.stringify(output, null, indent) + "\n");
  } catch (err: unknown) {
    process.stderr.write(JSON.stringify(formatJsonError(err)) + "\n");
    process.exit(exitCodeFromError(err));
  }
}

// ── Interactive router ──

function routeCommand(
  command: string,
  rest: string[],
  flags: Flags,
): React.JSX.Element {
  const def = commandMap.get(command);

  if (!def) {
    return <Help />;
  }

  try {
    return def.render(rest, flags);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return <RenderError message={message} />;
  }
}

// ── Main ──

const { args, flags } = parseArgs(process.argv.slice(2));
const [command, ...rest] = args;

const SWR_OPTIONS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
};

function App({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={SWR_OPTIONS}>{children}</SWRConfig>;
}

async function runInk(
  element: React.JSX.Element,
  options?: { fullscreen?: boolean },
) {
  const fullscreen = options?.fullscreen ?? false;
  let cleanedUp = false;

  const cleanupFullscreen = () => {
    if (!fullscreen || cleanedUp) return;
    cleanedUp = true;
    process.stdout.write("\u001B[?1049l\u001B[?25h");
  };

  if (fullscreen) {
    // Enter alternate screen buffer and hide cursor for true fullscreen TUI.
    process.stdout.write("\u001B[?1049h\u001B[2J\u001B[H\u001B[?25l");
    process.once("exit", cleanupFullscreen);
  }

  const { waitUntilExit } = render(element);
  try {
    await waitUntilExit();
  } finally {
    process.removeListener("exit", cleanupFullscreen);
    cleanupFullscreen();
  }
}

if (flags.json && command) {
  await handleJson(command, rest, flags);
} else if (!command && (flags.version || flags.v)) {
  process.stdout.write(`${CLI_PACKAGE_NAME} v${getCliVersion()}\n`);
} else if (flags.help || flags.h) {
  await runInk(<Help />, { fullscreen: false });
} else if (!command) {
  const element = process.stdin.isTTY ? <SessionMode /> : <Help />;
  await runInk(<App>{element}</App>, {
    fullscreen: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  });
} else {
  const def = commandMap.get(command);
  let element: React.JSX.Element;
  try {
    if (def) {
      await confirmDestructiveIfNeeded(def.name, rest, flags, def.destructive);
    }
    element = routeCommand(command, rest, flags);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    element = <RenderError message={message} />;
  }

  await runInk(<App>{element}</App>, {
    fullscreen: false,
  });
}
