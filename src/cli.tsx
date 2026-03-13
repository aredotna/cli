import { loadEnv } from "./lib/env";
loadEnv();

import React, { useEffect } from "react";
import { render, Box, Text, useApp } from "ink";
import { SWRConfig } from "swr";
import { parseArgs, type Flags } from "./lib/args";
import {
  commandMap,
  commandHelpDocs,
  type CommandHelpDoc,
} from "./lib/registry";
import { exitCodeFromError, formatJsonError } from "./lib/exit-codes";
import { CLI_PACKAGE_NAME, getCliVersion } from "./lib/version";
import { confirmDestructiveIfNeeded } from "./lib/destructive-confirmation";
import { SessionMode } from "./commands/session";

// ── Help ──

function TopLevelHelp() {
  const { exit } = useApp();
  useEffect(() => exit(), [exit]);

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
        <Text> arena &lt;command&gt; [flags]</Text>
        <Text> arena help &lt;command&gt;</Text>
        <Text> arena &lt;command&gt; --help</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Common Commands</Text>
        <Text> login Authenticate your account</Text>
        <Text> whoami Show current authenticated user</Text>
        <Text> search Search across Are.na content</Text>
        <Text> channel View/manage channels</Text>
        <Text> add Add text/URLs to a channel</Text>
        <Text> upload Upload local files</Text>
        <Text> import Bulk import from a directory</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Examples</Text>
        <Text> arena login</Text>
        <Text> arena search "brutalist architecture" --type Image</Text>
        <Text> arena add my-channel "Hello world"</Text>
        <Text> arena import my-channel --dir ./assets --recursive</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Global Flags</Text>
        <Text> --json Output JSON (import streams NDJSON events)</Text>
        <Text> --quiet Compact JSON output when supported</Text>
        <Text> --yes Bypass destructive confirmation prompts</Text>
        <Text> --version Show CLI version</Text>
        <Text> --help Show help</Text>
      </Box>

      <Box flexDirection="column">
        <Text dimColor>Learn More</Text>
        <Text>README: https://github.com/aredotna/cli#readme</Text>
        <Text>Issues: https://github.com/aredotna/cli/issues</Text>
      </Box>
    </Box>
  );
}

function section(title: string, lines: string[]) {
  if (lines.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>{title}</Text>
      {lines.map((line) => (
        <Text key={`${title}-${line}`}>{line}</Text>
      ))}
    </Box>
  );
}

function renderCommandHelp(doc: CommandHelpDoc, commandPath: string) {
  const usageLines = doc.usage;
  const optionLines =
    doc.options?.map((opt) => `${opt.flag.padEnd(34)}${opt.description}`) ?? [];
  const exampleLines = doc.examples;
  const noteLines = doc.notes ?? [];
  const seeAlsoLines = doc.seeAlso?.map((entry) => `arena help ${entry}`) ?? [];

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
        <Text dimColor>SUMMARY</Text>
        <Text>{doc.summary}</Text>
      </Box>

      {section("USAGE", usageLines)}
      {section("OPTIONS", optionLines)}
      {section("EXAMPLES", exampleLines)}
      {section("NOTES", noteLines)}
      {section("SEE ALSO", seeAlsoLines)}

      <Box flexDirection="column">
        <Text dimColor>LEARN MORE</Text>
        <Text>arena help {commandPath}</Text>
        <Text>https://github.com/aredotna/cli#readme</Text>
      </Box>
    </Box>
  );
}

function lookupHelp(
  commandName?: string,
  subcommandName?: string,
): {
  doc?: Omit<CommandHelpDoc, "subcommands">;
  canonicalCommand?: string;
} {
  if (!commandName) return {};
  const def = commandMap.get(commandName);
  if (!def) return {};
  const canonicalCommand = def.name;
  const topDoc = commandHelpDocs[canonicalCommand];
  if (!topDoc) return { canonicalCommand };
  if (subcommandName && topDoc.subcommands?.[subcommandName]) {
    return {
      doc: topDoc.subcommands[subcommandName],
      canonicalCommand,
    };
  }
  const { subcommands: _subcommands, ...doc } = topDoc;
  return { doc, canonicalCommand };
}

function CommandHelp({
  commandName,
  subcommandName,
}: {
  commandName?: string;
  subcommandName?: string;
}) {
  const { exit } = useApp();
  useEffect(() => exit(), [exit]);
  const { doc, canonicalCommand } = lookupHelp(commandName, subcommandName);

  if (!commandName || !doc || !canonicalCommand) {
    return (
      <Box flexDirection="column">
        <Text color="red">Unknown command help target.</Text>
        <Text>Try: arena --help</Text>
      </Box>
    );
  }

  const commandPath = subcommandName
    ? `${canonicalCommand} ${subcommandName}`
    : canonicalCommand;

  return renderCommandHelp(doc, commandPath);
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
    return <TopLevelHelp />;
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
} else if ((flags.help || flags.h) && command) {
  const subcommandName = rest[0];
  await runInk(
    <CommandHelp commandName={command} subcommandName={subcommandName} />,
    { fullscreen: false },
  );
} else if ((flags.help || flags.h) && !command) {
  await runInk(<TopLevelHelp />, { fullscreen: false });
} else if (command === "help") {
  const targetCommand = rest[0];
  const targetSubcommand = rest[1];
  if (!targetCommand) {
    await runInk(<TopLevelHelp />, { fullscreen: false });
  } else {
    await runInk(
      <CommandHelp
        commandName={targetCommand}
        subcommandName={targetSubcommand}
      />,
      { fullscreen: false },
    );
  }
} else if (!command) {
  const element = process.stdin.isTTY ? <SessionMode /> : <TopLevelHelp />;
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
