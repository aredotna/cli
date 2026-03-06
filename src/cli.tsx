import React, { useEffect } from "react";
import { render, Box, Text, useApp } from "ink";
import { SWRConfig } from "swr";
import { parseArgs, type Flags } from "./lib/args";
import { commandMap, groupedCommands } from "./lib/registry";
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
        <Text> --type &lt;t&gt; Filter by type</Text>
        <Text> --visibility &lt;v&gt; public, closed, or private</Text>
        <Text> --title &lt;t&gt; Title (for create/update)</Text>
        <Text> --description &lt;d&gt; Description (for create/update)</Text>
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
      JSON.stringify({ error: `Unknown command: ${command}` }) + "\n",
    );
    process.exit(1);
  }

  try {
    const result = await def.json(args, flags);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(JSON.stringify({ error: message }) + "\n");
    process.exit(1);
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

if (flags.json && command) {
  await handleJson(command, rest, flags);
} else if (flags.help || flags.h) {
  const { waitUntilExit } = render(<Help />);
  await waitUntilExit();
} else if (!command) {
  const element = process.stdin.isTTY ? <SessionMode /> : <Help />;
  const { waitUntilExit } = render(<App>{element}</App>);
  await waitUntilExit();
} else {
  const { waitUntilExit } = render(
    <App>{routeCommand(command, rest, flags)}</App>,
  );
  await waitUntilExit();
}
