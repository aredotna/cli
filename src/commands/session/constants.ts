import { SESSION_ARG_HINTS, SESSION_COMMAND_SPECS } from "./command-specs";

export interface SessionCommand {
  name: string;
  args: string | null;
  desc: string;
  displayName?: string;
}

const SESSION_ORDER = [
  "search",
  "channel",
  "channels",
  "block",
  "user",
  "group",
  "whoami",
  "home",
  "back",
  "browser",
  "logout",
  "exit",
] as const;

const ORDER_INDEX = new Map<string, number>(
  SESSION_ORDER.map((name, idx) => [name, idx]),
);

export const COMMANDS: SessionCommand[] = [...SESSION_COMMAND_SPECS]
  .sort((a, b) => {
    const aIndex = ORDER_INDEX.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = ORDER_INDEX.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || a.name.localeCompare(b.name);
  })
  .map((command) => ({
    name: command.name,
    args: command.args,
    desc: command.desc,
    displayName: command.displayName,
  }));

export const ARG_HINTS = SESSION_ARG_HINTS;
