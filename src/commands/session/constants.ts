import { commands as registry } from "../../lib/registry";

export interface SessionCommand {
  name: string;
  args: string | null;
  desc: string;
  displayName?: string;
}

const SESSION_COMMANDS: SessionCommand[] = registry
  .filter((cmd) => cmd.session)
  .map((cmd) => ({
    name: cmd.name,
    args: cmd.session!.args,
    desc: cmd.session!.desc,
  }));

const SESSION_ORDER = [
  "search",
  "channels",
  "channel",
  "block",
  "user",
  "group",
  "whoami",
  "logout",
] as const;

const ORDER_INDEX = new Map<string, number>(
  SESSION_ORDER.map((name, idx) => [name, idx]),
);
const SESSION_ORDER_SET = new Set<string>(SESSION_ORDER);

const ORDERED_SESSION_COMMANDS = SESSION_COMMANDS.filter((cmd) =>
  SESSION_ORDER_SET.has(cmd.name),
).sort((a, b) => {
  const aIndex = ORDER_INDEX.get(a.name) ?? Number.MAX_SAFE_INTEGER;
  const bIndex = ORDER_INDEX.get(b.name) ?? Number.MAX_SAFE_INTEGER;
  return aIndex - bIndex || a.name.localeCompare(b.name);
});

export const COMMANDS: SessionCommand[] = [
  ...ORDERED_SESSION_COMMANDS,
  {
    name: "channels",
    args: null,
    desc: "Browse your channels",
    displayName: "your channels",
  },
  { name: "exit", args: null, desc: "Exit session" },
].filter(
  (cmd, index, list) =>
    list.findIndex((entry) => entry.name === cmd.name) === index,
);

export const ARG_HINTS: Record<string, string> = {
  "<slug>": "enter slug",
  "<query>": "enter search query",
  "<id>": "enter block ID",
};
