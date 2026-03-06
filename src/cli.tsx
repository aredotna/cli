import React, { useEffect } from "react";
import { render, Box, Text, useApp } from "ink";
import { arena } from "./api/client";
import type { Movement } from "./api/types";
import { AddCommand } from "./commands/add";
import { BlockCommand } from "./commands/block";
import { ChannelCommand } from "./commands/channel";
import { CommentCommand } from "./commands/comment";
import { ConnectCommand } from "./commands/connect";
import { GroupView, GroupContents, GroupFollowers } from "./commands/group";
import { LoginCommand } from "./commands/login";
import { LogoutCommand } from "./commands/logout";
import { config } from "./lib/config";
import { PingCommand } from "./commands/ping";
import { SearchCommand } from "./commands/search";
import { SessionMode } from "./commands/session";
import { UploadCommand } from "./commands/upload";
import {
  UserView,
  UserContents,
  UserFollowers,
  UserFollowing,
} from "./commands/user";
import { WhoamiCommand } from "./commands/whoami";
import { Spinner } from "./components/Spinner";
import { useCommand } from "./hooks/use-command";
import { plural } from "./lib/format";

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

// ── Inline command components for subcommands ──

function BlockUpdateCommand({
  id,
  title,
  description,
  content,
  altText,
}: {
  id: number;
  title?: string;
  description?: string;
  content?: string;
  altText?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.updateBlock(id, { title, description, content, alt_text: altText }),
  );

  if (loading) return <Spinner label="Updating block" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Updated block {data.id}</Text>
      {data.title && <Text dimColor> — {data.title}</Text>}
    </Box>
  );
}

function BlockCommentsCommand({
  id,
  page = 1,
  per,
}: {
  id: number;
  page?: number;
  per?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.getBlockComments(id, { page, per }),
  );

  if (loading) return <Spinner label="Loading comments" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No comments</Text>
      ) : (
        data.data.map((c) => (
          <Box key={c.id} flexDirection="column" marginBottom={1}>
            <Text>
              <Text bold>{c.user.name}</Text>
              <Text dimColor> · {c.id}</Text>
            </Text>
            {c.body?.plain && <Text>{c.body.plain}</Text>}
          </Box>
        ))
      )}
      <Text dimColor>
        Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "comment")}
      </Text>
    </Box>
  );
}

function BlockConnectionsCommand({
  id,
  page = 1,
  per,
}: {
  id: number;
  page?: number;
  per?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.getBlockConnections(id, { page, per }),
  );

  if (loading) return <Spinner label="Loading connections" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>Not connected to any channels</Text>
      ) : (
        data.data.map((ch) => (
          <Text key={ch.id}>
            {ch.title}{" "}
            <Text dimColor>
              @{ch.slug} · {ch.visibility}
            </Text>
          </Text>
        ))
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "channel")}
      </Text>
    </Box>
  );
}

function ChannelCreateCommand({
  title,
  visibility,
  description,
}: {
  title: string;
  visibility?: "public" | "closed" | "private";
  description?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.createChannel(title, { visibility, description }),
  );

  if (loading) return <Spinner label="Creating channel" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Created </Text>
      <Text bold>{data.title}</Text>
      <Text dimColor>
        {" "}
        · {data.slug} · {data.visibility}
      </Text>
    </Box>
  );
}

function ChannelUpdateCommand({
  slug,
  title,
  visibility,
  description,
}: {
  slug: string;
  title?: string;
  visibility?: "public" | "closed" | "private";
  description?: string;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.updateChannel(slug, { title, visibility, description }),
  );

  if (loading) return <Spinner label="Updating channel" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Updated </Text>
      <Text bold>{data.title}</Text>
      <Text dimColor> · {data.slug}</Text>
    </Box>
  );
}

function ChannelDeleteCommand({ slug }: { slug: string }) {
  const { data, error, loading } = useCommand(async () => {
    await arena.deleteChannel(slug);
    return { slug };
  });

  if (loading) return <Spinner label="Deleting channel" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Deleted channel {data.slug}</Text>
    </Box>
  );
}

function ChannelConnectionsCommand({
  slug,
  page = 1,
  per,
}: {
  slug: string;
  page?: number;
  per?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.getChannelConnections(slug, { page, per }),
  );

  if (loading) return <Spinner label="Loading connections" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>Not connected to any channels</Text>
      ) : (
        data.data.map((ch) => (
          <Text key={ch.id}>
            {ch.title}{" "}
            <Text dimColor>
              @{ch.slug} · {ch.visibility}
            </Text>
          </Text>
        ))
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "channel")}
      </Text>
    </Box>
  );
}

function ChannelFollowersCommand({
  slug,
  page = 1,
  per,
}: {
  slug: string;
  page?: number;
  per?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.getChannelFollowers(slug, { page, per }),
  );

  if (loading) return <Spinner label="Loading followers" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      {data.data.length === 0 ? (
        <Text dimColor>No followers</Text>
      ) : (
        data.data.map((user) => (
          <Text key={user.id}>
            {user.name} <Text dimColor>@{user.slug}</Text>
          </Text>
        ))
      )}
      <Text dimColor>
        {"\n"}Page {data.meta.current_page}/{data.meta.total_pages} ·{" "}
        {plural(data.meta.total_count, "follower")}
      </Text>
    </Box>
  );
}

function ConnectionGetCommand({ id }: { id: number }) {
  const { data, error, loading } = useCommand(() => arena.getConnection(id));

  if (loading) return <Spinner label="Loading connection" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box flexDirection="column">
      <Text>Connection {data.id}</Text>
      <Text dimColor>
        position: {data.position} · pinned: {String(data.pinned)} · can remove:{" "}
        {String(data.can.remove)}
      </Text>
      {data.connected_by && (
        <Text dimColor>Connected by {data.connected_by.name}</Text>
      )}
    </Box>
  );
}

function ConnectionDeleteCommand({ id }: { id: number }) {
  const { data, error, loading } = useCommand(async () => {
    await arena.deleteConnection(id);
    return { id };
  });

  if (loading) return <Spinner label="Deleting connection" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Deleted connection {data.id}</Text>
    </Box>
  );
}

function ConnectionMoveCommand({
  id,
  movement,
  position,
}: {
  id: number;
  movement: Movement;
  position?: number;
}) {
  const { data, error, loading } = useCommand(() =>
    arena.moveConnection(id, movement, position),
  );

  if (loading) return <Spinner label="Moving connection" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Moved to position {data.position}</Text>
    </Box>
  );
}

function CommentDeleteCommand({ id }: { id: number }) {
  const { data, error, loading } = useCommand(async () => {
    await arena.deleteComment(id);
    return { id };
  });

  if (loading) return <Spinner label="Deleting comment" />;
  if (error) return <Text color="red">✕ {error}</Text>;
  if (!data) return null;

  return (
    <Box>
      <Text color="green">✓ </Text>
      <Text>Deleted comment {data.id}</Text>
    </Box>
  );
}

// ── Help ──

function Help() {
  const { exit } = useApp();
  useEffect(() => {
    exit();
  }, [exit]);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="green">
          **
        </Text>
        <Text bold> arena</Text>
        <Text dimColor> · Are.na from the terminal</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Usage</Text>
        <Text> $ arena &lt;command&gt; [options]</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Channels</Text>
        <Text> channel &lt;slug&gt; View a channel</Text>
        <Text> channel create &lt;title&gt; Create a channel</Text>
        <Text> channel update &lt;slug&gt; Update a channel</Text>
        <Text> channel delete &lt;slug&gt; Delete a channel</Text>
        <Text> channel connections &lt;slug&gt; Where channel appears</Text>
        <Text> channel followers &lt;slug&gt; Channel followers</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Blocks</Text>
        <Text> block &lt;id&gt; View a block</Text>
        <Text> block update &lt;id&gt; Update a block</Text>
        <Text> block comments &lt;id&gt; View block comments</Text>
        <Text> block connections &lt;id&gt; Where block appears</Text>
        <Text> add &lt;channel&gt; &lt;value&gt; Add content to a channel</Text>
        <Text> upload &lt;file&gt; --channel &lt;ch&gt; Upload a file</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Connections</Text>
        <Text>
          {" "}
          connect &lt;id&gt; &lt;channel&gt; Connect block to channel
        </Text>
        <Text> connection &lt;id&gt; View a connection</Text>
        <Text> connection delete &lt;id&gt; Remove a connection</Text>
        <Text> connection move &lt;id&gt; Reposition a connection</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Comments</Text>
        <Text> comment &lt;blockId&gt; &lt;text&gt; Add a comment</Text>
        <Text> comment delete &lt;id&gt; Delete a comment</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Users &amp; Groups</Text>
        <Text> user &lt;slug&gt; View a user</Text>
        <Text> user contents &lt;slug&gt; User's content</Text>
        <Text> user followers &lt;slug&gt; User's followers</Text>
        <Text> user following &lt;slug&gt; Who user follows</Text>
        <Text> group &lt;slug&gt; View a group</Text>
        <Text> group contents &lt;slug&gt; Group's content</Text>
        <Text> group followers &lt;slug&gt; Group's followers</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Other</Text>
        <Text> search &lt;query&gt; Search Are.na</Text>
        <Text> whoami Show current user</Text>
        <Text> login Authenticate via OAuth</Text>
        <Text> logout Log out of your account</Text>
        <Text> ping API health check</Text>
      </Box>

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

// ── JSON handler ──

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
        const sub = args[0];
        if (sub === "create") {
          result = await arena.createChannel(args[1]!, {
            visibility: flags.visibility as
              | "public"
              | "closed"
              | "private"
              | undefined,
            description: flags.description as string | undefined,
          });
        } else if (sub === "update") {
          result = await arena.updateChannel(args[1]!, {
            title: flags.title as string | undefined,
            visibility: flags.visibility as
              | "public"
              | "closed"
              | "private"
              | undefined,
            description: flags.description as string | undefined,
          });
        } else if (sub === "delete") {
          await arena.deleteChannel(args[1]!);
          result = { deleted: true, slug: args[1] };
        } else if (sub === "connections") {
          result = await arena.getChannelConnections(args[1]!, { page, per });
        } else if (sub === "followers") {
          result = await arena.getChannelFollowers(args[1]!, { page, per });
        } else {
          const [channel, contents] = await Promise.all([
            arena.getChannel(sub!),
            arena.getChannelContents(sub!, { page, per }),
          ]);
          result = {
            ...channel,
            contents: contents.data,
            meta: contents.meta,
          };
        }
        break;
      }

      case "block":
      case "bl": {
        const sub = args[0];
        if (sub === "update") {
          result = await arena.updateBlock(Number(args[1]), {
            title: flags.title as string | undefined,
            description: flags.description as string | undefined,
            content: flags.content as string | undefined,
            alt_text: flags["alt-text"] as string | undefined,
          });
        } else if (sub === "comments") {
          result = await arena.getBlockComments(Number(args[1]), { page, per });
        } else if (sub === "connections") {
          result = await arena.getBlockConnections(Number(args[1]), {
            page,
            per,
          });
        } else {
          result = await arena.getBlock(Number(sub));
        }
        break;
      }

      case "search":
      case "s":
        result = await arena.search(args.join(" "), {
          page,
          per,
          type: flags.type as string | undefined,
          sort: flags.sort as string | undefined,
          scope: flags.scope as string | undefined,
          ext: flags.ext as string | undefined,
          after: flags.after as string | undefined,
        });
        break;

      case "add": {
        const ch = await arena.getChannel(args[0]!);
        result = await arena.createBlock(args.slice(1).join(" "), [ch.id], {
          title: flags.title as string | undefined,
          description: flags.description as string | undefined,
          alt_text: flags["alt-text"] as string | undefined,
        });
        break;
      }

      case "connect":
        result = await arena.connect(
          Number(args[0]),
          [args[1]!],
          (flags.type as "Block" | "Channel" | undefined) || "Block",
        );
        result = { connected: true };
        break;

      case "connection": {
        const sub = args[0];
        if (sub === "delete") {
          await arena.deleteConnection(Number(args[1]));
          result = { deleted: true, id: Number(args[1]) };
        } else if (sub === "move") {
          result = await arena.moveConnection(
            Number(args[1]),
            (flags.movement as Movement) || "insert_at",
            flags.position ? Number(flags.position) : undefined,
          );
        } else {
          result = await arena.getConnection(Number(sub));
        }
        break;
      }

      case "comment": {
        const sub = args[0];
        if (sub === "delete") {
          await arena.deleteComment(Number(args[1]));
          result = { deleted: true, id: Number(args[1]) };
        } else {
          result = await arena.createComment(
            Number(sub),
            args.slice(1).join(" "),
          );
        }
        break;
      }

      case "user": {
        const sub = args[0];
        if (sub === "contents") {
          result = await arena.getUserContents(args[1]!, {
            page,
            per,
            type: flags.type as string | undefined,
          });
        } else if (sub === "followers") {
          result = await arena.getUserFollowers(args[1]!, { page, per });
        } else if (sub === "following") {
          result = await arena.getUserFollowing(args[1]!, {
            page,
            per,
            type: flags.type as string | undefined,
          });
        } else {
          result = await arena.getUser(sub!);
        }
        break;
      }

      case "group": {
        const sub = args[0];
        if (sub === "contents") {
          result = await arena.getGroupContents(args[1]!, {
            page,
            per,
            type: flags.type as string | undefined,
          });
        } else if (sub === "followers") {
          result = await arena.getGroupFollowers(args[1]!, { page, per });
        } else {
          result = await arena.getGroup(sub!);
        }
        break;
      }

      case "upload": {
        const { readFileSync } = await import("fs");
        const { basename } = await import("path");
        const file = args[0]!;
        const filename = basename(file);
        const ext = filename.split(".").pop()?.toLowerCase() ?? "";
        const mimeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
          pdf: "application/pdf",
        };
        const contentType = mimeMap[ext] ?? "application/octet-stream";
        const fileBuffer = readFileSync(file);
        const presigned = await arena.presignUpload([
          { filename, content_type: contentType },
        ]);
        const target = presigned.files[0]!;
        await fetch(target.upload_url, {
          method: "PUT",
          headers: { "Content-Type": target.content_type },
          body: fileBuffer,
        });
        const s3Url = `https://s3.amazonaws.com/arena_images-temp/${target.key}`;
        const channel = flags.channel as string;
        const ch = await arena.getChannel(channel);
        result = await arena.createBlock(s3Url, [ch.id], {
          title: flags.title as string | undefined,
          description: flags.description as string | undefined,
        });
        break;
      }

      case "whoami":
      case "me":
        result = await arena.getMe();
        break;

      case "ping":
        result = await arena.ping();
        break;

      case "logout": {
        const hadToken = !!config.getToken();
        config.clearToken();
        result = { logged_out: hadToken };
        break;
      }

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

// ── Main ──

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
  const page = Number(flags.page) || undefined;
  const per = Number(flags.per) || undefined;

  switch (command) {
    case "channel":
    case "ch": {
      const sub = rest[0];
      if (sub === "create") {
        element = (
          <ChannelCreateCommand
            title={rest[1]!}
            visibility={
              flags.visibility as "public" | "closed" | "private" | undefined
            }
            description={flags.description as string | undefined}
          />
        );
      } else if (sub === "update") {
        element = (
          <ChannelUpdateCommand
            slug={rest[1]!}
            title={flags.title as string | undefined}
            visibility={
              flags.visibility as "public" | "closed" | "private" | undefined
            }
            description={flags.description as string | undefined}
          />
        );
      } else if (sub === "delete") {
        element = <ChannelDeleteCommand slug={rest[1]!} />;
      } else if (sub === "connections") {
        element = (
          <ChannelConnectionsCommand slug={rest[1]!} page={page} per={per} />
        );
      } else if (sub === "followers") {
        element = (
          <ChannelFollowersCommand slug={rest[1]!} page={page} per={per} />
        );
      } else {
        element = <ChannelCommand slug={sub!} page={page} per={per} />;
      }
      break;
    }

    case "block":
    case "bl": {
      const sub = rest[0];
      if (sub === "update") {
        element = (
          <BlockUpdateCommand
            id={Number(rest[1])}
            title={flags.title as string | undefined}
            description={flags.description as string | undefined}
            content={flags.content as string | undefined}
            altText={flags["alt-text"] as string | undefined}
          />
        );
      } else if (sub === "comments") {
        element = (
          <BlockCommentsCommand id={Number(rest[1])} page={page} per={per} />
        );
      } else if (sub === "connections") {
        element = (
          <BlockConnectionsCommand id={Number(rest[1])} page={page} per={per} />
        );
      } else {
        element = <BlockCommand id={Number(sub)} />;
      }
      break;
    }

    case "search":
    case "s":
      element = (
        <SearchCommand
          query={rest.join(" ")}
          page={page}
          per={per}
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

    case "connection": {
      const sub = rest[0];
      if (sub === "delete") {
        element = <ConnectionDeleteCommand id={Number(rest[1])} />;
      } else if (sub === "move") {
        element = (
          <ConnectionMoveCommand
            id={Number(rest[1])}
            movement={(flags.movement as Movement) || "insert_at"}
            position={flags.position ? Number(flags.position) : undefined}
          />
        );
      } else {
        element = <ConnectionGetCommand id={Number(sub)} />;
      }
      break;
    }

    case "comment": {
      const sub = rest[0];
      if (sub === "delete") {
        element = <CommentDeleteCommand id={Number(rest[1])} />;
      } else {
        element = (
          <CommentCommand
            blockId={Number(sub)}
            body={rest.slice(1).join(" ")}
          />
        );
      }
      break;
    }

    case "user": {
      const sub = rest[0];
      if (sub === "contents") {
        element = (
          <UserContents
            slug={rest[1]!}
            page={page}
            per={per}
            type={flags.type as string | undefined}
          />
        );
      } else if (sub === "followers") {
        element = <UserFollowers slug={rest[1]!} page={page} per={per} />;
      } else if (sub === "following") {
        element = (
          <UserFollowing
            slug={rest[1]!}
            page={page}
            per={per}
            type={flags.type as string | undefined}
          />
        );
      } else {
        element = <UserView slug={sub!} />;
      }
      break;
    }

    case "group": {
      const sub = rest[0];
      if (sub === "contents") {
        element = (
          <GroupContents
            slug={rest[1]!}
            page={page}
            per={per}
            type={flags.type as string | undefined}
          />
        );
      } else if (sub === "followers") {
        element = <GroupFollowers slug={rest[1]!} page={page} per={per} />;
      } else {
        element = <GroupView slug={sub!} />;
      }
      break;
    }

    case "upload":
      element = (
        <UploadCommand
          file={rest[0]!}
          channel={flags.channel as string}
          title={flags.title as string | undefined}
          description={flags.description as string | undefined}
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

    case "ping":
      element = <PingCommand />;
      break;

    case "logout":
      element = <LogoutCommand />;
      break;

    default:
      element = <Help />;
  }

  const { waitUntilExit } = render(element);
  await waitUntilExit();
}
