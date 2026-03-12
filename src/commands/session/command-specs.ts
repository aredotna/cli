import type { User } from "../../api/types";
import { parsePositiveInt } from "../../lib/args";
import { commands as registry } from "../../lib/registry";
import type { SessionView } from "./session-view";

export interface CommandSpecContext {
  me: User;
  view: SessionView;
  navigate: (view: SessionView) => void;
  back: () => void;
  logout: () => void;
  exit: () => void;
  openBrowser: () => void;
}

export interface CommandSpec {
  name: string;
  aliases?: string[];
  args: string | null;
  desc: string;
  displayName?: string;
  when?: (view: SessionView) => boolean;
  run: (context: CommandSpecContext, arg: string) => void;
}

const REGISTRY_SESSION_COMMANDS = new Map(
  registry
    .filter((command) => command.session)
    .map((command) => [
      command.name,
      {
        args: command.session!.args,
        desc: command.session!.desc,
      },
    ]),
);

function fromRegistry(
  name: string,
  fallback: { args: string | null; desc: string },
) {
  return REGISTRY_SESSION_COMMANDS.get(name) ?? fallback;
}

function requireArg(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

export const SESSION_COMMAND_SPECS: CommandSpec[] = [
  {
    name: "search",
    aliases: ["find"],
    ...fromRegistry("search", { args: "<query>", desc: "Search Are.na" }),
    run: (context, arg) => {
      context.navigate({
        kind: "search",
        query: requireArg(arg, "Search query"),
      });
    },
  },
  {
    name: "channel",
    aliases: ["ch"],
    ...fromRegistry("channel", { args: "<slug>", desc: "Browse a channel" }),
    run: (context, arg) => {
      context.navigate({
        kind: "channel",
        slug: requireArg(arg, "Channel slug"),
      });
    },
  },
  {
    name: "channels",
    aliases: ["library", "mine"],
    args: null,
    desc: "Browse your channels",
    displayName: "your channels",
    run: (context) => {
      context.navigate({ kind: "channels" });
    },
  },
  {
    name: "block",
    aliases: ["bl"],
    ...fromRegistry("block", { args: "<id>", desc: "View a block" }),
    run: (context, arg) => {
      const id = parsePositiveInt(requireArg(arg, "Block ID"), "block id");
      context.navigate({ kind: "block", blockIds: [id], index: 0 });
    },
  },
  {
    name: "user",
    aliases: ["profile"],
    ...fromRegistry("user", { args: "<slug>", desc: "View a user" }),
    run: (context, arg) => {
      context.navigate({
        kind: "userProfile",
        slug: requireArg(arg, "User slug"),
      });
    },
  },
  {
    name: "group",
    ...fromRegistry("group", { args: "<slug>", desc: "View a group" }),
    run: (context, arg) => {
      context.navigate({
        kind: "groupProfile",
        slug: requireArg(arg, "Group slug"),
      });
    },
  },
  {
    name: "whoami",
    aliases: ["me"],
    ...fromRegistry("whoami", { args: null, desc: "View your profile" }),
    run: (context) => {
      context.navigate({ kind: "whoami" });
    },
  },
  {
    name: "home",
    aliases: ["start"],
    args: null,
    desc: "Return to home",
    when: (view) => view.kind !== "home",
    run: (context) => {
      context.navigate({ kind: "home" });
    },
  },
  {
    name: "back",
    aliases: ["pop"],
    args: null,
    desc: "Go back one screen",
    when: (view) => view.kind !== "home",
    run: (context) => {
      context.back();
    },
  },
  {
    name: "browser",
    aliases: ["open"],
    args: null,
    desc: "Open current view in browser",
    when: (view) => view.kind !== "home" && view.kind !== "search",
    run: (context) => {
      context.openBrowser();
    },
  },
  {
    name: "logout",
    ...fromRegistry("logout", { args: null, desc: "Log out" }),
    run: (context) => {
      context.logout();
    },
  },
  {
    name: "exit",
    args: null,
    desc: "Exit session",
    run: (context) => {
      context.exit();
    },
  },
];

export function getAvailableSessionCommands(view: SessionView): CommandSpec[] {
  return SESSION_COMMAND_SPECS.filter(
    (command) => command.when?.(view) ?? true,
  );
}

export const SESSION_ARG_HINTS: Record<string, string> = {
  "<slug>": "enter slug",
  "<query>": "enter search query",
  "<id>": "enter block ID",
};
