import { commands as registry } from "../../lib/registry";

export interface SessionCommand {
  name: string;
  args: string | null;
  desc: string;
}

const SESSION_COMMANDS: SessionCommand[] = registry
  .filter((cmd) => cmd.session)
  .map((cmd) => ({
    name: cmd.name,
    args: cmd.session!.args,
    desc: cmd.session!.desc,
  }));

const SEARCH_COMMAND = SESSION_COMMANDS.find((cmd) => cmd.name === "search");
const OTHER_SESSION_COMMANDS = SESSION_COMMANDS.filter(
  (cmd) => cmd.name !== "search",
);

export const COMMANDS: SessionCommand[] = [
  ...(SEARCH_COMMAND ? [SEARCH_COMMAND] : []),
  ...OTHER_SESSION_COMMANDS,
  { name: "channels", args: null, desc: "Your channels" },
  { name: "exit", args: null, desc: "Exit session" },
];

export const ARG_HINTS: Record<string, string> = {
  "<slug>": "enter channel slug",
  "<query>": "enter search query",
  "<id>": "enter block ID",
};
