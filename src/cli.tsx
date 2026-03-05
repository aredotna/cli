import React, { useEffect } from "react";
import { render, Box, Text, useApp } from "ink";
import { arena } from "./api/client";
import { AddCommand } from "./commands/add";
import { BlockCommand } from "./commands/block";
import { ChannelCommand } from "./commands/channel";
import { CommentCommand } from "./commands/comment";
import { ConnectCommand } from "./commands/connect";
import { LoginCommand } from "./commands/login";
import { SearchCommand } from "./commands/search";
import { SessionMode } from "./commands/session";
import { WhoamiCommand } from "./commands/whoami";

interface ParsedArgs {
  args: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(arg);
    }
  }

  return { args, flags };
}

function Help() {
  const { exit } = useApp();
  useEffect(() => {
    exit();
  }, [exit]);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">**</Text>
        <Text bold> arena</Text>
        <Text dimColor> · Are.na from the terminal</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Usage</Text>
        <Text> $ arena &lt;command&gt; [options]</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Commands</Text>
        <Text> channel &lt;slug&gt; View a channel</Text>
        <Text> block &lt;id&gt; View a block</Text>
        <Text> search &lt;query&gt; Search Are.na</Text>
        <Text> add &lt;channel&gt; &lt;value&gt; Add content to a channel</Text>
        <Text>
          {" "}
          connect &lt;id&gt; &lt;channel&gt; Connect a block to a channel
        </Text>
        <Text> comment &lt;id&gt; &lt;text&gt; Comment on a block</Text>
        <Text> whoami Show current user</Text>
        <Text> login Authenticate via OAuth</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Options</Text>
        <Text> --json Output as JSON</Text>
        <Text> --page &lt;n&gt; Page number</Text>
        <Text> --per &lt;n&gt; Items per page</Text>
        <Text> --type &lt;t&gt; Filter by type (search)</Text>
        <Text> --help Show help</Text>
      </Box>

      <Box flexDirection="column">
        <Text dimColor>Examples</Text>
        <Text> $ arena channel worldmaking</Text>
        <Text> $ arena search "brutalist architecture"</Text>
        <Text> $ arena add my-channel "Hello world"</Text>
        <Text> $ arena block 12345 --json</Text>
      </Box>
    </Box>
  );
}

async function handleJson(
  command: string,
  args: string[],
  flags: Record<string, string | boolean>,
) {
  const page = Number(flags.page) || 1;
  const per = Number(flags.per) || 24;

  try {
    let result: unknown;

    switch (command) {
      case "channel":
      case "ch": {
        const [channel, contents] = await Promise.all([
          arena.getChannel(args[0]!),
          arena.getChannelContents(args[0]!, { page, per }),
        ]);
        result = { ...channel, contents: contents.data, meta: contents.meta };
        break;
      }
      case "block":
      case "bl":
        result = await arena.getBlock(Number(args[0]));
        break;
      case "search":
      case "s":
        result = await arena.search(args.join(" "), {
          page,
          per,
          type: flags.type as string | undefined,
        });
        break;
      case "add": {
        const ch = await arena.getChannel(args[0]!);
        result = await arena.createBlock(args.slice(1).join(" "), [ch.id]);
        break;
      }
      case "whoami":
      case "me":
        result = await arena.getMe();
        break;
      default:
        process.stderr.write(
          JSON.stringify({ error: `Unknown command: ${command}` }) + "\n",
        );
        process.exit(1);
    }

    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(JSON.stringify({ error: message }) + "\n");
    process.exit(1);
  }
}

const { args, flags } = parseArgs(process.argv.slice(2));
const [command, ...rest] = args;

if (flags.json && command) {
  await handleJson(command, rest, flags);
} else if (flags.help || flags.h) {
  const { waitUntilExit } = render(<Help />);
  await waitUntilExit();
} else if (!command) {
  if (process.stdin.isTTY) {
    const { waitUntilExit } = render(<SessionMode />);
    await waitUntilExit();
  } else {
    const { waitUntilExit } = render(<Help />);
    await waitUntilExit();
  }
} else {
  let element: React.JSX.Element;

  switch (command) {
    case "channel":
    case "ch":
      element = (
        <ChannelCommand
          slug={rest[0]!}
          page={Number(flags.page) || undefined}
          per={Number(flags.per) || undefined}
        />
      );
      break;
    case "block":
    case "bl":
      element = <BlockCommand id={Number(rest[0])} />;
      break;
    case "search":
    case "s":
      element = (
        <SearchCommand
          query={rest.join(" ")}
          page={Number(flags.page) || undefined}
          per={Number(flags.per) || undefined}
          type={flags.type as string | undefined}
        />
      );
      break;
    case "add":
      element = (
        <AddCommand channel={rest[0]!} value={rest.slice(1).join(" ")} />
      );
      break;
    case "connect":
      element = <ConnectCommand blockId={Number(rest[0])} channel={rest[1]!} />;
      break;
    case "comment":
      element = (
        <CommentCommand
          blockId={Number(rest[0])}
          body={rest.slice(1).join(" ")}
        />
      );
      break;
    case "whoami":
    case "me":
      element = <WhoamiCommand />;
      break;
    case "login":
      element = (
        <LoginCommand token={(flags.token as string | undefined) || rest[0]} />
      );
      break;
    default:
      element = <Help />;
  }

  const { waitUntilExit } = render(element);
  await waitUntilExit();
}
