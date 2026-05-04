import React from "react";
import { Text } from "ink";
import type {
  ChannelContentSort,
  ConnectionFilter,
  ConnectionSort,
  ContentSort,
  ContentTypeFilter,
  FileExtension,
  FollowableType,
  GroupSort,
  Movement,
  SearchScope,
  SearchSort,
  SearchTypeFilter,
  Visibility,
} from "../api/types";
import { arenaApiBaseUrl, client, getData } from "../api/client";
import {
  flag,
  flagAs,
  idArg,
  intFlag,
  optPage,
  optPer,
  page,
  per,
  readStdin,
  requireArg,
  requireFlag,
  type Flags,
} from "./args";
import { AddCommand } from "../commands/add";
import {
  BlockCommand,
  BlockUpdateCommand,
  BlockCommentsCommand,
} from "../commands/block";
import {
  ChannelCommand,
  ChannelContentsCommand,
  ChannelCreateCommand,
  ChannelUpdateCommand,
  ChannelDeleteCommand,
} from "../commands/channel";
import { CommentCommand, CommentDeleteCommand } from "../commands/comment";
import { ConnectCommand } from "../commands/connect";
import {
  ConnectionGetCommand,
  ConnectionDeleteCommand,
  ConnectionMoveCommand,
  ConnectionUpdateCommand,
  BlockConnectionsCommand,
  ChannelConnectionsCommand,
  ChannelFollowersCommand,
} from "../commands/connection";
import {
  GroupContentsCommand,
  GroupFollowersCommand,
  GroupViewCommand,
} from "../commands/group";
import { LoginCommand } from "../commands/login";
import { LogoutCommand } from "../commands/logout";
import {
  ImportCommand,
  parseImportOptions,
  runImportJsonStream,
} from "../commands/import";
import { PingCommand } from "../commands/ping";
import { SearchCommand } from "../commands/search";
import { UpdateCommand, checkForCliUpdate } from "../commands/update";
import { UploadCommand } from "../commands/upload";
import {
  UserContentsCommand,
  UserFollowersCommand,
  UserFollowingCommand,
  UserGroupsCommand,
  UserViewCommand,
} from "../commands/user";
import { VersionCommand } from "../commands/version";
import { WhoamiCommand } from "../commands/whoami";
import { config } from "./config";
import type { DestructiveCommandConfig } from "./destructive-confirmation";
import { uploadLocalFile } from "./upload";
import {
  entityMetadataFlag,
  metadataInputFlag,
  requireMetadataInputFlag,
} from "./metadata";
import { CLI_PACKAGE_NAME, getCliVersion } from "./version";

interface HelpLine {
  usage: string;
  description: string;
}

export interface HelpOption {
  flag: string;
  description: string;
}

export interface CommandHelpDoc {
  summary: string;
  usage: string[];
  options?: HelpOption[];
  examples: string[];
  notes?: string[];
  seeAlso?: string[];
  subcommands?: Record<string, Omit<CommandHelpDoc, "subcommands">>;
}

export interface CommandDefinition {
  name: string;
  aliases?: string[];
  group: string;
  help: HelpLine[];
  destructive?: DestructiveCommandConfig;
  render: (args: string[], flags: Flags) => React.JSX.Element;
  json?: (args: string[], flags: Flags) => Promise<unknown>;
  jsonStream?: (
    args: string[],
    flags: Flags,
    write: (event: unknown) => void,
  ) => Promise<number | void>;
  /** Whether this command appears in session mode autocomplete */
  session?: {
    args: string | null;
    desc: string;
  };
}

// ── Registry ──

export const commands: CommandDefinition[] = [
  {
    name: "channel",
    aliases: ["ch"],
    group: "Channels",
    help: [
      {
        usage: "channel <slug> [--page <n>] [--per <n>]",
        description: "Options",
      },
      { usage: "channel worldmaking", description: "Example" },
      {
        usage:
          "channel contents <slug> [--page <n>] [--per <n>] [--sort <s>] [--user-id <id>]",
        description: "Options",
      },
      {
        usage:
          "channel contents worldmaking --sort updated_at_desc --user-id 123",
        description: "Example",
      },
      {
        usage:
          "channel create <title> [--visibility <public|private|closed>] [--description <text>] [--group-id <id>] [--metadata <json|key=value>]",
        description: "Options",
      },
      {
        usage:
          'channel create "My Research" --visibility private --metadata status=draft',
        description: "Example",
      },
      {
        usage:
          "channel update <slug> [--title <text>] [--description <text>] [--visibility <public|private|closed>] [--metadata <json|key=value>]",
        description: "Options",
      },
      {
        usage:
          'channel update my-research --title "New title" --description "Updated"',
        description: "Example",
      },
      { usage: "channel delete <slug>", description: "Options" },
      { usage: "channel delete my-research", description: "Example" },
      {
        usage:
          "channel connections <slug> [--page <n>] [--per <n>] [--sort <s>]",
        description: "Options",
      },
      {
        usage: "channel connections worldmaking --sort connected_at_desc",
        description: "Example",
      },
      {
        usage: "channel followers <slug> [--page <n>] [--per <n>] [--sort <s>]",
        description: "Options",
      },
      {
        usage: "channel followers worldmaking --sort connected_at_desc",
        description: "Example",
      },
    ],
    destructive: {
      subcommands: {
        delete: { resourceLabel: "channel slug" },
      },
    },
    session: { args: "<slug>", desc: "Browse a channel" },
    render(args, flags) {
      const sub = args[0];
      const visibility = flagAs<Visibility>(flags, "visibility");
      switch (sub) {
        case "create":
          return (
            <ChannelCreateCommand
              title={requireArg(args, 1, "title")}
              visibility={visibility}
              description={flag(flags, "description")}
              groupId={intFlag(flags, "group-id")}
              metadata={entityMetadataFlag(flags)}
            />
          );
        case "update":
          return (
            <ChannelUpdateCommand
              slug={requireArg(args, 1, "slug")}
              title={flag(flags, "title")}
              visibility={visibility}
              description={flag(flags, "description")}
              metadata={metadataInputFlag(flags)}
            />
          );
        case "delete":
          return <ChannelDeleteCommand slug={requireArg(args, 1, "slug")} />;
        case "contents":
          return (
            <ChannelContentsCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              sort={
                flagAs<ChannelContentSort>(flags, "sort") ?? "position_desc"
              }
              userId={intFlag(flags, "user-id")}
            />
          );
        case "connections":
          return (
            <ChannelConnectionsCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              sort={flagAs<ConnectionSort>(flags, "sort")}
            />
          );
        case "followers":
          return (
            <ChannelFollowersCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              sort={flagAs<ConnectionSort>(flags, "sort")}
            />
          );
        default:
          return (
            <ChannelCommand
              slug={requireArg(args, 0, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
            />
          );
      }
    },
    async json(args, flags) {
      const sub = args[0];
      const visibility = flagAs<Visibility>(flags, "visibility");
      switch (sub) {
        case "create":
          return getData(
            client.POST("/v3/channels", {
              body: {
                title: requireArg(args, 1, "title"),
                visibility,
                description: flag(flags, "description"),
                group_id: intFlag(flags, "group-id"),
                metadata: entityMetadataFlag(flags),
              },
            }),
          );
        case "update":
          return getData(
            client.PUT("/v3/channels/{id}", {
              params: { path: { id: requireArg(args, 1, "slug") } },
              body: {
                title: flag(flags, "title"),
                visibility,
                description: flag(flags, "description"),
                metadata: metadataInputFlag(flags),
              },
            }),
          );
        case "delete":
          await client.DELETE("/v3/channels/{id}", {
            params: { path: { id: requireArg(args, 1, "slug") } },
          });
          return { deleted: true, slug: requireArg(args, 1, "slug") };
        case "contents":
          return getData(
            client.GET("/v3/channels/{id}/contents", {
              params: {
                path: { id: requireArg(args, 1, "slug") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  sort:
                    flagAs<ChannelContentSort>(flags, "sort") ??
                    "position_desc",
                  user_id: intFlag(flags, "user-id"),
                },
              },
            }),
          );
        case "connections":
          return getData(
            client.GET("/v3/channels/{id}/connections", {
              params: {
                path: { id: requireArg(args, 1, "slug") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  sort: flagAs<ConnectionSort>(flags, "sort"),
                },
              },
            }),
          );
        case "followers":
          return getData(
            client.GET("/v3/channels/{id}/followers", {
              params: {
                path: { id: requireArg(args, 1, "slug") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  sort: flagAs<ConnectionSort>(flags, "sort"),
                },
              },
            }),
          );
        default:
          return getData(
            client.GET("/v3/channels/{id}", {
              params: { path: { id: requireArg(args, 0, "slug") } },
            }),
          );
      }
    },
  },

  {
    name: "block",
    aliases: ["bl"],
    group: "Blocks",
    help: [
      { usage: "block <id>", description: "Options" },
      { usage: "block 12345", description: "Example" },
      {
        usage:
          "block update <id> [--title <text>] [--description <text>] [--content <text>] [--alt-text <text>] [--metadata <json|key=value>]",
        description: "Options",
      },
      {
        usage: 'block update 12345 --title "New" --description "Updated"',
        description: "Example",
      },
      {
        usage: "block comments <id> [--page <n>] [--per <n>] [--sort <s>]",
        description: "Options",
      },
      {
        usage: "block comments 12345 --sort connected_at_desc",
        description: "Example",
      },
      {
        usage:
          "block connections <id> [--page <n>] [--per <n>] [--sort <s>] [--filter <ALL|OWN|EXCLUDE_OWN>]",
        description: "Options",
      },
      {
        usage: "block connections 12345 --sort connected_at_desc --filter OWN",
        description: "Example",
      },
    ],
    session: { args: "<id>", desc: "View a block" },
    render(args, flags) {
      const sub = args[0];
      switch (sub) {
        case "update":
          return (
            <BlockUpdateCommand
              id={idArg(args, 1, "block id")}
              title={flag(flags, "title")}
              description={flag(flags, "description")}
              content={flag(flags, "content")}
              altText={flag(flags, "alt-text")}
              metadata={metadataInputFlag(flags)}
            />
          );
        case "comments":
          return (
            <BlockCommentsCommand
              id={idArg(args, 1, "block id")}
              page={optPage(flags)}
              per={optPer(flags)}
              sort={flagAs<ConnectionSort>(flags, "sort")}
            />
          );
        case "connections":
          return (
            <BlockConnectionsCommand
              id={idArg(args, 1, "block id")}
              page={optPage(flags)}
              per={optPer(flags)}
              sort={flagAs<ConnectionSort>(flags, "sort")}
              filter={flagAs<ConnectionFilter>(flags, "filter")}
            />
          );
        default:
          return <BlockCommand id={idArg(args, 0, "block id")} />;
      }
    },
    async json(args, flags) {
      const sub = args[0];
      switch (sub) {
        case "update":
          return getData(
            client.PUT("/v3/blocks/{id}", {
              params: { path: { id: idArg(args, 1, "block id") } },
              body: {
                title: flag(flags, "title"),
                description: flag(flags, "description"),
                content: flag(flags, "content"),
                alt_text: flag(flags, "alt-text"),
                metadata: metadataInputFlag(flags),
              },
            }),
          );
        case "comments":
          return getData(
            client.GET("/v3/blocks/{id}/comments", {
              params: {
                path: { id: idArg(args, 1, "block id") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  sort: flagAs<ConnectionSort>(flags, "sort"),
                },
              },
            }),
          );
        case "connections":
          return getData(
            client.GET("/v3/blocks/{id}/connections", {
              params: {
                path: { id: idArg(args, 1, "block id") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  sort: flagAs<ConnectionSort>(flags, "sort"),
                  filter: flagAs<ConnectionFilter>(flags, "filter"),
                },
              },
            }),
          );
        default:
          return getData(
            client.GET("/v3/blocks/{id}", {
              params: { path: { id: idArg(args, 0, "block id") } },
            }),
          );
      }
    },
  },

  {
    name: "search",
    aliases: ["s"],
    group: "Other",
    help: [
      {
        usage:
          "search <query> [--page <n>] [--per <n>] [--type <t>] [--scope <all|my|following>] [--sort <s>] [--ext <ext>] [--after <iso8601>] [--seed <n>] [--user-id <id>] [--group-id <id>] [--channel-id <id>]",
        description: "Options",
      },
      {
        usage: 'search "brutalist architecture"',
        description: "Example",
      },
      {
        usage: "search <query> --type Image",
        description: "Example",
      },
      {
        usage: "search <query> --scope my",
        description: "Example",
      },
      {
        usage: "search <query> --sort created_at_desc",
        description: "Example",
      },
      {
        usage: "search <query> --ext pdf",
        description: "Example",
      },
      {
        usage: "search <query> --after 2024-01-01T00:00:00Z",
        description: "Example",
      },
      {
        usage: "search <query> --channel-id 789",
        description: "Example",
      },
      {
        usage: "search <query> --sort random --seed 42",
        description: "Example",
      },
    ],
    session: { args: "<query>", desc: "Search Are.na" },
    render(args, flags) {
      const query = requireArg([args.join(" ")], 0, "query");
      return (
        <SearchCommand
          query={query}
          page={optPage(flags)}
          per={optPer(flags)}
          type={flag(flags, "type")}
          sort={flagAs<SearchSort>(flags, "sort")}
          scope={flagAs<SearchScope>(flags, "scope")}
          ext={flagAs<FileExtension>(flags, "ext")}
          after={flag(flags, "after")}
          seed={intFlag(flags, "seed")}
          userId={intFlag(flags, "user-id")}
          groupId={intFlag(flags, "group-id")}
          channelId={intFlag(flags, "channel-id")}
        />
      );
    },
    async json(args, flags) {
      const typeFlag = flagAs<SearchTypeFilter>(flags, "type");
      const extFlag = flagAs<FileExtension>(flags, "ext");
      return getData(
        client.GET("/v3/search", {
          params: {
            query: {
              query: requireArg([args.join(" ")], 0, "query"),
              page: page(flags),
              per: per(flags),
              type: typeFlag ? [typeFlag] : undefined,
              sort: flagAs<SearchSort>(flags, "sort"),
              scope: flagAs<SearchScope>(flags, "scope"),
              ext: extFlag ? [extFlag] : undefined,
              after: flag(flags, "after"),
              seed: intFlag(flags, "seed"),
              user_id: intFlag(flags, "user-id"),
              group_id: intFlag(flags, "group-id"),
              channel_id: intFlag(flags, "channel-id"),
            },
          },
        }),
      );
    },
  },

  {
    name: "add",
    aliases: [],
    group: "Blocks",
    help: [
      {
        usage:
          "add <channel> <value> [--title <text>] [--description <text>] [--alt-text <text>] [--original-source-url <url>] [--original-source-title <text>] [--insert-at <n>]",
        description: "Options",
      },
      {
        usage: 'add <channel> <value> --title "Title" --description "Notes"',
        description: "Example",
      },
      {
        usage: 'add <channel> <value> --alt-text "Accessible text"',
        description: "Example",
      },
      {
        usage:
          'add <channel> <value> --original-source-url <url> --original-source-title "Source"',
        description: "Example",
      },
      {
        usage: "add <channel> <value> --insert-at 1",
        description: "Example",
      },
      {
        usage: "add <channel> <value> --metadata status=reviewed",
        description: "Example",
      },
      {
        usage: "add <channel> <value> --connection-metadata placement=homepage",
        description: "Example",
      },
    ],
    render(args, flags) {
      const argValue = args.slice(1).join(" ").trim() || undefined;
      return (
        <AddCommand
          channel={requireArg(args, 0, "channel")}
          value={argValue}
          title={flag(flags, "title")}
          description={flag(flags, "description")}
          altText={flag(flags, "alt-text")}
          originalSourceUrl={flag(flags, "original-source-url")}
          originalSourceTitle={flag(flags, "original-source-title")}
          insertAt={intFlag(flags, "insert-at")}
          metadata={entityMetadataFlag(flags)}
          connectionMetadata={entityMetadataFlag(flags, "connection-metadata")}
        />
      );
    },
    async json(args, flags) {
      const ch = await getData(
        client.GET("/v3/channels/{id}", {
          params: { path: { id: requireArg(args, 0, "channel") } },
        }),
      );

      const argValue = args.slice(1).join(" ").trim() || undefined;
      const stdin = argValue ? undefined : await readStdin();
      const value = argValue ?? stdin;
      if (!value) throw new Error("Missing required argument: value");
      const metadata = entityMetadataFlag(flags);
      const connectionMetadata = entityMetadataFlag(
        flags,
        "connection-metadata",
      );

      return getData(
        client.POST("/v3/blocks", {
          body: {
            value,
            channels: [
              {
                id: ch.id,
                position: intFlag(flags, "insert-at"),
                metadata: connectionMetadata,
              },
            ],
            title: flag(flags, "title"),
            description: flag(flags, "description"),
            alt_text: flag(flags, "alt-text"),
            original_source_url: flag(flags, "original-source-url"),
            original_source_title: flag(flags, "original-source-title"),
            metadata,
          },
        }),
      );
    },
  },

  {
    name: "upload",
    aliases: [],
    group: "Blocks",
    help: [
      {
        usage:
          "upload <file> --channel <ch> [--title <text>] [--description <text>]",
        description: "Options",
      },
      {
        usage:
          'upload <file> --channel <ch> --title "Title" --description "Notes"',
        description: "Example",
      },
    ],
    render(args, flags) {
      return (
        <UploadCommand
          file={requireArg(args, 0, "file")}
          channel={requireFlag(flags, "channel")}
          title={flag(flags, "title")}
          description={flag(flags, "description")}
        />
      );
    },
    async json(args, flags) {
      const file = requireArg(args, 0, "file");
      const channel = requireFlag(flags, "channel");
      const { s3Url } = await uploadLocalFile(file);
      const ch = await getData(
        client.GET("/v3/channels/{id}", { params: { path: { id: channel } } }),
      );
      return getData(
        client.POST("/v3/blocks", {
          body: {
            value: s3Url,
            channel_ids: [ch.id],
            title: flag(flags, "title"),
            description: flag(flags, "description"),
          },
        }),
      );
    },
  },

  {
    name: "batch",
    aliases: [],
    group: "Blocks",
    help: [
      {
        usage:
          "batch <channel> [values...] [--title <text>] [--description <text>]",
        description: "Options",
      },
      {
        usage: 'batch my-channel "https://a.com" "https://b.com"',
        description: "Example",
      },
      {
        usage: "batch status <batch_id>",
        description: "Options",
      },
      {
        usage: "batch status 1234",
        description: "Example",
      },
    ],
    render(_args) {
      return <Text dimColor>batch is only available with --json</Text>;
    },
    async json(args, flags) {
      const sub = args[0];
      if (sub === "status") {
        return getData(
          client.GET("/v3/blocks/batch/{batch_id}", {
            params: { path: { batch_id: requireArg(args, 1, "batch_id") } },
          }),
        );
      }

      const channel = requireArg(args, 0, "channel");
      const argValues = args.slice(1).filter(Boolean);
      const stdin = argValues.length ? undefined : await readStdin();
      const values =
        argValues.length > 0
          ? argValues
          : stdin
            ? stdin.split("\n").filter(Boolean)
            : [];
      if (!values.length) throw new Error("No values provided");

      return getData(
        client.POST("/v3/blocks/batch", {
          body: {
            channel_ids: [channel],
            blocks: values.map((value) => ({
              value,
              title: flag(flags, "title"),
              description: flag(flags, "description"),
            })),
          },
        }),
      );
    },
  },

  {
    name: "import",
    aliases: [],
    group: "Blocks",
    help: [
      {
        usage:
          "import <channel> [--dir <path>] [--recursive] [--interactive] [--batch-size <n>] [--upload-concurrency <n>] [--poll-interval <ms>]",
        description: "Options",
      },
      {
        usage: "import my-channel --dir ./assets --recursive",
        description: "Example",
      },
      {
        usage: "import my-channel --interactive",
        description: "Example",
      },
    ],
    render(args, flags) {
      return <ImportCommand {...parseImportOptions(args, flags)} />;
    },
    async jsonStream(args, flags, write) {
      return runImportJsonStream(parseImportOptions(args, flags), (event) =>
        write(event),
      );
    },
  },

  {
    name: "connect",
    aliases: [],
    group: "Connections",
    help: [
      {
        usage:
          "connect <id> <channel> [--type <Block|Channel>] [--position <n>] [--metadata <json|key=value>]",
        description: "Options",
      },
      {
        usage:
          "connect <id> <channel> --type Channel --position 1 --metadata status=reviewed",
        description: "Example",
      },
    ],
    render(args, flags) {
      return (
        <ConnectCommand
          blockId={idArg(args, 0, "block id")}
          channel={requireArg(args, 1, "channel")}
          connectableType={flagAs<"Block" | "Channel">(flags, "type")}
          position={intFlag(flags, "position")}
          metadata={entityMetadataFlag(flags)}
        />
      );
    },
    async json(args, flags) {
      const response = await getData(
        client.POST("/v3/connections", {
          body: {
            connectable_id: idArg(args, 0, "block id"),
            connectable_type:
              flagAs<"Block" | "Channel">(flags, "type") || "Block",
            channels: [
              {
                id: requireArg(args, 1, "channel"),
                position: intFlag(flags, "position"),
                metadata: entityMetadataFlag(flags),
              },
            ],
          },
        }),
      );
      return { connected: true, ...response };
    },
  },

  {
    name: "connection",
    aliases: [],
    group: "Connections",
    help: [
      { usage: "connection <id>", description: "Options" },
      { usage: "connection 67890", description: "Example" },
      { usage: "connection delete <id>", description: "Options" },
      { usage: "connection delete 67890", description: "Example" },
      {
        usage: "connection update <id> --metadata <json|key=value>",
        description: "Options",
      },
      {
        usage: "connection update 67890 --metadata status=reviewed,score=1",
        description: "Example",
      },
      {
        usage:
          "connection move <id> [--movement <move_to_top|move_to_bottom|insert_at>] [--position <n>]",
        description: "Options",
      },
      {
        usage: "connection move <id> --movement insert_at --position 1",
        description: "Example",
      },
    ],
    destructive: {
      subcommands: {
        delete: { resourceLabel: "connection id" },
      },
    },
    render(args, flags) {
      const sub = args[0];
      switch (sub) {
        case "delete":
          return (
            <ConnectionDeleteCommand id={idArg(args, 1, "connection id")} />
          );
        case "move":
          return (
            <ConnectionMoveCommand
              id={idArg(args, 1, "connection id")}
              movement={flagAs<Movement>(flags, "movement") || "insert_at"}
              position={intFlag(flags, "position")}
            />
          );
        case "update":
          return (
            <ConnectionUpdateCommand
              id={idArg(args, 1, "connection id")}
              metadata={requireMetadataInputFlag(flags)}
            />
          );
        default:
          return <ConnectionGetCommand id={idArg(args, 0, "connection id")} />;
      }
    },
    async json(args, flags) {
      const sub = args[0];
      switch (sub) {
        case "delete":
          await client.DELETE("/v3/connections/{id}", {
            params: { path: { id: idArg(args, 1, "connection id") } },
          });
          return { deleted: true, id: idArg(args, 1, "connection id") };
        case "move":
          return getData(
            client.POST("/v3/connections/{id}/move", {
              params: { path: { id: idArg(args, 1, "connection id") } },
              body: {
                movement: flagAs<Movement>(flags, "movement") || "insert_at",
                position: intFlag(flags, "position"),
              },
            }),
          );
        case "update":
          return getData(
            client.PUT("/v3/connections/{id}", {
              params: { path: { id: idArg(args, 1, "connection id") } },
              body: { metadata: requireMetadataInputFlag(flags) },
            }),
          );
        default:
          return getData(
            client.GET("/v3/connections/{id}", {
              params: { path: { id: idArg(args, 0, "connection id") } },
            }),
          );
      }
    },
  },

  {
    name: "comment",
    aliases: [],
    group: "Comments",
    help: [
      {
        usage: "comment <blockId> <text>",
        description: "Options",
      },
      { usage: 'comment 12345 "Nice find"', description: "Example" },
      { usage: "comment delete <id>", description: "Options" },
      { usage: "comment delete 67890", description: "Example" },
    ],
    destructive: {
      subcommands: {
        delete: { resourceLabel: "comment id" },
      },
    },
    render(args) {
      const sub = args[0];
      if (sub === "delete") {
        return <CommentDeleteCommand id={idArg(args, 1, "comment id")} />;
      }
      return (
        <CommentCommand
          blockId={idArg(args, 0, "block id")}
          body={requireArg([args.slice(1).join(" ")], 0, "comment text")}
        />
      );
    },
    async json(args) {
      const sub = args[0];
      if (sub === "delete") {
        await client.DELETE("/v3/comments/{id}", {
          params: { path: { id: idArg(args, 1, "comment id") } },
        });
        return { deleted: true, id: idArg(args, 1, "comment id") };
      }
      return getData(
        client.POST("/v3/blocks/{id}/comments", {
          params: { path: { id: idArg(args, 0, "block id") } },
          body: {
            body: requireArg([args.slice(1).join(" ")], 0, "comment text"),
          },
        }),
      );
    },
  },

  {
    name: "user",
    aliases: [],
    group: "Users & Groups",
    help: [
      { usage: "user <slug>", description: "Options" },
      { usage: "user damon-zucconi", description: "Example" },
      {
        usage:
          "user contents <slug> [--page <n>] [--per <n>] [--type <t>] [--sort <s>]",
        description: "Options",
      },
      {
        usage: "user contents <slug> --type Image --sort updated_at_desc",
        description: "Example",
      },
      {
        usage: "user followers <slug> [--page <n>] [--per <n>] [--sort <s>]",
        description: "Options",
      },
      {
        usage: "user followers <slug> --sort connected_at_desc",
        description: "Example",
      },
      {
        usage:
          "user following <slug> [--page <n>] [--per <n>] [--type <t>] [--sort <s>]",
        description: "Options",
      },
      {
        usage: "user following <slug> --type User --sort connected_at_desc",
        description: "Example",
      },
      {
        usage: "user groups <slug> [--page <n>] [--per <n>] [--sort <s>]",
        description: "Options",
      },
      {
        usage: "user groups <slug> --sort updated_at_desc",
        description: "Example",
      },
    ],
    session: { args: "<slug>", desc: "View a user profile" },
    render(args, flags) {
      const sub = args[0];
      switch (sub) {
        case "contents":
          return (
            <UserContentsCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              type={flag(flags, "type")}
              sort={flagAs<ContentSort>(flags, "sort")}
            />
          );
        case "followers":
          return (
            <UserFollowersCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              sort={flagAs<ConnectionSort>(flags, "sort")}
            />
          );
        case "following":
          return (
            <UserFollowingCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              type={flag(flags, "type")}
              sort={flagAs<ConnectionSort>(flags, "sort")}
            />
          );
        case "groups":
          return (
            <UserGroupsCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              sort={flagAs<GroupSort>(flags, "sort")}
            />
          );
        default:
          return <UserViewCommand slug={requireArg(args, 0, "slug")} />;
      }
    },
    async json(args, flags) {
      const sub = args[0];
      switch (sub) {
        case "contents":
          return getData(
            client.GET("/v3/users/{id}/contents", {
              params: {
                path: { id: requireArg(args, 1, "slug") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  type: flagAs<ContentTypeFilter>(flags, "type"),
                  sort: flagAs<ContentSort>(flags, "sort"),
                },
              },
            }),
          );
        case "followers":
          return getData(
            client.GET("/v3/users/{id}/followers", {
              params: {
                path: { id: requireArg(args, 1, "slug") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  sort: flagAs<ConnectionSort>(flags, "sort"),
                },
              },
            }),
          );
        case "following":
          return getData(
            client.GET("/v3/users/{id}/following", {
              params: {
                path: { id: requireArg(args, 1, "slug") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  type: flagAs<FollowableType>(flags, "type"),
                  sort: flagAs<ConnectionSort>(flags, "sort"),
                },
              },
            }),
          );
        case "groups":
          return getData(
            client.GET("/v3/users/{id}/groups", {
              params: {
                path: { id: requireArg(args, 1, "slug") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  sort: flagAs<GroupSort>(flags, "sort"),
                },
              },
            }),
          );
        default:
          return getData(
            client.GET("/v3/users/{id}", {
              params: { path: { id: requireArg(args, 0, "slug") } },
            }),
          );
      }
    },
  },

  {
    name: "group",
    aliases: [],
    group: "Users & Groups",
    help: [
      { usage: "group <slug>", description: "Options" },
      { usage: "group are-na-team", description: "Example" },
      {
        usage:
          "group contents <slug> [--page <n>] [--per <n>] [--type <t>] [--sort <s>]",
        description: "Options",
      },
      {
        usage: "group contents <slug> --type Image --sort updated_at_desc",
        description: "Example",
      },
      {
        usage: "group followers <slug> [--page <n>] [--per <n>] [--sort <s>]",
        description: "Options",
      },
      {
        usage: "group followers <slug> --sort connected_at_desc",
        description: "Example",
      },
    ],
    session: { args: "<slug>", desc: "View a group profile" },
    render(args, flags) {
      const sub = args[0];
      switch (sub) {
        case "contents":
          return (
            <GroupContentsCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              type={flag(flags, "type")}
              sort={flagAs<ContentSort>(flags, "sort")}
            />
          );
        case "followers":
          return (
            <GroupFollowersCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              sort={flagAs<ConnectionSort>(flags, "sort")}
            />
          );
        default:
          return <GroupViewCommand slug={requireArg(args, 0, "slug")} />;
      }
    },
    async json(args, flags) {
      const sub = args[0];
      switch (sub) {
        case "contents":
          return getData(
            client.GET("/v3/groups/{id}/contents", {
              params: {
                path: { id: requireArg(args, 1, "slug") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  type: flagAs<ContentTypeFilter>(flags, "type"),
                  sort: flagAs<ContentSort>(flags, "sort"),
                },
              },
            }),
          );
        case "followers":
          return getData(
            client.GET("/v3/groups/{id}/followers", {
              params: {
                path: { id: requireArg(args, 1, "slug") },
                query: {
                  page: page(flags),
                  per: per(flags),
                  sort: flagAs<ConnectionSort>(flags, "sort"),
                },
              },
            }),
          );
        default:
          return getData(
            client.GET("/v3/groups/{id}", {
              params: { path: { id: requireArg(args, 0, "slug") } },
            }),
          );
      }
    },
  },

  {
    name: "version",
    aliases: ["v"],
    group: "Other",
    help: [
      { usage: "version", description: "Options" },
      { usage: "version", description: "Example" },
    ],
    render() {
      return <VersionCommand />;
    },
    async json() {
      return { name: CLI_PACKAGE_NAME, version: getCliVersion() };
    },
  },

  {
    name: "update",
    aliases: ["upgrade"],
    group: "Other",
    help: [
      { usage: "update [--yes]", description: "Options" },
      { usage: "update", description: "Example" },
      { usage: "update --yes", description: "Example" },
    ],
    render(_args, flags) {
      const apply = flags["yes"] !== undefined || flags["y"] !== undefined;
      return <UpdateCommand apply={apply} />;
    },
    async json() {
      const info = await checkForCliUpdate();
      return {
        ...info,
        update_command: `npm install -g ${CLI_PACKAGE_NAME}@latest`,
      };
    },
  },

  {
    name: "whoami",
    aliases: ["me"],
    group: "Other",
    help: [
      { usage: "whoami", description: "Options" },
      { usage: "whoami", description: "Example" },
    ],
    session: { args: null, desc: "View your profile" },
    render() {
      return <WhoamiCommand />;
    },
    async json() {
      const me = await getData(client.GET("/v3/me"));
      return { ...me, api_base: arenaApiBaseUrl };
    },
  },

  {
    name: "login",
    aliases: [],
    group: "Other",
    help: [
      { usage: "login [--token <token>]", description: "Options" },
      { usage: "login", description: "Example" },
    ],
    render(args, flags) {
      return <LoginCommand token={flag(flags, "token") || args[0]} />;
    },
  },

  {
    name: "logout",
    aliases: [],
    group: "Other",
    help: [
      { usage: "logout", description: "Options" },
      { usage: "logout", description: "Example" },
    ],
    session: { args: null, desc: "Log out of your account" },
    render() {
      return <LogoutCommand />;
    },
    async json() {
      const hadToken = !!config.getToken();
      config.clearToken();
      return { logged_out: hadToken };
    },
  },

  {
    name: "ping",
    aliases: [],
    group: "Other",
    help: [
      { usage: "ping", description: "Options" },
      { usage: "ping", description: "Example" },
    ],
    render() {
      return <PingCommand />;
    },
    async json() {
      return getData(client.GET("/v3/ping"));
    },
  },
];

// ── Lookup map ──

export const commandMap = new Map<string, CommandDefinition>();
for (const cmd of commands) {
  commandMap.set(cmd.name, cmd);
  for (const alias of cmd.aliases ?? []) {
    commandMap.set(alias, cmd);
  }
}

// ── Help group ordering ──

const GROUP_ORDER = [
  "Channels",
  "Blocks",
  "Connections",
  "Comments",
  "Users & Groups",
  "Other",
];

export function groupedCommands(): [string, CommandDefinition[]][] {
  const groups = new Map<string, CommandDefinition[]>();
  for (const cmd of commands) {
    const list = groups.get(cmd.group) ?? [];
    list.push(cmd);
    groups.set(cmd.group, list);
  }
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => [
    g,
    groups.get(g)!,
  ]);
}

export const commandHelpDocs: Record<string, CommandHelpDoc> = {
  login: {
    summary: "Authenticate your Are.na account via OAuth.",
    usage: ["arena login", "arena login --token <token>"],
    options: [
      {
        flag: "--token <token>",
        description: "Use an existing token directly",
      },
    ],
    examples: ["arena login"],
    seeAlso: ["whoami", "logout"],
  },
  whoami: {
    summary: "Show your authenticated user profile.",
    usage: ["arena whoami"],
    examples: ["arena whoami", "arena whoami --json"],
    seeAlso: ["login", "logout"],
  },
  logout: {
    summary: "Clear the locally stored access token.",
    usage: ["arena logout"],
    examples: ["arena logout"],
    seeAlso: ["login"],
  },
  search: {
    summary: "Search across Are.na blocks, channels, users, and groups.",
    usage: ["arena search <query> [flags]"],
    options: [
      { flag: "--page <n>", description: "Page number (default: 1)" },
      { flag: "--per <n>", description: "Results per page (default: 24)" },
      {
        flag: "--type <t>",
        description:
          "Type filter (Text, Image, Link, Attachment, Embed, Channel, Block, User, Group)",
      },
      { flag: "--scope <all|my|following>", description: "Search scope" },
      {
        flag: "--sort <s>",
        description:
          "Sort order (score_desc, created_at_desc, created_at_asc, updated_at_desc, updated_at_asc, name_asc, name_desc, connections_count_desc, random)",
      },
      {
        flag: "--ext <ext>",
        description: "File extension filter (pdf, jpg, png, ...)",
      },
      {
        flag: "--after <iso8601>",
        description: "Only results updated after timestamp",
      },
      {
        flag: "--seed <n>",
        description: "Random seed (use with --sort random)",
      },
      {
        flag: "--user-id <id>",
        description: "Limit to a specific user's content",
      },
      {
        flag: "--group-id <id>",
        description: "Limit to a specific group's content",
      },
      {
        flag: "--channel-id <id>",
        description: "Limit to a specific channel's content",
      },
    ],
    examples: [
      'arena search "brutalist architecture"',
      'arena search "photography" --type Image',
      'arena search "*" --sort random --seed 42',
      'arena search "*" --channel-id 789 --ext pdf',
    ],
    seeAlso: ["channel", "user", "group"],
  },
  channel: {
    summary: "View and manage channels.",
    usage: ["arena channel <slug>", "arena channel <subcommand> ..."],
    examples: [
      "arena channel worldmaking",
      "arena channel contents worldmaking --sort updated_at_desc",
      'arena channel create "My Research" --visibility private',
    ],
    subcommands: {
      contents: {
        summary: "List channel contents with pagination and filtering.",
        usage: ["arena channel contents <slug> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--sort <s>", description: "Sort order" },
          {
            flag: "--user-id <id>",
            description: "Limit to a specific user within the channel",
          },
        ],
        examples: [
          "arena channel contents worldmaking --sort updated_at_desc --user-id 123",
        ],
      },
      create: {
        summary: "Create a channel.",
        usage: ["arena channel create <title> [flags]"],
        options: [
          {
            flag: "--visibility <public|private|closed>",
            description: "Channel visibility",
          },
          { flag: "--description <text>", description: "Optional description" },
          {
            flag: "--group-id <id>",
            description: "Create channel under a group",
          },
          {
            flag: "--metadata <json|key=value>",
            description: "Custom channel metadata",
          },
        ],
        examples: [
          'arena channel create "Team Notes" --group-id 123 --metadata status=draft',
        ],
      },
      update: {
        summary: "Update a channel.",
        usage: ["arena channel update <slug> [flags]"],
        options: [
          { flag: "--title <text>", description: "New title" },
          { flag: "--description <text>", description: "New description" },
          {
            flag: "--visibility <public|private|closed>",
            description: "New visibility",
          },
          {
            flag: "--metadata <json|key=value>",
            description: "Merge channel metadata; use null to remove keys",
          },
        ],
        examples: [
          'arena channel update my-research --title "New Title" --metadata status=published',
        ],
      },
      delete: {
        summary: "Delete a channel.",
        usage: ["arena channel delete <slug>"],
        examples: ["arena channel delete my-research"],
      },
      connections: {
        summary: "Show where a channel appears.",
        usage: ["arena channel connections <slug> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--sort <s>", description: "Sort order" },
        ],
        examples: [
          "arena channel connections worldmaking --sort connected_at_desc",
        ],
      },
      followers: {
        summary: "List channel followers.",
        usage: ["arena channel followers <slug> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--sort <s>", description: "Sort order" },
        ],
        examples: [
          "arena channel followers worldmaking --sort connected_at_desc",
        ],
      },
    },
    seeAlso: ["search", "add", "connect"],
  },
  block: {
    summary: "View and manage blocks.",
    usage: ["arena block <id>", "arena block <subcommand> ..."],
    examples: [
      "arena block 12345",
      "arena block comments 12345 --sort connected_at_desc",
    ],
    subcommands: {
      update: {
        summary: "Update a block's metadata or content.",
        usage: ["arena block update <id> [flags]"],
        options: [
          { flag: "--title <text>", description: "New title" },
          { flag: "--description <text>", description: "New description" },
          { flag: "--content <text>", description: "Text content" },
          { flag: "--alt-text <text>", description: "Image alt text" },
          {
            flag: "--metadata <json|key=value>",
            description: "Merge block metadata; use null to remove keys",
          },
        ],
        examples: [
          'arena block update 12345 --title "New Title" --metadata status=reviewed',
        ],
      },
      comments: {
        summary: "List comments on a block.",
        usage: ["arena block comments <id> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--sort <s>", description: "Sort order" },
        ],
        examples: ["arena block comments 12345 --sort connected_at_desc"],
      },
      connections: {
        summary: "Show channels connected to a block.",
        usage: ["arena block connections <id> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--sort <s>", description: "Sort order" },
          {
            flag: "--filter <ALL|OWN|EXCLUDE_OWN>",
            description: "Connection filter",
          },
        ],
        examples: [
          "arena block connections 12345 --sort connected_at_desc --filter OWN",
        ],
      },
    },
    seeAlso: ["add", "connect", "comment"],
  },
  add: {
    summary: "Add text or URL content to a channel.",
    usage: ["arena add <channel> <value> [flags]"],
    options: [
      { flag: "--title <text>", description: "Optional block title" },
      {
        flag: "--description <text>",
        description: "Optional block description",
      },
      { flag: "--alt-text <text>", description: "Image alt text" },
      {
        flag: "--original-source-url <url>",
        description: "Original source URL",
      },
      {
        flag: "--original-source-title <text>",
        description: "Original source title",
      },
      {
        flag: "--insert-at <n>",
        description: "Insert position within the channel",
      },
      {
        flag: "--metadata <json|key=value>",
        description: "Custom block metadata",
      },
      {
        flag: "--connection-metadata <json|key=value>",
        description: "Metadata for the channel connection",
      },
    ],
    examples: [
      'arena add my-channel "Hello world"',
      'arena add my-channel https://example.com --alt-text "Cover image" --insert-at 1 --metadata status=reviewed',
      'echo "piped text" | arena add my-channel',
    ],
    seeAlso: ["upload", "batch", "channel"],
  },
  upload: {
    summary: "Upload a local file and add it as a block.",
    usage: ["arena upload <file> --channel <slug|id> [flags]"],
    options: [
      { flag: "--channel <slug|id>", description: "Target channel (required)" },
      { flag: "--title <text>", description: "Optional block title" },
      {
        flag: "--description <text>",
        description: "Optional block description",
      },
    ],
    examples: ["arena upload photo.jpg --channel my-channel"],
    seeAlso: ["add", "batch", "import"],
  },
  batch: {
    summary: "Create many blocks asynchronously.",
    usage: [
      "arena batch <channel> [values...] [flags]",
      "arena batch status <batch_id>",
    ],
    options: [
      { flag: "--title <text>", description: "Default title for each block" },
      {
        flag: "--description <text>",
        description: "Default description for each block",
      },
    ],
    examples: [
      'arena batch my-channel "https://a.com" "https://b.com"',
      "arena batch status 1234",
    ],
    seeAlso: ["add", "import"],
  },
  import: {
    summary: "Bulk import local files into a channel.",
    usage: ["arena import <channel> [flags]"],
    options: [
      { flag: "--dir <path>", description: "Directory to scan (default: .)" },
      { flag: "--recursive", description: "Scan directories recursively" },
      {
        flag: "--interactive",
        description: "Pick files interactively before import",
      },
      {
        flag: "--batch-size <n>",
        description: "Batch size for async create calls",
      },
      {
        flag: "--upload-concurrency <n>",
        description: "Concurrent file uploads",
      },
      {
        flag: "--poll-interval <ms>",
        description: "Batch status polling interval",
      },
    ],
    examples: [
      "arena import my-channel --dir ./assets --recursive",
      "arena import my-channel --interactive",
    ],
    seeAlso: ["upload", "batch"],
  },
  connect: {
    summary: "Connect a block or channel to a channel.",
    usage: ["arena connect <id> <channel> [flags]"],
    options: [
      { flag: "--type <Block|Channel>", description: "Connectable type" },
      { flag: "--position <n>", description: "Insertion position" },
      {
        flag: "--metadata <json|key=value>",
        description: "Metadata for the created connection",
      },
    ],
    examples: [
      "arena connect 12345 my-channel --type Channel --position 1 --metadata status=reviewed",
    ],
    seeAlso: ["connection", "block", "channel"],
  },
  connection: {
    summary: "Inspect, update, move, or delete a connection.",
    usage: [
      "arena connection <id>",
      "arena connection update <id> --metadata <json|key=value>",
      "arena connection delete <id>",
      "arena connection move <id> [flags]",
    ],
    options: [
      {
        flag: "--movement <move_to_top|move_to_bottom|insert_at>",
        description: "Move strategy (for move subcommand)",
      },
      {
        flag: "--position <n>",
        description: "Target position (for move subcommand)",
      },
      {
        flag: "--metadata <json|key=value>",
        description: "Merge metadata for update; use null to remove keys",
      },
    ],
    examples: [
      "arena connection 67890",
      "arena connection update 67890 --metadata status=reviewed",
      "arena connection move 67890 --movement insert_at --position 1",
    ],
    seeAlso: ["connect"],
  },
  comment: {
    summary: "Create or delete comments.",
    usage: ["arena comment <blockId> <text>", "arena comment delete <id>"],
    examples: ['arena comment 12345 "Nice find"', "arena comment delete 67890"],
    seeAlso: ["block"],
  },
  user: {
    summary: "View users and user relationships.",
    usage: ["arena user <slug>", "arena user <subcommand> ..."],
    examples: [
      "arena user damon-zucconi",
      "arena user contents damon-zucconi --type Image --sort updated_at_desc",
    ],
    subcommands: {
      contents: {
        summary: "List a user's published content.",
        usage: ["arena user contents <slug> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--type <t>", description: "Content type filter" },
          { flag: "--sort <s>", description: "Sort order" },
        ],
        examples: [
          "arena user contents damon-zucconi --type Image --sort updated_at_desc",
        ],
      },
      followers: {
        summary: "List a user's followers.",
        usage: ["arena user followers <slug> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--sort <s>", description: "Sort order" },
        ],
        examples: [
          "arena user followers damon-zucconi --sort connected_at_desc",
        ],
      },
      following: {
        summary: "List who a user follows.",
        usage: ["arena user following <slug> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--type <t>", description: "Filter followable type" },
          { flag: "--sort <s>", description: "Sort order" },
        ],
        examples: [
          "arena user following damon-zucconi --type User --sort connected_at_desc",
        ],
      },
      groups: {
        summary: "List groups a user belongs to.",
        usage: ["arena user groups <slug> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--sort <s>", description: "Sort order" },
        ],
        examples: ["arena user groups damon-zucconi --sort updated_at_desc"],
      },
    },
    seeAlso: ["group", "search"],
  },
  group: {
    summary: "View groups and group activity.",
    usage: ["arena group <slug>", "arena group <subcommand> ..."],
    examples: [
      "arena group are-na-team",
      "arena group contents are-na-team --type Image --sort updated_at_desc",
    ],
    subcommands: {
      contents: {
        summary: "List group content.",
        usage: ["arena group contents <slug> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--type <t>", description: "Content type filter" },
          { flag: "--sort <s>", description: "Sort order" },
        ],
        examples: [
          "arena group contents are-na-team --type Image --sort updated_at_desc",
        ],
      },
      followers: {
        summary: "List group followers.",
        usage: ["arena group followers <slug> [flags]"],
        options: [
          { flag: "--page <n>", description: "Page number" },
          { flag: "--per <n>", description: "Items per page" },
          { flag: "--sort <s>", description: "Sort order" },
        ],
        examples: [
          "arena group followers are-na-team --sort connected_at_desc",
        ],
      },
    },
    seeAlso: ["user", "search"],
  },
  ping: {
    summary: "Check API health.",
    usage: ["arena ping"],
    examples: ["arena ping", "arena ping --json"],
  },
  version: {
    summary: "Show CLI version.",
    usage: ["arena version"],
    examples: ["arena version"],
  },
  update: {
    summary: "Check for and install CLI updates.",
    usage: ["arena update [--yes]"],
    options: [{ flag: "--yes", description: "Install update without prompt" }],
    examples: ["arena update", "arena update --yes"],
  },
};
