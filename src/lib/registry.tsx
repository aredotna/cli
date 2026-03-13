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
  UserViewCommand,
} from "../commands/user";
import { VersionCommand } from "../commands/version";
import { WhoamiCommand } from "../commands/whoami";
import { config } from "./config";
import type { DestructiveCommandConfig } from "./destructive-confirmation";
import { uploadLocalFile } from "./upload";
import { CLI_PACKAGE_NAME, getCliVersion } from "./version";

interface HelpLine {
  usage: string;
  description: string;
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
      { usage: "channel <slug>", description: "View a channel" },
      {
        usage: "channel contents <slug>",
        description: "Channel contents (paginated)",
      },
      {
        usage: "channel contents <slug> --sort updated_at_desc --user-id 123",
        description: "Sort/filter channel contents",
      },
      {
        usage: "channel create <title> --visibility private --group-id 123",
        description: "Create a channel (optionally in a group)",
      },
      {
        usage:
          'channel update <slug> --title "New title" --description "Updated"',
        description: "Update channel metadata",
      },
      { usage: "channel delete <slug>", description: "Delete a channel" },
      {
        usage: "channel connections <slug> --sort connected_at_desc",
        description: "Where channel appears (sortable)",
      },
      {
        usage: "channel followers <slug> --sort connected_at_desc",
        description: "Channel followers (sortable)",
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
            />
          );
        case "update":
          return (
            <ChannelUpdateCommand
              slug={requireArg(args, 1, "slug")}
              title={flag(flags, "title")}
              visibility={visibility}
              description={flag(flags, "description")}
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
      { usage: "block <id>", description: "View a block" },
      {
        usage: 'block update <id> --title "New" --description "Updated"',
        description: "Update block metadata/content",
      },
      {
        usage: "block comments <id> --sort connected_at_desc",
        description: "View block comments (sortable)",
      },
      {
        usage: "block connections <id> --sort connected_at_desc --filter OWN",
        description: "Where block appears (sortable/filterable)",
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
      { usage: "search <query>", description: "Search Are.na" },
      {
        usage: "search <query> --type Image",
        description:
          "Filter by type (Text, Image, Link, Attachment, Embed, Channel, Block, User, Group)",
      },
      {
        usage: "search <query> --scope my",
        description: "Limit scope (all, my, following)",
      },
      {
        usage: "search <query> --sort created_at_desc",
        description:
          "Sort order (score_desc, created_at_desc, created_at_asc, updated_at_desc, updated_at_asc, name_asc, name_desc, connections_count_desc, random)",
      },
      {
        usage: "search <query> --ext pdf",
        description: "Filter by file extension",
      },
      {
        usage: "search <query> --after 2024-01-01T00:00:00Z",
        description: "Only results updated after timestamp (ISO 8601)",
      },
      {
        usage: "search <query> --channel-id 789",
        description:
          "Limit to a channel (--user-id, --group-id also available)",
      },
      {
        usage: "search <query> --sort random --seed 42",
        description: "Reproducible random ordering",
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
        usage: "add <channel> <value>",
        description: "Add content to a channel",
      },
      {
        usage: 'add <channel> <value> --title "Title" --description "Notes"',
        description: "Add with title/description",
      },
      {
        usage: 'add <channel> <value> --alt-text "Accessible text"',
        description: "Add image alt text",
      },
      {
        usage:
          'add <channel> <value> --original-source-url <url> --original-source-title "Source"',
        description: "Attach original source metadata",
      },
      {
        usage: "add <channel> <value> --insert-at 1",
        description: "Insert at a specific position",
      },
    ],
    render(args, flags) {
      const value = requireArg([args.slice(1).join(" ")], 0, "value");
      return (
        <AddCommand
          channel={requireArg(args, 0, "channel")}
          value={value}
          title={flag(flags, "title")}
          description={flag(flags, "description")}
          altText={flag(flags, "alt-text")}
          originalSourceUrl={flag(flags, "original-source-url")}
          originalSourceTitle={flag(flags, "original-source-title")}
          insertAt={intFlag(flags, "insert-at")}
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

      return getData(
        client.POST("/v3/blocks", {
          body: {
            value,
            channel_ids: [ch.id],
            title: flag(flags, "title"),
            description: flag(flags, "description"),
            alt_text: flag(flags, "alt-text"),
            original_source_url: flag(flags, "original-source-url"),
            original_source_title: flag(flags, "original-source-title"),
            insert_at: intFlag(flags, "insert-at"),
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
        usage: "upload <file> --channel <ch>",
        description: "Upload a file",
      },
      {
        usage:
          'upload <file> --channel <ch> --title "Title" --description "Notes"',
        description: "Upload with metadata",
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
        usage: "batch <channel> [values...]",
        description: "Batch create blocks (async)",
      },
      {
        usage: "batch status <batch_id>",
        description: "Check batch status",
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
        usage: "import <channel>",
        description: "Import files from a directory (defaults to .)",
      },
      {
        usage: "import <channel> --interactive",
        description: "Open interactive file picker before importing",
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
        usage: "connect <id> <channel>",
        description: "Connect block to channel",
      },
      {
        usage: "connect <id> <channel> --type Channel --position 1",
        description: "Set connectable type and insertion position",
      },
    ],
    render(args, flags) {
      return (
        <ConnectCommand
          blockId={idArg(args, 0, "block id")}
          channel={requireArg(args, 1, "channel")}
          connectableType={flagAs<"Block" | "Channel">(flags, "type")}
          position={intFlag(flags, "position")}
        />
      );
    },
    async json(args, flags) {
      await client.POST("/v3/connections", {
        body: {
          connectable_id: idArg(args, 0, "block id"),
          channel_ids: [requireArg(args, 1, "channel")],
          connectable_type:
            flagAs<"Block" | "Channel">(flags, "type") || "Block",
          position: intFlag(flags, "position"),
        },
      });
      return { connected: true };
    },
  },

  {
    name: "connection",
    aliases: [],
    group: "Connections",
    help: [
      { usage: "connection <id>", description: "View a connection" },
      { usage: "connection delete <id>", description: "Remove a connection" },
      {
        usage: "connection move <id> --movement move_to_top",
        description: "Reposition a connection",
      },
      {
        usage: "connection move <id> --movement insert_at --position 1",
        description: "Move connection to explicit position",
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
        description: "Add a comment",
      },
      { usage: "comment delete <id>", description: "Delete a comment" },
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
      { usage: "user <slug>", description: "View a user" },
      {
        usage: "user contents <slug> --type Image --sort updated_at_desc",
        description: "User's content (filter/sort)",
      },
      {
        usage: "user followers <slug> --sort connected_at_desc",
        description: "User's followers (sortable)",
      },
      {
        usage: "user following <slug> --type User --sort connected_at_desc",
        description: "Who user follows (filter/sort)",
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
      { usage: "group <slug>", description: "View a group" },
      {
        usage: "group contents <slug> --type Image --sort updated_at_desc",
        description: "Group's content (filter/sort)",
      },
      {
        usage: "group followers <slug> --sort connected_at_desc",
        description: "Group's followers (sortable)",
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
    help: [{ usage: "version", description: "Show CLI version" }],
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
      { usage: "update", description: "Check for a newer CLI version" },
      { usage: "update --yes", description: "Install latest CLI globally" },
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
    help: [{ usage: "whoami", description: "Show current user" }],
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
    help: [{ usage: "login", description: "Authenticate via OAuth" }],
    render(args, flags) {
      return <LoginCommand token={flag(flags, "token") || args[0]} />;
    },
  },

  {
    name: "logout",
    aliases: [],
    group: "Other",
    help: [{ usage: "logout", description: "Log out of your account" }],
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
    help: [{ usage: "ping", description: "API health check" }],
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
