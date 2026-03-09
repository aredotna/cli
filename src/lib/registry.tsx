import React from "react";
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
import { client, getData } from "../api/client";
import {
  flag,
  flagAs,
  idArg,
  intFlag,
  optPage,
  optPer,
  page,
  per,
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
import { PingCommand } from "../commands/ping";
import { SearchCommand } from "../commands/search";
import { UploadCommand } from "../commands/upload";
import {
  UserContentsCommand,
  UserFollowersCommand,
  UserFollowingCommand,
  UserViewCommand,
} from "../commands/user";
import { WhoamiCommand } from "../commands/whoami";
import { config } from "./config";
import { uploadLocalFile } from "./upload";

interface HelpLine {
  usage: string;
  description: string;
}

export interface CommandDefinition {
  name: string;
  aliases?: string[];
  group: string;
  help: HelpLine[];
  render: (args: string[], flags: Flags) => React.JSX.Element;
  json?: (args: string[], flags: Flags) => Promise<unknown>;
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
      { usage: "channel create <title>", description: "Create a channel" },
      { usage: "channel update <slug>", description: "Update a channel" },
      { usage: "channel delete <slug>", description: "Delete a channel" },
      {
        usage: "channel connections <slug>",
        description: "Where channel appears",
      },
      { usage: "channel followers <slug>", description: "Channel followers" },
    ],
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
            />
          );
        case "connections":
          return (
            <ChannelConnectionsCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
            />
          );
        case "followers":
          return (
            <ChannelFollowersCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
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
      { usage: "block update <id>", description: "Update a block" },
      { usage: "block comments <id>", description: "View block comments" },
      { usage: "block connections <id>", description: "Where block appears" },
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
            />
          );
        case "connections":
          return (
            <BlockConnectionsCommand
              id={idArg(args, 1, "block id")}
              page={optPage(flags)}
              per={optPer(flags)}
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
    help: [{ usage: "search <query>", description: "Search Are.na" }],
    session: { args: "<query>", desc: "Search Are.na" },
    render(args, flags) {
      const query = requireArg([args.join(" ")], 0, "query");
      return (
        <SearchCommand
          query={query}
          page={optPage(flags)}
          per={optPer(flags)}
          type={flag(flags, "type")}
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
    ],
    render(args, flags) {
      const value = requireArg([args.slice(1).join(" ")], 0, "value");
      return (
        <AddCommand
          channel={requireArg(args, 0, "channel")}
          value={value}
          description={flag(flags, "description")}
        />
      );
    },
    async json(args, flags) {
      const ch = await getData(
        client.GET("/v3/channels/{id}", {
          params: { path: { id: requireArg(args, 0, "channel") } },
        }),
      );
      return getData(
        client.POST("/v3/blocks", {
          body: {
            value: requireArg([args.slice(1).join(" ")], 0, "value"),
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
    name: "connect",
    aliases: [],
    group: "Connections",
    help: [
      {
        usage: "connect <id> <channel>",
        description: "Connect block to channel",
      },
    ],
    render(args) {
      return (
        <ConnectCommand
          blockId={idArg(args, 0, "block id")}
          channel={requireArg(args, 1, "channel")}
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
        usage: "connection move <id>",
        description: "Reposition a connection",
      },
    ],
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
      { usage: "user contents <slug>", description: "User's content" },
      { usage: "user followers <slug>", description: "User's followers" },
      { usage: "user following <slug>", description: "Who user follows" },
    ],
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
            />
          );
        case "followers":
          return (
            <UserFollowersCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
            />
          );
        case "following":
          return (
            <UserFollowingCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
              type={flag(flags, "type")}
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
      { usage: "group contents <slug>", description: "Group's content" },
      { usage: "group followers <slug>", description: "Group's followers" },
    ],
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
            />
          );
        case "followers":
          return (
            <GroupFollowersCommand
              slug={requireArg(args, 1, "slug")}
              page={optPage(flags)}
              per={optPer(flags)}
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
    name: "whoami",
    aliases: ["me"],
    group: "Other",
    help: [{ usage: "whoami", description: "Show current user" }],
    render() {
      return <WhoamiCommand />;
    },
    async json() {
      return getData(client.GET("/v3/me"));
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
