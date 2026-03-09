import React, { useEffect } from "react";
import { render, Box, Text, useApp } from "ink";
import { SWRConfig } from "swr";
import { parseArgs, type Flags } from "./lib/args";
import { commandMap, groupedCommands } from "./lib/registry";
import { exitCodeFromError, formatJsonError } from "./lib/exit-codes";
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
        <Text dimColor>Options</Text>
        <Text> --json Output as JSON</Text>
        <Text> --page &lt;n&gt; Page number</Text>
        <Text> --per &lt;n&gt; Items per page</Text>
        <Text> --sort &lt;s&gt; Sort order</Text>
        <Text> --type &lt;t&gt; Filter by type</Text>
        <Text>
          {" "}
          --filter &lt;f&gt; Filter connections (ALL, OWN, EXCLUDE_OWN)
        </Text>
        <Text> --visibility &lt;v&gt; public, closed, or private</Text>
        <Text> --title &lt;t&gt; Title (for create/update)</Text>
        <Text> --description &lt;d&gt; Description (for create/update)</Text>
        <Text> --no-fullscreen Disable session fullscreen mode</Text>
        <Text> --help Show help</Text>
      </Box>

      <Box flexDirection="column">
        <Text dimColor>Examples</Text>
        <Text> $ arena channel worldmaking</Text>
        <Text> $ arena search "brutalist architecture" --type Image</Text>
        <Text> $ arena add my-channel "Hello world"</Text>
        <Text> $ arena block 12345 --json</Text>
        <Text> $ arena channel create "My Research" --visibility private</Text>
        <Text> $ arena user damon-zucconi</Text>
        <Text> $ arena upload photo.jpg --channel my-channel</Text>
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

// ── JSON handler ──

async function handleJson(command: string, args: string[], flags: Flags) {
  const def = commandMap.get(command);

  if (!def || !def.json) {
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
    const result = await def.json(args, flags);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
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

function shouldUseSessionFullscreen(flags: Flags): boolean {
  if (flags["no-fullscreen"]) return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
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
} else if (flags.help || flags.h) {
  await runInk(<Help />, { fullscreen: false });
} else if (!command) {
  const element = process.stdin.isTTY ? <SessionMode /> : <Help />;
  await runInk(<App>{element}</App>, {
    fullscreen: shouldUseSessionFullscreen(flags),
  });
} else {
  await runInk(<App>{routeCommand(command, rest, flags)}</App>, {
    fullscreen: false,
  });
}
